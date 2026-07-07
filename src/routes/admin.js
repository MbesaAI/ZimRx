const express = require('express');
const path    = require('path');
const router  = express.Router();
const prisma  = require('../db/client');

// Minimum group size — suppress buckets with fewer than this many records
// to reduce the risk of patient-level inference.
const MIN_GROUP = 5;

// ── GET /admin ────────────────────────────────────────────────────────────
// Serves the stakeholder dashboard (auth already checked by middleware).
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin.html'));
});

/**
 * @swagger
 * /admin/api/stats/overview:
 *   get:
 *     summary: Top-level KPI overview
 *     description: Total queries, confirmed dispensations, and fulfillment rate. No individual patient records returned. Requires Basic Auth.
 *     tags: [Admin]
 *     security:
 *       - basicAuth: []
 *     responses:
 *       200:
 *         description: Aggregated KPI numbers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalQueries:            { type: integer }
 *                 confirmedDispensations:  { type: integer }
 *                 notFilled:               { type: integer }
 *                 stillLooking:            { type: integer }
 *                 noResponseYet:           { type: integer }
 *                 responseRate:            { type: integer, description: "% of users who replied to fulfillment prompt" }
 *                 fulfillmentRate:         { type: integer, description: "% of responded users who confirmed dispensation" }
 *       401:
 *         description: Unauthorized
 */
router.get('/api/stats/overview', async (req, res) => {
  const [total, confirmed, notFilled, stillLooking] = await Promise.all([
    prisma.prescription.count(),
    prisma.prescription.count({ where: { fulfilled: true } }),
    prisma.prescription.count({ where: { fulfillmentStatus: 'NO' } }),
    prisma.prescription.count({ where: { fulfillmentStatus: 'STILL_LOOKING' } }),
  ]);

  const responded     = confirmed + notFilled + stillLooking;
  const responseRate  = total > 0 ? Math.round((responded / total) * 100) : 0;
  const fulfillRate   = responded > 0 ? Math.round((confirmed / responded) * 100) : 0;

  res.json({
    totalQueries:        total,
    confirmedDispensations: confirmed,
    notFilled,
    stillLooking,
    noResponseYet:       total - responded,
    responseRate,
    fulfillmentRate:     fulfillRate,
  });
});

/**
 * @swagger
 * /admin/api/stats/timeseries:
 *   get:
 *     summary: Prescription queries per day
 *     description: Daily query counts for the last N days. Requires Basic Auth.
 *     tags: [Admin]
 *     security:
 *       - basicAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to look back
 *     responses:
 *       200:
 *         description: Time-series data
 *       401:
 *         description: Unauthorized
 */
router.get('/api/stats/timeseries', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('day', "submittedAt") AS day,
      COUNT(*)::int                    AS queries
    FROM prescriptions
    WHERE "submittedAt" >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  res.json({
    days,
    series: rows.map(r => ({
      date:    r.day.toISOString().slice(0, 10),
      queries: r.queries,
    })),
  });
});

/**
 * @swagger
 * /admin/api/stats/medicines:
 *   get:
 *     summary: Top queried medicines
 *     description: Most-queried MCAZ medicine names across all prescriptions. Groups below the minimum threshold are suppressed for privacy. Requires Basic Auth.
 *     tags: [Admin]
 *     security:
 *       - basicAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Ranked medicine list
 *       401:
 *         description: Unauthorized
 */
router.get('/api/stats/medicines', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const rows = await prisma.$queryRaw`
    SELECT
      TRIM(drug)   AS medicine,
      COUNT(*)::int AS queries
    FROM prescriptions,
         UNNEST("drugsDetected") AS drug
    WHERE TRIM(drug) <> ''
    GROUP BY medicine
    HAVING COUNT(*) >= ${MIN_GROUP}
    ORDER BY queries DESC
    LIMIT ${limit}
  `;

  res.json({ limit, medicines: rows });
});

