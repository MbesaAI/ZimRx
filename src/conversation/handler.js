const { sendMessage } = require('../services/whatsapp');
const { extractTextFromImage, extractTextFromBuffer } = require('../services/ocr');
const { matchMedications, lookupDrugs } = require('../services/drugLookup');
const { explainDrugs } = require('../services/llm');
const { findNearestPharmacies, findPharmaciesByTown, geocodeAddress } = require('../services/pharmacyFinder');
const { LANGUAGE_MENU, getMessages } = require('../i18n/messages');
const prisma = require('../db/client');

const STATES = {
  IDLE:                 'IDLE',
  AWAITING_LANGUAGE:    'AWAITING_LANGUAGE',
  AWAITING_CHOICE:      'AWAITING_CHOICE',
  AWAITING_LOCATION:    'AWAITING_LOCATION',
  AWAITING_FULFILLMENT: 'AWAITING_FULFILLMENT',
};

// ── DB helpers ─────────────────────────────────────────────────────────────

async function getOrCreateConversation(waId) {
  return prisma.conversation.upsert({
    where:  { waId },
    update: { lastMessageAt: new Date() },
    create: { waId, state: STATES.IDLE }
  });
}

async function transitionTo(waId, state, pendingPrescriptionId = undefined) {
  const data = { state };
  if (pendingPrescriptionId !== undefined) data.pendingPrescriptionId = pendingPrescriptionId;
  return prisma.conversation.update({ where: { waId }, data });
}

async function setLanguage(waId, language) {
  return prisma.conversation.update({
    where: { waId },
    data:  { language, state: STATES.IDLE }
  });
}

async function getLastPrescription(conversationId) {
  return prisma.prescription.findFirst({
    where:   { conversationId },
    orderBy: { submittedAt: 'desc' }
  });
}

async function recordFulfillment(prescriptionId, fulfillmentStatus, fulfilled) {
  return prisma.prescription.update({
    where: { id: prescriptionId },
    data:  { fulfilled, fulfillmentStatus, fulfilledAt: new Date() }
  });
}

// ── Main handler ───────────────────────────────────────────────────────────
// sendFn: optional override for sendMessage — used by the demo chat UI to
// collect responses instead of pushing them to WhatsApp.

