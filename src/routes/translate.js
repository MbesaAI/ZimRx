const express = require('express');
const router  = express.Router();
const { lookupDrugs } = require('../services/drugLookup');

/**
 * @swagger
 * /api/translate:
 *   post:
 *     summary: Look up drugs from OCR text
 *     description: Takes raw OCR text from a prescription and returns matched MCAZ drugs
 *     tags: [Translate]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ocrText]
 *             properties:
 *               ocrText:
 *                 type: string
 *                 example: "Amoxicillin 500mg tab, Paracetamol 500mg"
 *     responses:
 *       200:
 *         description: List of matched MCAZ medicines
 *       400:
 *         description: Missing ocrText
 */
router.post('/', async (req, res) => {
  const { ocrText } = req.body;
  if (!ocrText) return res.status(400).json({ error: 'ocrText is required' });

  const drugs = await lookupDrugs(ocrText);
  res.json({ count: drugs.length, drugs });
});

module.exports = router;
