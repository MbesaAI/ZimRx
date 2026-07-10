require('dotenv').config({ path: require('path').join(__dirname, '../../../env') });
const fs     = require('fs');
const path   = require('path');
const prisma = require('../client');

const CSV_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '../../../data/geocoded_pharmacies.csv');

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { values.push(cur); cur = ''; }
      else { cur += ch; }
    }
    values.push(cur);
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').trim()]));
  });
}

async function main() {
  // Load CSV and keep only rows that have valid coordinates
  const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
  const csvWithCoords = new Map();
  for (const r of rows) {
    const lat = parseFloat(r.latitude);
    const lon = parseFloat(r.longitude);
    if (r.id && !isNaN(lat) && !isNaN(lon)) {
      csvWithCoords.set(parseInt(r.id), { lat, lon, name: r.premisesName });
    }
  }

  // Query DB for pharmacies currently missing coordinates
  const missing = await prisma.pharmacy.findMany({
    where:  { latitude: null },
    select: { id: true, premisesName: true },
  });

  const toUpdate = missing.filter(p => csvWithCoords.has(p.id));
  const notInCsv = missing.filter(p => !csvWithCoords.has(p.id));

  console.log(`\nCSV:  ${rows.length} rows, ${csvWithCoords.size} with valid coordinates`);
  console.log(`DB:   ${missing.length} pharmacies missing coordinates`);
  console.log(`Match: ${toUpdate.length} can be updated from this CSV`);
  if (notInCsv.length > 0) {
    console.log(`Still missing after import: ${notInCsv.length} (not found in CSV)`);
    notInCsv.forEach(p => console.log(`  - id=${p.id}  ${p.premisesName}`));
  }

  if (toUpdate.length === 0) {
    console.log('\nNothing to update.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nUpdating ${toUpdate.length} pharmacies...`);
  let updated = 0, errors = 0;

  for (const p of toUpdate) {
    const { lat, lon } = csvWithCoords.get(p.id);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await prisma.pharmacy.update({
          where: { id: p.id },
          data:  { latitude: lat, longitude: lon },
        });
        updated++;
        if (updated % 50 === 0) console.log(`  ${updated}/${toUpdate.length} updated...`);
        break;
      } catch (err) {
        if (attempt === 3) {
          console.error(`  ✗ id=${p.id} (${p.premisesName}): ${err.message}`);
          errors++;
        } else {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  console.log(`\nDone: ${updated} updated, ${errors} errors`);
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
