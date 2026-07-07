const prisma = require('../db/client');

async function lookupDrugs(input) {
  if (!input || (typeof input === 'string' && input.trim() === '') || (Array.isArray(input) && input.length === 0)) return [];

  let conditions;

  if (Array.isArray(input)) {
    // Structured drug names from Claude — use startsWith for precision, no tokenisation needed
    const names = [...new Set(input.map(n => n.trim()).filter(n => n.length >= 3))];
    if (names.length === 0) return [];
    conditions = names.flatMap(name => ([
      { genericName: { startsWith: name, mode: 'insensitive' } },
      { tradeName:   { startsWith: name, mode: 'insensitive' } },
    ]));
  } else {
    // Raw OCR text fallback (used by /api/translate) — tokenise with high length threshold
    // to avoid short false-positive tokens like "none", "take", "with", "tabs"
    const words = [...new Set(
      input
        .split(/[\s\n,;:\/\(\)\.]+/)
        .map(w => w.replace(/[^a-zA-Z-]/g, '').trim())
        .filter(w => w.length >= 6)
    )];
    if (words.length === 0) return [];
    conditions = words.flatMap(word => ([
      { genericName: { contains: word, mode: 'insensitive' } },
      { tradeName:   { contains: word, mode: 'insensitive' } },
    ]));
  }

  const results = await prisma.medicine.findMany({
    where: { OR: conditions },
    select: {
      id:          true,
      tradeName:   true,
      genericName: true,
      strength:    true,
      form:        true,
      category:    true,
    },
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

module.exports = { lookupDrugs };
