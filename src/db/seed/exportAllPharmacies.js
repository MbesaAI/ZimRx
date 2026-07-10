require('dotenv').config({ path: require('path').join(__dirname, '../../../env') });
const fs     = require('fs');
const path   = require('path');
const prisma = require('../client');

const OUT = path.join(__dirname, '../../../data/all_pharmacies.csv');

function esc(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

async function main() {
  const rows = await prisma.pharmacy.findMany({
    orderBy: [{ town: 'asc' }, { premisesName: 'asc' }],
    select: { id: true, licenceNo: true, premisesName: true, address: true,
              town: true, premisesType: true, latitude: true, longitude: true },
  });

  const header = 'id,licenceNo,premisesName,address,town,premisesType,latitude,longitude';
  const lines  = rows.map(r =>
    [r.id, r.licenceNo, r.premisesName, r.address, r.town, r.premisesType,
     r.latitude ?? '', r.longitude ?? ''].map(esc).join(',')
  );

  fs.writeFileSync(OUT, [header, ...lines].join('\n'), 'utf8');
  console.log(`✅  Exported ${rows.length} pharmacies → ${OUT}`);
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
