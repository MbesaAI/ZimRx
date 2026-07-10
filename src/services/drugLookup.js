const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../db/client');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MEDICINE_SELECT = {
  id: true, tradeName: true, genericName: true,
  strength: true, form: true, category: true,
};

// Returns all single-vowel substitution variants of a drug name.
// e.g. "flemist" → ["flamist","flimist","flomist","flumist","flemast","flemest","flemost","flemust"]
// Catches handwriting OCR errors where o/e/a/i/u are confused.
function generateVowelVariants(name) {
  const VOWELS = ['a', 'e', 'i', 'o', 'u'];
  const lower = name.toLowerCase();
  const variants = new Set();
  for (let i = 0; i < lower.length; i++) {
    if (VOWELS.includes(lower[i])) {
      for (const v of VOWELS) {
        if (v !== lower[i]) variants.add(lower.slice(0, i) + v + lower.slice(i + 1));
      }
    }
  }
  return [...variants];
}

// Asks Claude to identify the correct pharmaceutical name for each drug that
// returned zero DB candidates. Works like a "Did you mean?" — Claude knows
// "flemist nasal spray" → "Flomist", but will return null for non-medicines.
async function getLLMCorrectedNames(items) {
  if (items.length === 0) return {};

  const listed = items.map(item => {
    const med  = item.med;
    const hint = typeof med === 'object' ? [med.dose, med.form].filter(Boolean).join(' ') : '';
    return `"${item.name}"${hint ? ` (${hint})` : ''}`;
  }).join('\n');

  const prompt = `You are a clinical pharmacist. These drug names were extracted from handwritten prescriptions and could NOT be found in a medicines register. They likely have OCR or handwriting errors — vowels are commonly confused (o/e/a/i/u).

For each, return the correct pharmaceutical name that was most likely intended. Use the dosage form hint as a clue (e.g. "nasal spray" → Flomist, Avamys, or Nasonex; "ear drops" → Exocin or Otosporin; "cream" → Bactroban, Fucidin, etc.).

${listed}

Return ONLY a JSON object mapping the original name to the corrected pharmaceutical name, or null if you genuinely cannot identify a known medicine:
{"flemist": "Flomist", "exxuno": "Exocin", "unknowndrug123": null}

Return ONLY the JSON object.`;

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 256,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw = (response.content[0]?.text || '').replace(/```(?:json)?\s*/gi, '').trim();
    console.log('[drugLookup] LLM name correction raw:', raw.slice(0, 300));
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[drugLookup] LLM name correction error:', err.message);
  }
  return {};
}

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

      // Tier 3: vowel-substitution fuzzy search — catches handwriting OCR errors
      // where a/e/i/o/u are misread (e.g. "flemist" → "flomist")
      if (candidates.length === 0 && name.length >= 4) {
        const variants = generateVowelVariants(name);
        if (variants.length > 0) {
          candidates = await prisma.medicine.findMany({
            where: {
              OR: variants.flatMap(v => [
                { genericName: { startsWith: v, mode: 'insensitive' } },
                { tradeName:   { startsWith: v, mode: 'insensitive' } },
              ]),
            },
            select: MEDICINE_SELECT,
            take: 15,
          });
          if (candidates.length > 0) {
            console.log(`[drugLookup] "${name}" → fuzzy vowel match → ${candidates.length} candidates`);
          }
        }
      }

      console.log(`[drugLookup] "${name}" → ${candidates.length} DB candidates`);
      return { med, name, candidates };
    })
  );

  // Tier 4 — LLM "Did you mean?" for names still unmatched after all DB tiers.
  // Claude's pharmaceutical knowledge recognises "flemist" → "Flomist" the same
  // way Google autocorrects a misspelled search — but the result must be a
  // known medicine, not a guess. One batched call covers all unmatched names.
  const stillEmpty = withCandidates.filter(m => m.candidates.length === 0 && m.name);
  if (stillEmpty.length > 0) {
    const corrections = await getLLMCorrectedNames(stillEmpty);
    await Promise.all(stillEmpty.map(async item => {
      const corrected = corrections[item.name];
      if (!corrected || corrected.toLowerCase() === item.name.toLowerCase()) return;
      console.log(`[drugLookup] "${item.name}" → LLM corrected to "${corrected}"`);
      const found = await prisma.medicine.findMany({
        where: {
          OR: [
            { genericName: { startsWith: corrected, mode: 'insensitive' } },
            { tradeName:   { startsWith: corrected, mode: 'insensitive' } },
            { genericName: { contains:   corrected, mode: 'insensitive' } },
            { tradeName:   { contains:   corrected, mode: 'insensitive' } },
          ],
        },
        select: MEDICINE_SELECT,
        take: 15,
      });
      if (found.length > 0) {
        item.candidates = found;
        console.log(`[drugLookup] "${corrected}" → ${found.length} candidates after LLM correction`);
      }
    }));
  }

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
      model:      'claude-sonnet-4-6',
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
