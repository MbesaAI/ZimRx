const { sendMessage } = require('../services/whatsapp');
const { extractTextFromImage } = require('../services/ocr');
const { lookupDrugs } = require('../services/drugLookup');
const { explainDrugs } = require('../services/llm');
const { findNearestPharmacies, findPharmaciesByTown } = require('../services/pharmacyFinder');
const prisma = require('../db/client');

const STATES = {
  IDLE:              'IDLE',
  AWAITING_CHOICE:   'AWAITING_CHOICE',
  AWAITING_LOCATION: 'AWAITING_LOCATION',
};

const MENU = `Welcome to *ZimRx* 🏥\n\nI can help you with your prescription. What would you like?\n\n*1* — 📋 Translate my prescription\n*2* — 💊 Explain my medication\n*3* — 🗺️ Find nearest pharmacy\n*4* — 📁 Retrieve my last prescription\n\nOr send a *photo* of your prescription to get started.`;

async function getOrCreateConversation(waId) {
  return prisma.conversation.upsert({
    where:  { waId },
    update: { lastMessageAt: new Date() },
    create: { waId, state: STATES.IDLE }
  });
}

async function setState(waId, state) {
  return prisma.conversation.update({
    where: { waId },
    data:  { state }
  });
}

async function getLastPrescription(conversationId) {
  return prisma.prescription.findFirst({
    where:   { conversationId },
    orderBy: { submittedAt: 'desc' }
  });
}

async function handleIncomingMessage(from, type, message) {
  const conversation = await getOrCreateConversation(from);
  const { state, id: conversationId } = conversation;

  // ── IMAGE ──────────────────────────────────────────────────────────────────
  if (type === 'image') {
    const mediaId = message.image.id;
    await sendMessage(from, '📷 Got your prescription photo. Analysing now...');

    const ocrText = await extractTextFromImage(mediaId);

    if (!ocrText) {
      await sendMessage(from, '❌ Could not read the image. Please try again with a clearer photo in good lighting.');
      return;
    }

    const drugs = await lookupDrugs(ocrText);

    await prisma.prescription.create({
      data: {
        conversationId,
        rawOcrText:    ocrText,
        drugsDetected: drugs.map(d => d.genericName || d.tradeName)
      }
    });

    if (drugs.length === 0) {
      await sendMessage(from, '⚠️ I could not match any medications to the MCAZ register.\n\nPlease try:\n• A clearer photo\n• Better lighting\n• Holding the phone steady\n\nOr type the medication name and I will look it up.');
      return;
    }

    const drugList = drugs
      .map(d => `• *${d.tradeName || d.genericName}* (${d.genericName}) — ${d.strength || 'see label'}`)
      .join('\n');

    await sendMessage(from, `✅ *Prescription detected:*\n\n${drugList}\n\nWhat would you like?\n*2* — Explain what these medications do\n*3* — Find a pharmacy near you`);
    await setState(from, STATES.AWAITING_CHOICE);
    return;
  }

  // ── LOCATION ───────────────────────────────────────────────────────────────
  if (type === 'location' && state === STATES.AWAITING_LOCATION) {
    const { latitude, longitude } = message.location;
    await sendMessage(from, '🔍 Finding pharmacies near you...');

    const pharmacies = await findNearestPharmacies(latitude, longitude, 3);

    if (pharmacies.length === 0) {
      await sendMessage(from, 'No registered pharmacies found near your location. Try typing your town name instead.');
      await setState(from, STATES.IDLE);
      return;
    }

    const list = pharmacies.map((p, i) =>
      `*${i + 1}. ${p.premisesName}*\n📍 ${p.address}, ${p.town}${p.distanceKm ? `\n📏 ${p.distanceKm.toFixed(1)} km away` : ''}`
    ).join('\n\n');

    await sendMessage(from, `🏥 *Nearest pharmacies to you:*\n\n${list}\n\nSave this message so you have it offline.`);
    await setState(from, STATES.IDLE);
    return;
  }

  // ── TEXT ───────────────────────────────────────────────────────────────────
  if (type === 'text') {
    const text  = message.text.body.trim();
    const lower = text.toLowerCase();

    // Option 1 — Translate
    if (text === '1' || lower.includes('translate') || lower.includes('read prescription')) {
      await sendMessage(from, '📸 Please send a photo of your prescription and I will read it for you.');
      return;
    }

    // Option 2 — Explain medication
    if (text === '2' || lower.includes('explain') || lower.includes('medication')) {
      const lastRx = await getLastPrescription(conversationId);
      if (!lastRx || lastRx.drugsDetected.length === 0) {
        await sendMessage(from, '⚠️ No prescription found yet. Please send a photo of your prescription first.');
        return;
      }
      await sendMessage(from, '⏳ Looking up your medications...');
      const explanation = await explainDrugs(lastRx.drugsDetected);
      await sendMessage(from, `💊 *Your medication explained:*\n\n${explanation}`);
      await setState(from, STATES.IDLE);
      return;
    }

    // Option 3 — Find pharmacy
    if (text === '3' || lower.includes('pharmacy') || lower.includes('find')) {
      await sendMessage(from, `📍 To find the nearest pharmacy, please share your location.\n\nIn WhatsApp:\n1. Tap the *paperclip* (📎) icon\n2. Tap *Location*\n3. Tap *Send Your Current Location*\n\nOr type your town name (e.g. "Harare" or "Bulawayo")`);
      await setState(from, STATES.AWAITING_LOCATION);
      return;
    }

    // Option 4 — Retrieve last prescription
    if (text === '4' || lower.includes('my prescription') || lower.includes('last prescription')) {
      const lastRx = await getLastPrescription(conversationId);
      if (!lastRx) {
        await sendMessage(from, '📭 No prescription on record yet.\n\nSend a photo of your prescription to get started.');
        return;
      }
      const drugs = lastRx.drugsDetected.join(', ');
      const date  = lastRx.submittedAt.toLocaleDateString('en-GB');
      await sendMessage(from, `📁 *Your last prescription (${date}):*\n\n${drugs}\n\nReply *2* to get an explanation of these medications.`);
      return;
    }

    // Town name while waiting for location
    if (state === STATES.AWAITING_LOCATION) {
      const pharmacies = await findPharmaciesByTown(text, 3);
      if (pharmacies.length > 0) {
        const list = pharmacies.map((p, i) =>
          `*${i + 1}. ${p.premisesName}*\n📍 ${p.address}, ${p.town}`
        ).join('\n\n');
        await sendMessage(from, `🏥 *Pharmacies in ${text}:*\n\n${list}`);
        await setState(from, STATES.IDLE);
        return;
      }
    }

    // Default — show menu
    await sendMessage(from, MENU);
    await setState(from, STATES.IDLE);
    return;
  }

  // Fallback for other message types (audio, video, etc.)
  await sendMessage(from, MENU);
}

module.exports = { handleIncomingMessage };
