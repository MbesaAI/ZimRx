const express = require('express');
const path    = require('path');
const router  = express.Router();
const { handleIncomingMessage } = require('../conversation/handler');
const { LANGUAGE_MENU, getMessages } = require('../i18n/messages');
const prisma = require('../db/client');

// Serve the WhatsApp replica chat UI
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/chat.html'));
});

// Return the bot's opening message for a session without creating a user turn.
// GET /demo/boot?sessionId=xxx
router.get('/boot', async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  const waId = `demo_${sessionId}`;
  const conv = await prisma.conversation.findUnique({ where: { waId } });

  if (!conv || !conv.language) {
    // New or languageless session — create/ensure record then return language menu
    await prisma.conversation.upsert({
      where:  { waId },
      update: { lastMessageAt: new Date() },
      create: { waId, state: 'IDLE' },
    });
    return res.json({ isNew: true, messages: [LANGUAGE_MENU] });
  }

  // Returning session — update timestamp and return menu in their language
  await prisma.conversation.update({ where: { waId }, data: { lastMessageAt: new Date() } });
  const m = getMessages(conv.language);
  return res.json({ isNew: false, messages: [m.MENU] });
});

// Process a chat message and return all bot responses as an array.
// Body: { sessionId, type: 'text'|'image'|'location', body?, imageBase64?, latitude?, longitude? }
router.post('/message', async (req, res) => {
  const { sessionId, type, body, imageBase64, latitude, longitude } = req.body;

  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  // Prefix so demo conversations never collide with real WhatsApp numbers
  const from = `demo_${sessionId}`;

  const responses = [];
  const collect = async (_to, text) => { responses.push(text); };

  try {
    if (type === 'text') {
      await handleIncomingMessage(from, 'text', { text: { body: body || '' } }, collect);
    }
    else if (type === 'image') {
      if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
      const base64 = imageBase64.replace(/^data:image\/[a-z+]+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      // Pass buffer via _buffer so handler skips WhatsApp media download
      await handleIncomingMessage(from, 'image', { image: { id: null, _buffer: buffer } }, collect);
    }
    else if (type === 'location') {
      await handleIncomingMessage(from, 'location', { location: { latitude, longitude } }, collect);
    }
    else {
      return res.status(400).json({ error: 'type must be text, image, or location' });
    }

    res.json({ responses });
  } catch (err) {
    console.error('Demo chat error:', err);
    res.status(500).json({ error: 'Internal server error', responses });
  }
});

module.exports = router;
