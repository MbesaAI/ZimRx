const prisma = require('../db/client');

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PHARMACY_TYPES = [
  'PHARMACY IN ANY OTHER LOCATION',
  'PHARMACY LOCATED IN THE CBD',
  'PHARMACY IN RURAL AREA',
  'HOSPITAL PHARMACIES',
  'PHARMACIES-RESTRICTED',
];

async function findNearestPharmacies(latitude, longitude, limit = 3) {
  const pharmacies = await prisma.pharmacy.findMany({
    where: {
      premisesType: { in: PHARMACY_TYPES },
      latitude:     { not: null },
      longitude:    { not: null },
    }
  });

  if (pharmacies.length === 0) {
    return prisma.pharmacy.findMany({
      where: { premisesType: { in: PHARMACY_TYPES } },
      take: limit
    });
  }

  return pharmacies
    .map(p => ({
      ...p,
      distanceKm: haversineKm(latitude, longitude, p.latitude, p.longitude)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

async function findPharmaciesByTown(town, limit = 5) {
  return prisma.pharmacy.findMany({
    where: {
      town:         { contains: town, mode: 'insensitive' },
      premisesType: { in: PHARMACY_TYPES }
    },
    take: limit
  });
}

module.exports = { findNearestPharmacies, findPharmaciesByTown };
