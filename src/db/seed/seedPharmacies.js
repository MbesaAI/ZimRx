require('dotenv').config();
const xlsx = require('xlsx');
const path = require('path');
const prisma = require('../client');

const BATCH_SIZE = 200;

async function seedPharmacies() {
  console.log('Reading Premises.xlsx...');

  const filePath = path.join(__dirname, '../../../data/Premises.xlsx');
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows. Seeding in batches of ${BATCH_SIZE}...`);

  const records = rows
    .filter(row => row['Licence No.'])
    .map(row => ({
      licenceNo:    String(row['Licence No.']),
      premisesName: row['Premises Name'] ? String(row['Premises Name']) : null,
      address:      row['Address']        ? String(row['Address']) : null,
      premisesType: row['Premises Type'] ? String(row['Premises Type']) : null,
      town:         row['Town']           ? String(row['Town']) : null,
    }));

  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const result = await prisma.pharmacy.createMany({ data: batch, skipDuplicates: true });
    inserted += result.count;
    process.stdout.write(`\r  ${i + batch.length}/${records.length} processed, ${inserted} inserted`);
  }

  console.log(`\n✅ Pharmacies seeded: ${inserted} new rows inserted`);
  await prisma.$disconnect();
}

seedPharmacies().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
