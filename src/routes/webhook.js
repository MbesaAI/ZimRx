const express = require('express');
const router  = express.Router();
const { handleIncomingMessage } = require('../conversation/handler');

router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  console.warn('❌ Webhook verification failed');
  return res.status(403).send('Forbidden');
});

router.post('/', async (req, res) => {
  // Respond 200 immediately — WhatsApp retries if response is slow
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const type = message.type;

    console.log(`Incoming [${type}] from ${from}`);
    await handleIncomingMessage(from, type, message);
  } catch (error) {
    console.error('Webhook handler error:', error);
  }
});

module.exports = router;
