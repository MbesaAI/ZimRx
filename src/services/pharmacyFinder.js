const prisma = require('../db/client');
const axios  = require('axios');

const NOMINATIM_HEADERS = { 'User-Agent': 'ZimRx/1.0 (prescription-assistant; contact@zimrx.app)' };

async function geocodeAddress(query) {
  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: `${query}, Zimbabwe`, countrycodes: 'zw', format: 'json', limit: 1, addressdetails: 1 },
      headers: NOMINATIM_HEADERS,
      timeout: 6000,
    });
    if (res.data && res.data.length > 0) {
      const hit = res.data[0];
      const addr = hit.address || {};
      // Extract best available town name from address details
      const town = addr.city || addr.town || addr.village || addr.suburb || addr.county || null;
      return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), town };
    }
    return null;
  } catch {
    return null;
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat, lon, format: 'json', addressdetails: 1 },
      headers: NOMINATIM_HEADERS,
      timeout: 6000,
    });
    const addr = res.data?.address || {};
    return addr.city || addr.town || addr.village || addr.suburb || addr.county || null;
  } catch {
    return null;
  }
}

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

async function findNearestPharmacies(latitude, longitude, limit = 5) {
  // Try pharmacies that have coordinates stored (future-proof if data improves)
  const withCoords = await prisma.pharmacy.findMany({
    where: {
      premisesType: { in: PHARMACY_TYPES },
      latitude:     { not: null },
      longitude:    { not: null },
    }
  });

  if (withCoords.length > 0) {
    return withCoords
      .map(p => ({ ...p, distanceKm: haversineKm(latitude, longitude, p.latitude, p.longitude) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  // MCAZ register has no GPS data — reverse-geocode to get the town name
  const town = await reverseGeocode(latitude, longitude);
  if (town) {
    const byTown = await findPharmaciesByTown(town, limit);
    if (byTown.length > 0) return byTown;
  }

  return [];
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

module.exports = { findNearestPharmacies, findPharmaciesByTown, geocodeAddress, reverseGeocode };
