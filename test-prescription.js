require('dotenv').config({ path: 'env' });
const fs = require('fs');
const path = require('path');
const { extractTextFromBuffer } = require('./src/services/ocr');
const { matchMedications } = require('./src/services/drugLookup');

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: node test-prescription.js "<path to image>"');
  process.exit(1);
}

(async () => {
  console.log(`\nTesting: ${path.basename(imagePath)}\n`);

  const buffer = fs.readFileSync(imagePath);
  console.log('--- OCR ---');
  const ocrResult = await extractTextFromBuffer(buffer);
  console.log('isValidPrescription:', ocrResult.isValidPrescription);
  if (!ocrResult.isValidPrescription) {
    console.log('Reason:', ocrResult.notPrescriptionReason);
    console.log('Raw text:', ocrResult.text?.slice(0, 300));
    return;
  }
  console.log('Medications extracted:', JSON.stringify(ocrResult.medications, null, 2));

  console.log('\n--- Drug Matching ---');
  const { matched, notInMCAZ } = await matchMedications(ocrResult.medications);
  console.log('Matched in MCAZ:', matched.map(m => `${m.tradeName || m.genericName} (${m.strength || ''} ${m.form || ''})`));
  if (notInMCAZ.length > 0) console.log('Not in MCAZ:', notInMCAZ);
})();
