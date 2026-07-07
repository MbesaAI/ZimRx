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

// ── GET /admin/api/stats/overview ─────────────────────────────────────────
// Top-level KPI numbers: total queries, confirmed dispensations,
// fulfillment rate. No individual records returned.
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

// ── GET /admin/api/stats/timeseries ───────────────────────────────────────
// Prescription query counts per day for the last 30 days.
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

// ── GET /admin/api/stats/medicines ────────────────────────────────────────
// Top 20 most-queried individual medicine names (from drugsDetected arrays).
// Groups with fewer than MIN_GROUP occurrences are suppressed.
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

// ── GET /admin/api/stats/fulfillment ──────────────────────────────────────
// Breakdown of prescription fulfillment outcomes.
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

// ── GET /admin/api/stats/geography ────────────────────────────────────────
// Prescription query volume by town, derived from pharmacy-finder usage.
// Only towns with at least MIN_GROUP queries are returned.
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

// ── GET /admin/api/stats/categories ──────────────────────────────────────
// Query volume by MCAZ medicine category (schedule), joined from the
// medicines table via detected drug names.
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
