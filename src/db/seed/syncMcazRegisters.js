require('dotenv').config({ path: require('path').join(__dirname, '../../../env') });
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const { geocodeNewPharmacies } = require('./geocodePharmacies');

const prisma = new PrismaClient();

const MCAZ_BASE = 'https://onlineservices.mcaz.co.zw/onlineregister';
const PAGE_SIZE = 500;

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function fetchAll(url) {
  const records = [];
  let skip = 0;
  let total = Infinity;

  while (skip < total) {
    const body = `take=${PAGE_SIZE}&skip=${skip}&page=${Math.floor(skip / PAGE_SIZE) + 1}&pageSize=${PAGE_SIZE}`;
    const { data } = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 30000,
    });

    if (!data.Data) throw new Error(`Unexpected response from ${url}`);
    total = data.Total;
    records.push(...data.Data);
    skip += PAGE_SIZE;
    process.stdout.write(`\r  Fetched ${records.length}/${total}...`);
  }
  process.stdout.write('\n');
  return records;
}

async function syncMedicines() {
  console.log('[MCAZ Sync] Fetching medicines...');
  const records = await fetchAll(`${MCAZ_BASE}/Medicines/GetMedicinesByCategory?category=1`);
  const valid = records.filter(r => r.Registration_No?.trim());

  console.log(`[MCAZ Sync] Upserting ${valid.length} medicines...`);
  let count = 0;

  for (const batch of chunk(valid, 100)) {
    await Promise.all(batch.map(r =>
      prisma.medicine.upsert({
        where: { registrationNo: r.Registration_No.trim() },
        update: {
          tradeName:     r.Trade_Name?.trim()    || null,
          genericName:   r.Generic_Name?.trim()  || null,
          dateRegistered: r.Date_Registered ? new Date(r.Date_Registered) : null,
          form:          r.Forms?.trim()         || null,
          category:      r.Category?.trim()      || null,
          strength:      r.Strength?.trim()      || null,
          manufacturer:  r.Manufacturers?.trim() || null,
          applicantName: r.ApplicantName?.trim() || null,
          expiryDate:    r.Expiry_Date ? new Date(r.Expiry_Date) : null,
        },
        create: {
          registrationNo: r.Registration_No.trim(),
          tradeName:     r.Trade_Name?.trim()    || null,
          genericName:   r.Generic_Name?.trim()  || null,
          dateRegistered: r.Date_Registered ? new Date(r.Date_Registered) : null,
          form:          r.Forms?.trim()         || null,
          category:      r.Category?.trim()      || null,
          strength:      r.Strength?.trim()      || null,
          manufacturer:  r.Manufacturers?.trim() || null,
          applicantName: r.ApplicantName?.trim() || null,
          expiryDate:    r.Expiry_Date ? new Date(r.Expiry_Date) : null,
        },
      })
    ));
    count += batch.length;
    process.stdout.write(`\r  Upserted ${count}/${valid.length}...`);
  }
  process.stdout.write('\n');
  console.log(`[MCAZ Sync] Medicines done: ${count} records.`);
  return count;
}

async function syncPremises() {
  console.log('[MCAZ Sync] Fetching premises...');
  const records = await fetchAll(`${MCAZ_BASE}/Premises/GetPremisesByStatus?status=1`);
  const valid = records.filter(r => r.LicenseNo?.trim());

  // Snapshot existing licence numbers so we can identify truly new entries after upsert
  const existing = new Set(
    (await prisma.pharmacy.findMany({ select: { licenceNo: true } })).map(p => p.licenceNo)
  );

  console.log(`[MCAZ Sync] Upserting ${valid.length} premises...`);
  let count = 0;
  const newLicenceNos = [];

  for (const batch of chunk(valid, 100)) {
    await Promise.all(batch.map(r => {
      const licNo = r.LicenseNo.trim();
      if (!existing.has(licNo)) newLicenceNos.push(licNo);
      return prisma.pharmacy.upsert({
        where: { licenceNo: licNo },
        update: {
          premisesName: r.PremiseName?.trim()        || null,
          address:      r.PremiseAddress?.trim()     || null,
          premisesType: r.PremiseDescription?.trim() || null,
          town:         r.Town?.trim()               || null,
          expiryDate:   r.ExpiryDate ? new Date(r.ExpiryDate) : null,
          // latitude/longitude intentionally omitted — preserved from geocoding
        },
        create: {
          licenceNo:    licNo,
          premisesName: r.PremiseName?.trim()        || null,
          address:      r.PremiseAddress?.trim()     || null,
          premisesType: r.PremiseDescription?.trim() || null,
          town:         r.Town?.trim()               || null,
          expiryDate:   r.ExpiryDate ? new Date(r.ExpiryDate) : null,
        },
      });
    }));
    count += batch.length;
    process.stdout.write(`\r  Upserted ${count}/${valid.length}...`);
  }
  process.stdout.write('\n');

  // Fetch DB ids of newly created rows (needed to scope geocoding)
  const newIds = newLicenceNos.length > 0
    ? (await prisma.pharmacy.findMany({
        where: { licenceNo: { in: newLicenceNos } },
        select: { id: true },
      })).map(p => p.id)
    : [];

  console.log(`[MCAZ Sync] Premises done: ${count} records (${newIds.length} new).`);
  return { count, newIds };
}

async function syncAll() {
  console.log(`[MCAZ Sync] Starting at ${new Date().toISOString()}`);
  try {
    const medicines = await syncMedicines();
    const { count: premises, newIds } = await syncPremises();

    let geocoded = 0;
    if (newIds.length > 0) {
      console.log(`[MCAZ Sync] Geocoding ${newIds.length} newly added pharmacies...`);
      const geo = await geocodeNewPharmacies(prisma, newIds);
      geocoded = geo.hits;
    } else {
      console.log('[MCAZ Sync] No new pharmacies — skipping geocoding.');
    }

    console.log(`[MCAZ Sync] Complete — ${medicines} medicines, ${premises} premises, ${geocoded} newly geocoded.`);
    return { medicines, premises, geocoded };
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  syncAll().then(() => process.exit(0)).catch(err => {
    console.error('[MCAZ Sync] Failed:', err.message);
    process.exit(1);
  });
}

module.exports = { syncAll, syncMedicines, syncPremises };
