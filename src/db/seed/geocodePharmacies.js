/**
 * One-time script: geocode all pharmacy addresses and store lat/lon in the DB.
 * Uses Nominatim (free, no key). Respects the 1 req/sec policy.
 *
 * Run: node src/db/seed/geocodePharmacies.js
 *
 * Safe to re-run — skips any pharmacy that already has coordinates.
 * Produces a summary of hits, misses, and errors at the end.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../env') });
const axios  = require('axios');
const prisma = require('../client');

const DELAY_MS = 1100; // Nominatim policy: max 1 req/sec

const PHARMACY_TYPES = [
  'PHARMACY IN ANY OTHER LOCATION',
  'PHARMACY LOCATED IN THE CBD',
  'PHARMACY IN RURAL AREA',
  'HOSPITAL PHARMACIES',
  'PHARMACIES-RESTRICTED',
];

const HEADERS = { 'User-Agent': 'ZimRx/1.0 (geocode-pharmacies; contact@zimrx.app)' };

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function nominatim(query) {
  const res = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: query, countrycodes: 'zw', format: 'json', limit: 1 },
    headers: HEADERS,
    timeout: 8000,
  });
  if (res.data && res.data.length > 0) {
    return { lat: parseFloat(res.data[0].lat), lon: parseFloat(res.data[0].lon) };
  }
  return null;
}

async function geocodePharmacy(p) {
  const town    = (p.town    || '').trim();
  const address = (p.address || '').trim();
  const name    = (p.premisesName || '').trim();

  // Try increasingly broad queries until one resolves
  const attempts = [
    address && town ? `${address}, ${town}, Zimbabwe`     : null,
    address         ? `${address}, Zimbabwe`              : null,
    name && town    ? `${name}, ${town}, Zimbabwe`        : null,
    town            ? `${town}, Zimbabwe`                 : null,
  ].filter(Boolean);

  for (const q of attempts) {
    try {
      const coords = await nominatim(q);
      if (coords) return { coords, query: q };
    } catch (e) {
      // network error on this attempt — continue to next
    }
    await sleep(DELAY_MS);
  }
  return null;
}

async function geocodeNewPharmacies(client, ids) {
  const db = client || prisma;

  const where = {
    premisesType: { in: PHARMACY_TYPES },
    latitude:     null,
    ...(ids !== undefined && { id: { in: ids } }),
  };

  const pharmacies = await db.pharmacy.findMany({
    where,
    orderBy: { id: 'asc' },
  });

  console.log(`\n🏥  Found ${pharmacies.length} pharmacies without coordinates.\n`);

  if (pharmacies.length === 0) {
    console.log('Nothing to do — all pharmacies already have coordinates.');
    if (!client) await db.$disconnect();
    return { hits: 0, misses: 0, errors: 0 };
  }

  const estimated = Math.ceil(pharmacies.length * DELAY_MS / 1000);
  console.log(`⏱  Estimated time: ~${Math.ceil(estimated / 60)} min (Nominatim rate limit)\n`);

  let hits = 0, misses = 0, errors = 0;

  for (let i = 0; i < pharmacies.length; i++) {
    const p = pharmacies[i];
    process.stdout.write(`[${i + 1}/${pharmacies.length}] ${(p.premisesName || '').slice(0, 40).padEnd(40)} `);

    try {
      await sleep(DELAY_MS);
      const result = await geocodePharmacy(p);

      if (result) {
        // Retry DB write once on connection reset (Neon drops idle connections)
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await db.pharmacy.update({
              where: { id: p.id },
              data:  { latitude: result.coords.lat, longitude: result.coords.lon },
            });
            break;
          } catch (dbErr) {
            if (attempt === 3) throw dbErr;
            console.log(`\n  ↺ DB connection lost, retrying (${attempt}/3)...`);
            await sleep(2000);
          }
        }
        console.log(`✅  ${result.coords.lat.toFixed(4)}, ${result.coords.lon.toFixed(4)}`);
        hits++;
      } else {
        console.log('❌  no result');
        misses++;
      }
    } catch (e) {
      console.log(`⚠️  error: ${e.message}`);
      errors++;
    }
  }

  console.log(`
─────────────────────────────────────────
✅  Geocoded:  ${hits}
❌  No result: ${misses}
⚠️  Errors:   ${errors}
─────────────────────────────────────────
`);

  if (!client) await db.$disconnect();
  return { hits, misses, errors };
}

if (require.main === module) {
  geocodeNewPharmacies().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { geocodeNewPharmacies };
