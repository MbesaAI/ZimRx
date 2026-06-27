const express = require('express');
const router  = express.Router();
const prisma  = require('../db/client');

/**
 * @swagger
 * /api/records/{waId}:
 *   get:
 *     summary: Get prescription history for a patient
 *     description: Returns all prescriptions submitted by a WhatsApp number
 *     tags: [Records]
 *     parameters:
 *       - in: path
 *         name: waId
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp number e.g. 263771234567
 *     responses:
 *       200:
 *         description: List of prescriptions
 *       404:
 *         description: No record found
 */
router.get('/:waId', async (req, res) => {
  const { waId } = req.params;

  const conversation = await prisma.conversation.findUnique({
    where:   { waId },
    include: {
      prescriptions: {
        orderBy: { submittedAt: 'desc' },
        take:    10
      }
    }
  });

  if (!conversation) {
    return res.status(404).json({ error: 'No record found for this number' });
  }

  res.json({
    waId,
    totalPrescriptions: conversation.prescriptions.length,
    prescriptions:      conversation.prescriptions
  });
});

module.exports = router;
