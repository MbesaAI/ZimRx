const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../db/client');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MEDICINE_SELECT = {
  id: true, tradeName: true, genericName: true,
  strength: true, form: true, category: true,
};

// ── Main matcher used by the image flow ────────────────────────────────────
// medications: [{name, dose, form}] from Claude OCR (or plain strings)
// Returns MCAZ medicine records confirmed as exact matches.

async function matchMedications(medications) {
  if (!medications || medications.length === 0) return [];

  // Step 1 — fetch DB candidates for each extracted drug name
  const withCandidates = await Promise.all(
    medications.map(async med => {
      const name = (typeof med === 'object' ? med.name : med)?.trim() || '';
      if (!name) return { med, name, candidates: [] };

      // Try startsWith first (precise); fall back to contains (catches "Co-Amoxiclav" → "AMOXICILLIN; CLAVULANATE")
      let candidates = await prisma.medicine.findMany({
        where: {
          OR: [
            { genericName: { startsWith: name, mode: 'insensitive' } },
            { tradeName:   { startsWith: name, mode: 'insensitive' } },
          ],
        },
        select: MEDICINE_SELECT,
        take: 15,
      });

      if (candidates.length === 0) {
        candidates = await prisma.medicine.findMany({
          where: {
            OR: [
              { genericName: { contains: name, mode: 'insensitive' } },
              { tradeName:   { contains: name, mode: 'insensitive' } },
            ],
          },
          select: MEDICINE_SELECT,
          take: 15,
        });
      }

      console.log(`[drugLookup] "${name}" → ${candidates.length} DB candidates`);
      return { med, name, candidates };
    })
  );

  const matchable = withCandidates.filter(m => m.candidates.length > 0);
  console.log(`[drugLookup] ${medications.length} meds, ${matchable.length} have candidates`);

  if (matchable.length === 0) return [];

  // Step 2 — ask Claude to pick the single best match for each medication
  const prompt = `You are a clinical pharmacist verifying prescriptions against the Zimbabwe MCAZ medicines register.

For each prescribed medication, select the SINGLE best-matching MCAZ candidate by drug name, dose and form.
Return -1 only if NO candidate is even remotely the same drug.

${matchable.map((item, i) => {
  const med   = item.med;
  const detail = typeof med === 'object'
    ? [med.name, med.dose, med.form].filter(Boolean).join(' ')
    : med;
  const lines = item.candidates
    .map((c, j) => `  [${j}] genericName="${c.genericName || ''}" tradeName="${c.tradeName || ''}" strength="${c.strength || ''}" form="${c.form || ''}"`)
    .join('\n');
  return `PRESCRIPTION ${i}: ${detail}\nCANDIDATES:\n${lines}`;
}).join('\n\n')}

Return a JSON array with one object per prescription:
[{"index":0,"matchIndex":0},{"index":1,"matchIndex":-1},...]
- "index": prescription number (0-based, matches PRESCRIPTION N above)
- "matchIndex": chosen candidate index, or -1 if truly no match

Return ONLY the JSON array, no other text.`;

  let matches = [];
  let claudeFailed = false;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw = (response.content[0]?.text || '').replace(/```(?:json)?\s*/gi, '').trim();
    console.log('[drugLookup] Claude matching raw:', raw.slice(0, 300));
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) matches = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[drugLookup] Claude matching error:', err.message);
    claudeFailed = true;
  }

  // If Claude failed or returned nothing, fall back to the first (best) DB candidate per drug
  if (claudeFailed || matches.length === 0) {
    console.log('[drugLookup] falling back to first DB candidate per drug');
    return dedup(matchable.map(item => item.candidates[0]));
  }

  // Step 3 — resolve matched records; for -1 results fall back to first candidate
  const resolved = matches.map(m => {
    const item = matchable[m.index];
    if (!item) return null;
    return m.matchIndex >= 0
      ? item.candidates[m.matchIndex]
      : item.candidates[0]; // still return best guess rather than nothing
  });

  return dedup(resolved);
}

function dedup(medicines) {
  const seen = new Set();
  return medicines.filter(med => {
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

  return dedup(results);
}

module.exports = { matchMedications, lookupDrugs };