async function handleIncomingMessage(from, type, message, sendFn) {
  const send = sendFn || sendMessage;

  const conversation = await getOrCreateConversation(from);
  const { state, id: conversationId, pendingPrescriptionId, language } = conversation;

  // ── LANGUAGE SELECTION ─────────────────────────────────────────────────────
  if (!language) {
    if (state === STATES.AWAITING_LANGUAGE && type === 'text') {
      const text = message.text.body.trim();
      const selected = text === '1' ? 'en' : text === '2' ? 'sn' : text === '3' ? 'nd' : null;
      if (selected) {
        await setLanguage(from, selected);
        const m = getMessages(selected);
        await send(from, m.LANGUAGE_CHANGED);
        await send(from, m.MENU);
        return;
      }
    }
    await send(from, LANGUAGE_MENU);
    await transitionTo(from, STATES.AWAITING_LANGUAGE);
    return;
  }

  const m = getMessages(language);

  // ── IMAGE ──────────────────────────────────────────────────────────────────
  if (type === 'image') {
    const mediaId = message.image?.id;
    const buffer  = message.image?._buffer; // set by demo route for direct uploads

    await send(from, m.SCANNING);

    const { text: ocrText, medications, isValidPrescription } = buffer
      ? await extractTextFromBuffer(buffer)
      : await extractTextFromImage(mediaId);

    if (isValidPrescription === false) {
      await send(from, m.NOT_A_PRESCRIPTION);
      return;
    }

    if (!ocrText && medications.length === 0) {
      await send(from, m.OCR_FAIL);
      return;
    }

    console.log(`[handler] OCR done — rawText length: ${ocrText.length}, medications: ${medications.length}`);

    // If vision extraction returned text but no structured medications,
    // fall back to raw-text drug lookup so we never return empty-handed
    let matched = [], notInMCAZ = [];
    if (medications.length > 0) {
      ({ matched, notInMCAZ } = await matchMedications(medications));
    } else {
      matched = await lookupDrugs(ocrText);
    }

    const prescription = await prisma.prescription.create({
      data: {
        conversationId,
        rawOcrText:    ocrText,
        drugsDetected: [
          ...matched.map(d => d.genericName || d.tradeName),
          ...notInMCAZ,
        ],
      }
    });

    if (matched.length === 0 && notInMCAZ.length === 0) {
      await send(from, m.NO_DRUGS);
      return;
    }

    // Build drug list — confirmed MCAZ matches first, then unregistered drugs
    const lines = [
      ...matched.map(d =>
        `• *${d.tradeName || d.genericName}* (${d.genericName}) — ${d.strength || 'see label'}`
      ),
      ...(notInMCAZ.length > 0
        ? [
            '',
            `_Not found in MCAZ register:_`,
            ...notInMCAZ.map(n => `• ${n}`),
          ]
        : []),
    ];
    const drugList = lines.join('\n');

    await send(from, m.prescriptionDetected(drugList));
    await send(from, m.FULFILLMENT_PROMPT);
    await transitionTo(from, STATES.AWAITING_FULFILLMENT, prescription.id);
    return;
  }

  // ── LOCATION ───────────────────────────────────────────────────────────────
  if (type === 'location' && state === STATES.AWAITING_LOCATION) {
    const { latitude, longitude } = message.location;
    await send(from, m.FINDING_PHARMACIES);

    const pharmacies = await findNearestPharmacies(latitude, longitude, 3);

    if (pharmacies.length === 0) {
      await send(from, m.NO_PHARMACIES);
      await transitionTo(from, STATES.IDLE);
      return;
    }

    const list = pharmacies.map((p, i) =>
      `*${i + 1}. ${p.premisesName}*\n📍 ${p.address}, ${p.town}${p.distanceKm ? `\n📏 ${p.distanceKm.toFixed(1)} km away` : ''}`
    ).join('\n\n');

    await send(from, m.nearestPharmacies(list));
    await transitionTo(from, STATES.IDLE);
    return;
  }

  // ── TEXT ───────────────────────────────────────────────────────────────────
  if (type === 'text') {
    const text  = message.text.body.trim();
    const lower = text.toLowerCase();

    // ── Language change ───────────────────────────────────────────────────────
    if (text === '0' || lower === 'language' || lower === 'change language' ||
        lower === 'shandura mutauro' || lower === 'shintsha ulimi') {
      await prisma.conversation.update({
        where: { waId: from },
        data:  { language: null, state: STATES.AWAITING_LANGUAGE }
      });
      await send(from, LANGUAGE_MENU);
      return;
    }

    // ── AWAITING_FULFILLMENT ──────────────────────────────────────────────────
    if (state === STATES.AWAITING_FULFILLMENT) {
      const isYes =
        text === '1' ||
        lower === 'yes' || lower === 'hongu' || lower === 'ehe' || lower === 'yebo' ||
        lower.startsWith('yes ') || lower.includes('collected') || lower.includes('got my');

      const isNo =
        text === '3' ||
        lower === 'no' || lower === 'kwete' || lower === 'cha' || lower === 'hatsi' ||
        lower.startsWith('no,') || lower.startsWith('no ') ||
        lower.includes("couldn't") || lower.includes('could not') || lower.includes('angikutholanga');

      const isLooking =
        text === '2' ||
        lower === 'still' || lower === 'looking' || lower === 'ndicharamba' ||
        lower === 'ngisadinga' || lower.includes('not yet') || lower.includes('still looking') ||
        lower.includes('still searching') || lower.includes('ndichatsvaga') || lower.includes('ngisatshinga');

      if (isYes) {
        if (pendingPrescriptionId) await recordFulfillment(pendingPrescriptionId, 'YES', true);
        await transitionTo(from, STATES.AWAITING_CHOICE, null);
        await send(from, m.FULFILLMENT_YES);
        return;
      }
      if (isNo) {
        if (pendingPrescriptionId) await recordFulfillment(pendingPrescriptionId, 'NO', false);
        await transitionTo(from, STATES.AWAITING_CHOICE, null);
        await send(from, m.FULFILLMENT_NO);
        return;
      }
      if (isLooking) {
        if (pendingPrescriptionId) await recordFulfillment(pendingPrescriptionId, 'STILL_LOOKING', false);
        await transitionTo(from, STATES.AWAITING_CHOICE, null);
        await send(from, m.FULFILLMENT_LOOKING);
        return;
      }

      await send(from, m.fulfillmentReprompt(m.FULFILLMENT_PROMPT));
      return;
    }

    // ── Option 1 — Translate ─────────────────────────────────────────────────
    if (text === '1' || lower.includes('translate') || lower.includes('read prescription') ||
        lower.includes('verenga') || lower.includes('funda')) {
      await send(from, m.SEND_PHOTO);
      return;
    }

    // ── Option 2 — Explain medication ────────────────────────────────────────
    if (text === '2' || lower.includes('explain') || lower.includes('medication') ||
        lower.includes('tsanangura') || lower.includes('chaza')) {
      const lastRx = await getLastPrescription(conversationId);
      if (!lastRx || lastRx.drugsDetected.length === 0) {
        await send(from, m.NO_PRESCRIPTION_YET);
        return;
      }
      await send(from, m.LOOKING_UP);
      const explanation = await explainDrugs(lastRx.drugsDetected, language);
      await send(from, m.medicationExplained(explanation));
      await transitionTo(from, STATES.IDLE);
      return;
    }

    // ── Option 3 — Find pharmacy ─────────────────────────────────────────────
    if (text === '3' || lower.includes('pharmacy') || lower.includes('find') ||
        lower.includes('tsvaga') || lower.includes('thola') || lower.includes('chemist')) {
      await send(from, m.SHARE_LOCATION);
      await transitionTo(from, STATES.AWAITING_LOCATION);
      return;
    }

    // ── Option 4 — Retrieve last prescription ────────────────────────────────
    if (text === '4' || lower.includes('my prescription') || lower.includes('last prescription') ||
        lower.includes('bvisa') || lower.includes('landa')) {
      const lastRx = await getLastPrescription(conversationId);
      if (!lastRx) {
        await send(from, m.NO_RECORD);
        return;
      }
      const drugs = lastRx.drugsDetected.join(', ');
      const date  = lastRx.submittedAt.toLocaleDateString('en-GB');
      await send(from, m.lastPrescription(date, drugs));
      return;
    }

    // ── Town name / address while waiting for location ───────────────────────
    if (state === STATES.AWAITING_LOCATION) {
      // 1. Fast path: exact town name match in MCAZ register
      const byTown = await findPharmaciesByTown(text, 3);
      if (byTown.length > 0) {
        const list = byTown.map((p, i) =>
          `*${i + 1}. ${p.premisesName}*\n📍 ${p.address}, ${p.town}`
        ).join('\n\n');
        await send(from, m.townPharmacies(text, list));
        await transitionTo(from, STATES.IDLE);
        return;
      }

      // 2. Geocode the address / suburb / landmark with Nominatim
      await send(from, m.FINDING_PHARMACIES);
      const geo = await geocodeAddress(text);
      if (geo) {
        // Use the town extracted from geocoding directly; avoids a second reverse-geocode call
        const pharmacies = geo.town
          ? await findPharmaciesByTown(geo.town, 3)
          : await findNearestPharmacies(geo.lat, geo.lon, 3);
        if (pharmacies.length > 0) {
          const resolvedTown = geo.town || text;
          const list = pharmacies.map((p, i) =>
            `*${i + 1}. ${p.premisesName}*\n📍 ${p.address}, ${p.town}`
          ).join('\n\n');
          await send(from, m.townPharmacies(resolvedTown, list));
          await transitionTo(from, STATES.IDLE);
          return;
        }
      }

      // 3. Nothing found
      await send(from, m.NO_PHARMACIES);
      await transitionTo(from, STATES.IDLE);
      return;
    }

    // ── Default — show menu ──────────────────────────────────────────────────
    await send(from, m.MENU);
    await transitionTo(from, STATES.IDLE);
    return;
  }

  // Fallback for other message types
  await send(from, m.MENU);
}

module.exports = { handleIncomingMessage };
