const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../db/client');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MEDICINE_SELECT = {
  id: true, tradeName: true, genericName: true,
  strength: true, form: true, category: true,
};

// ── Main matcher used by the image flow ────────────────────────────────────
// medications: [{name, dose, form}] from Claude OCR
// Returns MCAZ medicine records that Claude confirmed as exact matches.

async function matchMedications(medications) {
  if (!medications || medications.length === 0) return [];

  // Step 1 — fetch DB candidates for each extracted drug name
  const withCandidates = await Promise.all(
    medications.map(async med => {
      const candidates = await prisma.medicine.findMany({
        where: {
          OR: [
            { genericName: { startsWith: med.name, mode: 'insensitive' } },
            { tradeName:   { startsWith: med.name, mode: 'insensitive' } },
            { genericName: { contains:   med.name, mode: 'insensitive' } },
            { tradeName:   { contains:   med.name, mode: 'insensitive' } },
          ],
        },
        select: MEDICINE_SELECT,
        take: 15,
      });
      return { med, candidates };
    })
  );

  // Medications with no DB candidates at all — nothing to match
  const matchable = withCandidates.filter(m => m.candidates.length > 0);
  if (matchable.length === 0) return [];

  // Step 2 — send all candidates to Claude in one call; Claude picks the exact match
  const prompt = `You are a clinical pharmacist verifying prescriptions against the Zimbabwe MCAZ medicines register.

For each prescribed medication below, select the SINGLE best-matching MCAZ candidate based on drug name, dose, and form. If no candidate is a true match, return -1.

${matchable.map((item, i) => {
  const { name, dose, form } = item.med;
  const detail = [name, dose, form].filter(Boolean).join(' ');
  const candidateLines = item.candidates
    .map((c, j) => `  [${j}] genericName="${c.genericName || ''}" tradeName="${c.tradeName || ''}" strength="${c.strength || ''}" form="${c.form || ''}"`)
    .join('\n');
  return `PRESCRIPTION ${i}: ${detail}\nCANDIDATES:\n${candidateLines}`;
}).join('\n\n')}

Return a JSON array, one object per prescription, in order:
[{"index": 0, "matchIndex": 0}, {"index": 1, "matchIndex": -1}, ...]
- "index": prescription number (matches the PRESCRIPTION N label above)
- "matchIndex": candidate index, or -1 if no candidate matches

Return ONLY the JSON array.`;

  let matches = [];
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw = response.content[0]?.text?.trim() || '[]';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) matches = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Drug matching error:', err.message);
  }

  // Step 3 — resolve matched records
  const seen = new Set();
  return matches
    .filter(m => m.matchIndex >= 0 && matchable[m.index])
    .map(m => matchable[m.index].candidates[m.matchIndex])
    .filter(med => {
      if (!med) return false;
      const key = med.genericName?.toLowerCase() || med.tradeName?.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ── Fallback used by /api/translate (raw OCR text input) ──────────────────

async function lookupDrugs(ocrText) {
  if (!ocrText || ocrText.trim() === '') return [];

  const words = [...new Set(
    ocrText
      .split(/[\s\n,;:\/\(\)\.]+/)
      .map(w => w.replace(/[^a-zA-Z-]/g, '').trim())
      .filter(w => w.length >= 6)
  )];

  if (words.length === 0) return [];

  const results = await prisma.medicine.findMany({
    where: {
      OR: words.flatMap(word => ([
        { genericName: { contains: word, mode: 'insensitive' } },
        { tradeName:   { contains: word, mode: 'insensitive' } },
      ])),
    },
    select: MEDICINE_SELECT,
    take: 20,
  });

  const seen = new Set();
  return results.filter(r => {
    const key = r.genericName?.toLowerCase() || r.tradeName?.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { matchMedications, lookupDrugs };
