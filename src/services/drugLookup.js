const prisma = require('../db/client');

async function lookupDrugs(ocrText) {
  if (!ocrText || ocrText.trim() === '') return [];

  const words = [...new Set(
    ocrText
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
