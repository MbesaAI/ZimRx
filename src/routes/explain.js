const express = require('express');
const router  = express.Router();
const { explainDrugs } = require('../services/llm');

/**
 * @swagger
 * /api/explain:
 *   post:
 *     summary: Get plain-language drug explanation
 *     description: Calls Claude Haiku to explain a list of drugs in plain English
 *     tags: [Explain]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [drugs]
 *             properties:
 *               drugs:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Amoxicillin", "Paracetamol"]
 *     responses:
 *       200:
 *         description: Plain-language explanation
 *       400:
 *         description: Missing drugs array
 */
router.post('/', async (req, res) => {
  const { drugs } = req.body;
  if (!drugs || !Array.isArray(drugs) || drugs.length === 0) {
    return res.status(400).json({ error: 'drugs array is required' });
  }
  const explanation = await explainDrugs(drugs);
  res.json({ explanation });
});

module.exports = router;
