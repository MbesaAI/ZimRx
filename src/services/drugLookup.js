const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../db/client');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MEDICINE_SELECT = {
  id: true, tradeName: true, genericName: true,
  strength: true, form: true, category: true,
};

// ── Main matcher used by the image flow ────────────────────────────────────
// medications: [{name, dose, form}] from Claude OCR (or plain strings)
// Returns { matched: McazRecord[], notInMCAZ: string[] }
//   matched    — MCAZ register records Claude confirmed as the right drug
//   notInMCAZ  — drug names Claude extracted but couldn't find in the register

async function matchMedications(medications) {
  if (!medications || medications.length === 0) return { matched: [], notInMCAZ: [] };

  // Step 1 — fetch DB candidates for each extracted drug name
  const withCandidates = await Promise.all(
    medications.map(async med => {
      const name = (typeof med === 'object' ? med.name : med)?.trim() || '';
      if (!name) return { med, name, candidates: [] };

      // Try startsWith first (precise); fall back to contains (catches brand names, compound drugs)
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

  // Split into matchable (has candidates) and notInMCAZ (no candidates at all)
  const matchable  = withCandidates.filter(m => m.candidates.length > 0);
  const notInMCAZ  = withCandidates
    .filter(m => m.candidates.length === 0 && m.name)
    .map(m => {
      const med = m.med;
      return typeof med === 'object'
        ? [med.name, med.dose, med.form].filter(Boolean).join(' ')
        : m.name;
    });

  console.log(`[drugLookup] ${medications.length} meds — ${matchable.length} matchable, ${notInMCAZ.length} not in MCAZ`);

  if (matchable.length === 0) return { matched: [], notInMCAZ };

  // Step 2 — ask Claude to pick the single best MCAZ match for each medication
  const prompt = `You are a clinical pharmacist verifying prescriptions against the Zimbabwe MCAZ medicines register.

For each prescribed medication, select the SINGLE best-matching MCAZ candidate by drug name, dose and form.
Return -1 only if NO candidate is even remotely the same drug.

${matchable.map((item, i) => {
  const med    = item.med;
  const detail = typeof med === 'object'
    ? [med.name, med.dose, med.form].filter(Boolean).join(' ')
    : med;
  const lines  = item.candidates
    .map((c, j) => `  [${j}] genericName="${c.genericName || ''}" tradeName="${c.tradeName || ''}" strength="${c.strength || ''}" form="${c.form || ''}"`)
    .join('\n');
  return `PRESCRIPTION ${i}: ${detail}\nCANDIDATES:\n${lines}`;
}).join('\n\n')}

Return a JSON array with one object per prescription in order:
[{"index":0,"matchIndex":0},{"index":1,"matchIndex":-1},...]
- "index": prescription number (0-based, matches PRESCRIPTION N above)
- "matchIndex": chosen candidate index, or -1 if truly no match

Return ONLY the JSON array, no other text.`;

  let matchIndexMap = {};
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw = (response.content[0]?.text || '').replace(/```(?:json)?\s*/gi, '').trim();
    console.log('[drugLookup] Claude matching raw:', raw.slice(0, 400));
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      for (const m of JSON.parse(jsonMatch[0])) {
        if (typeof m.index === 'number') matchIndexMap[m.index] = m.matchIndex ?? 0;
      }
    }
  } catch (err) {
    console.error('[drugLookup] Claude matching error:', err.message);
  }

  // Step 3 — resolve every matchable medication.
  // If Claude omitted a drug or returned -1, fall back to the first DB candidate
  // so we never silently drop a drug from a multi-medicine prescription.
  const resolved = matchable.map((item, i) => {
    const chosenIdx = matchIndexMap.hasOwnProperty(i) ? matchIndexMap[i] : 0;
    return item.candidates[chosenIdx >= 0 ? chosenIdx : 0] || null;
  });

  return { matched: dedup(resolved), notInMCAZ };
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
