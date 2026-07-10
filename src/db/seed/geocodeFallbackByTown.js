/**
 * Fallback geocoder: assigns town-centroid coordinates to pharmacies that
 * still have no coordinates after Nominatim geocoding.
 *
 * Use this as a last resort — coordinates are approximate (town centre),
 * not the exact pharmacy address.
 *
 * Run: node src/db/seed/geocodeFallbackByTown.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../env') });
const prisma = require('../client');

// Town-centroid coordinates for all major Zimbabwe towns
const TOWN_COORDS = {
  'BANDUNG':         [-18.1333,  30.1500],
  'BANKET':          [-17.3833,  30.4000],
  'BEITBRIDGE':      [-22.2167,  30.0000],
  'BINDURA':         [-17.3000,  31.3333],
  'BINGA':           [-17.6203,  27.3414],
  'BIRCHENOUGH':     [-19.9622,  32.3333],
  'BUBI':            [-19.2974,  28.7492],
  'BULAWAYO':        [-20.1500,  28.5833],
  'CENTENARY':       [-16.7167,  31.1167],
  'CHACHACHA':       [-19.7833,  30.0333],
  'CHAKARI':         [-18.0622,  29.8739],
  'CHECHECHE':       [-20.7694,  32.2706],
  'CHEGUTU':         [-18.1333,  30.1500],
  'CHIMANIMANI':     [-19.8000,  32.8667],
  'CHINHOYI':        [-17.3667,  30.2000],
  'CHIPINGE':        [-20.1883,  32.6236],
  'CHIREDZI':        [-21.0500,  31.6667],
  'CHITUNGWIZA':     [-18.0128,  31.0756],
  'CHIVHU':          [-19.0211,  30.8922],
  'CHIVI':           [-20.3061,  30.5039],
  'CHIYADZWA':       [-19.8667,  32.3833],
  'DARWENDALE':      [-17.6833,  30.5333],
  'DEMA':            [-18.0833,  31.2667],
  'DETE':            [-18.6167,  26.8667],
  'DOMBOSHAWA':      [-17.6167,  31.1333],
  'ESIGODINI':       [-20.2933,  28.9367],
  'FILABUSI':        [-20.5333,  29.2833],
  'GLENDALE':        [-17.3500,  31.0667],
  'GOKWE':           [-18.2167,  28.9333],
  'GOROMONZI':       [-17.8167,  31.3667],
  'GURUVE':          [-16.6500,  30.7000],
  'GUTU':            [-19.6500,  31.1667],
  'GWANDA':          [-20.9333,  29.0167],
  'GWERU':           [-19.4500,  29.8167],
  'HARARE':          [-17.8292,  31.0522],
  'HAUNA':           [-18.5167,  32.8500],
  'HEADLANDS':       [-18.2833,  32.0500],
  'HWANGE':          [-18.3644,  26.5000],
  'INYATHI':         [-19.6667,  28.8500],
  'JERERA':          [-20.3333,  31.4833],
  'JULIASDALE':      [-18.3833,  32.6833],
  'KADOMA':          [-18.3333,  29.9167],
  'KARANDA':         [-16.3167,  31.7833],
  'KARIBA':          [-16.5167,  28.8000],
  'KAROI':           [-16.8167,  29.6833],
  'KWEKWE':          [-18.9281,  29.8149],
  'LUPANE':          [-18.9315,  27.8070],
  'MACHEKE':         [-18.1500,  31.8500],
  'MAGUNJE':         [-16.8167,  29.4333],
  'MARONDERA':       [-18.1889,  31.5528],
  'MASVINGO':        [-20.0833,  30.8333],
  'MAZOWE':          [-17.5167,  30.9667],
  'MBERENGWA':       [-20.4833,  29.9167],
  'MHANGURA':        [-16.8833,  30.1667],
  'MHONDORO':        [-18.3000,  30.1500],
  'MT DARWIN':       [-16.7833,  31.5833],
  'MUDZI':           [-17.0000,  32.2167],
  'MUNYATI':         [-18.6500,  29.7833],
  'MURAMBINDA':      [-19.3333,  31.6667],
  'MUREHWA':         [-17.6500,  31.7833],
  'MUROMBEDZI':      [-17.7000,  30.2000],
  'MUTARE':          [-18.9708,  32.6708],
  'MUTAWATAWA':      [-17.1167,  32.0333],
  'MUTOKO':          [-17.4000,  32.2167],
  'MUTORASHANGA':    [-17.1500,  30.6500],
  'MVUMA':           [-19.2833,  30.5333],
  'MVURWI':          [-17.0333,  30.8500],
  'MWENEZI':         [-21.0500,  30.7500],
  'NGUNDU':          [-20.8000,  30.8000],
  'NORTON':          [-17.8833,  30.7000],
  'NYANGA':          [-18.2167,  32.7333],
  'NYAZURA':         [-18.7167,  32.1833],
  'NYIKA':           [-19.9500,  31.5333],
  'ODZI':            [-18.9500,  32.3833],
  'PLUMTREE':        [-20.4833,  27.8000],
  'REDCLIFF':        [-19.0333,  29.7833],
  'RUSAPE':          [-18.5333,  32.1167],
  'RUTENGA':         [-21.2833,  30.7833],
  'RUWA':            [-17.8897,  31.2489],
  'SANYATI':         [-17.9500,  29.3000],
  'SELOUS':          [-18.0833,  30.4167],
  'SHAMVA':          [-17.3167,  31.5667],
  'SHURUGWI':        [-19.6667,  30.0000],
  'TRIANGLE':        [-21.0167,  31.4500],
  'TSHOLOTSHO':      [-19.7667,  27.7667],
  'VIC FALLS':       [-18.9333,  25.8333],
  'WATSOMBA':        [-18.8167,  32.6167],
  'WEDZA':           [-18.6167,  31.5833],
  'WEST NICHOLSON':  [-21.0667,  29.3667],
  'ZAKA':            [-20.3500,  31.4500],
  'ZVIMBA':          [-17.6500,  30.2500],
  'ZVISHAVANE':      [-20.3333,  30.0333],
};

async function main() {
  const missing = await prisma.pharmacy.findMany({
    where:   { latitude: null },
    select:  { id: true, premisesName: true, town: true },
    orderBy: { id: 'asc' },
  });

  console.log(`\nFound ${missing.length} pharmacies without coordinates.\n`);
  if (missing.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let matched = 0, unmatched = 0;
  const stillMissing = [];

  for (const p of missing) {
    const town = (p.town || '').trim().toUpperCase();
    const coords = TOWN_COORDS[town];

    if (coords) {
      await prisma.pharmacy.update({
        where: { id: p.id },
        data:  { latitude: coords[0], longitude: coords[1] },
      });
      console.log(`✅  ${p.premisesName} → ${town} (${coords[0]}, ${coords[1]})`);
      matched++;
    } else {
      stillMissing.push(p);
      unmatched++;
    }
  }

  console.log(`
─────────────────────────────────────────
✅  Updated with town centroid: ${matched}
❌  Town not in dictionary:     ${unmatched}
─────────────────────────────────────────`);

  if (stillMissing.length > 0) {
    console.log('\nPharmacies still without coordinates:');
    stillMissing.forEach(p =>
      console.log(`  id=${p.id}  ${(p.premisesName || '').padEnd(40)}  town="${p.town || ''}"`)
    );
  }

  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
