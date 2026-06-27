require('dotenv').config();
const xlsx = require('xlsx');
const path = require('path');
const prisma = require('../client');

const BATCH_SIZE = 200;

async function seedMedicines() {
  console.log('Reading MedicinesRegister.xlsx...');

  const filePath = path.join(__dirname, '../../../data/MedicinesRegister.xlsx');
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows. Seeding in batches of ${BATCH_SIZE}...`);

  const records = rows
    .filter(row => row['Registration No'])
    .map(row => ({
      tradeName:      row['Trade Name']                  ? String(row['Trade Name']) : null,
      genericName:    row['Generic Name']                ? String(row['Generic Name']) : null,
      registrationNo: String(row['Registration No']),
      form:           row['Form']                        ? String(row['Form']) : null,
      category:       row['Categories for Distribution'] ? String(row['Categories for Distribution']) : null,
      strength:       row['Strength']                    ? String(row['Strength']) : null,
      manufacturer:   row['Manufacturers']               ? String(row['Manufacturers']) : null,
      applicantName:  row['Applicant Name']              ? String(row['Applicant Name']) : null,
    }));

  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const result = await prisma.medicine.createMany({ data: batch, skipDuplicates: true });
    inserted += result.count;
    process.stdout.write(`\r  ${i + batch.length}/${records.length} processed, ${inserted} inserted`);
  }

  console.log(`\n✅ Medicines seeded: ${inserted} new rows inserted`);
  await prisma.$disconnect();
}

seedMedicines().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