/**
 * @swagger
 * /admin/api/stats/fulfillment:
 *   get:
 *     summary: Fulfillment outcome breakdown
 *     description: Counts and percentages for each prescription fulfillment status (YES / NO / STILL_LOOKING / NOT_ASKED). Requires Basic Auth.
 *     tags: [Admin]
 *     security:
 *       - basicAuth: []
 *     responses:
 *       200:
 *         description: Fulfillment breakdown
 *       401:
 *         description: Unauthorized
 */
router.get('/api/stats/fulfillment', async (req, res) => {
  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE("fulfillmentStatus", 'NOT_ASKED') AS status,
      COUNT(*)::int                               AS count
    FROM prescriptions
    GROUP BY status
    ORDER BY count DESC
  `;

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  res.json({
    total,
    breakdown: rows.map(r => ({
      status:     r.status,
      count:      r.count,
      percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
    })),
  });
});

/**
 * @swagger
 * /admin/api/stats/geography:
 *   get:
 *     summary: Query volume by town
 *     description: Prescription query counts grouped by town. Only towns above the minimum group threshold are returned. Requires Basic Auth.
 *     tags: [Admin]
 *     security:
 *       - basicAuth: []
 *     responses:
 *       200:
 *         description: Town-level query distribution
 *       401:
 *         description: Unauthorized
 */
router.get('/api/stats/geography', async (req, res) => {
  const rows = await prisma.$queryRaw`
    SELECT
      UPPER(TRIM(c.town)) AS town,
      COUNT(*)::int       AS queries
    FROM (
      SELECT
        p.town,
        ph."conversationId"
      FROM pharmacies p
      JOIN (
        SELECT DISTINCT "conversationId", MIN("submittedAt") AS ts
        FROM prescriptions
        GROUP BY "conversationId"
      ) ph ON true
    ) c
    WHERE c.town IS NOT NULL AND TRIM(c.town) <> ''
    GROUP BY UPPER(TRIM(c.town))
    HAVING COUNT(*) >= ${MIN_GROUP}
    ORDER BY queries DESC
    LIMIT 30
  `;

  // Geography data is approximated from pharmacy register towns.
  // Fall back to a simpler per-prescription town count if the join yields nothing.
  if (rows.length === 0) {
    const fallback = await prisma.$queryRaw`
      SELECT
        UPPER(TRIM(town)) AS town,
        COUNT(*)::int     AS count
      FROM pharmacies
      WHERE town IS NOT NULL AND TRIM(town) <> ''
      GROUP BY UPPER(TRIM(town))
      ORDER BY count DESC
      LIMIT 20
    `;
    return res.json({ note: 'pharmacy_register_distribution', towns: fallback });
  }

  res.json({ towns: rows });
});

/**
 * @swagger
 * /admin/api/stats/categories:
 *   get:
 *     summary: Query volume by medicine category
 *     description: Prescription query counts grouped by MCAZ medicine schedule/category. Requires Basic Auth.
 *     tags: [Admin]
 *     security:
 *       - basicAuth: []
 *     responses:
 *       200:
 *         description: Category breakdown
 *       401:
 *         description: Unauthorized
 */
router.get('/api/stats/categories', async (req, res) => {
  const rows = await prisma.$queryRaw`
    SELECT
      m.category,
      COUNT(*)::int AS queries
    FROM prescriptions rx,
         UNNEST(rx."drugsDetected") AS drug
    JOIN medicines m
      ON LOWER(TRIM(m."genericName")) = LOWER(TRIM(drug))
      OR LOWER(TRIM(m."tradeName"))   = LOWER(TRIM(drug))
    WHERE m.category IS NOT NULL
    GROUP BY m.category
    HAVING COUNT(*) >= ${MIN_GROUP}
    ORDER BY queries DESC
  `;

  res.json({ categories: rows });
});

module.exports = router;
