require('dotenv').config({ path: require('path').join(__dirname, '../../../env') });
const fs     = require('fs');
const path   = require('path');
const prisma = require('../client');

const PHARMACY_TYPES = [
  'PHARMACY IN ANY OTHER LOCATION',
  'PHARMACY LOCATED IN THE CBD',
  'PHARMACY IN RURAL AREA',
  'HOSPITAL PHARMACIES',
  'PHARMACIES-RESTRICTED',
];

async function main() {
  const pharmacies = await prisma.pharmacy.findMany({
    where: { premisesType: { in: PHARMACY_TYPES }, latitude: null },
    orderBy: [{ town: 'asc' }, { premisesName: 'asc' }],
    select: { id: true, licenceNo: true, premisesName: true, address: true, town: true, premisesType: true },
  });

  console.log(`Found ${pharmacies.length} pharmacies without coordinates.`);

  // CSV
  const csv = [
    'id,licenceNo,premisesName,address,town,premisesType,latitude,longitude',
    ...pharmacies.map(p =>
      [p.id, p.licenceNo, p.premisesName, p.address, p.town, p.premisesType, '', '']
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    ),
  ].join('\n');

  const outPath = path.join(__dirname, '../../../data/missing_coords.csv');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv, 'utf8');
  console.log(`✅  Saved to ${outPath}`);

  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
