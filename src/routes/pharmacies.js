const express = require('express');
const router  = express.Router();
const { findNearestPharmacies, findPharmaciesByTown, geocodeAddress } = require('../services/pharmacyFinder');

/**
 * @swagger
 * /api/pharmacies:
 *   get:
 *     summary: Find nearest pharmacies
 *     description: Returns up to 3 nearest MCAZ-registered pharmacies by coordinates or town name
 *     tags: [Pharmacies]
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         example: -17.8292
 *       - in: query
 *         name: lon
 *         schema:
 *           type: number
 *         example: 31.0522
 *       - in: query
 *         name: town
 *         schema:
 *           type: string
 *         example: Harare
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 3
 *     responses:
 *       200:
 *         description: List of pharmacies
 *       400:
 *         description: Must provide lat+lon or town
 */
router.get('/', async (req, res) => {
  const { lat, lon, town, limit = 3 } = req.query;

  if (lat && lon) {
    const pharmacies = await findNearestPharmacies(parseFloat(lat), parseFloat(lon), parseInt(limit));
    return res.json({ count: pharmacies.length, pharmacies });
  }

  if (town) {
    const pharmacies = await findPharmaciesByTown(town, parseInt(limit));
    return res.json({ count: pharmacies.length, pharmacies });
  }

  return res.status(400).json({ error: 'Provide lat and lon, or town' });
});

module.exports = router;
