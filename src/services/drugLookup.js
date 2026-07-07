const prisma = require('../db/client');

async function lookupDrugs(input) {
  if (!input || (typeof input === 'string' && input.trim() === '') || (Array.isArray(input) && input.length === 0)) return [];

  // Accept an array of extracted drug names (preferred) or a raw OCR text string (fallback)
  const source = Array.isArray(input) ? input.join('\n') : input;
  const words = [...new Set(
    source
      .split(/[\s\n,;:\/\(\)]+/)
      .map(w => w.trim())
      .filter(w => w.length >= 4)
  )];

  if (words.length === 0) return [];

  const results = await prisma.medicine.findMany({
    where: {
      OR: words.flatMap(word => ([
        { genericName: { contains: word, mode: 'insensitive' } },
        { tradeName:   { contains: word, mode: 'insensitive' } }
      ]))
    },
    select: {
      id:          true,
      tradeName:   true,
      genericName: true,
      strength:    true,
      form:        true,
      category:    true,
    },
    take: 20
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
