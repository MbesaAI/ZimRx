const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function detectMimeType(buffer) {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer.slice(8, 12).toString() === 'WEBP')  return 'image/webp';
  return 'image/jpeg'; // safe default for WhatsApp photos
}

async function extractTextFromBuffer(imageBuffer) {
  try {
    const mediaType = detectMimeType(imageBuffer);
    const base64    = imageBuffer.toString('base64');

    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Examine this image carefully.

STEP 1 — Does this document contain pharmaceutical drug names written with doses?

Ignore the printed form type entirely. A doctor in a rural clinic or busy hospital may write a drug prescription on any available paper — an X-ray request form, a lab form, a referral slip, or plain paper. What matters is the CONTENT, not the form header.

Ask yourself: are there actual pharmaceutical drug names (medicines, tablets, capsules, syrups, creams, drops, injections) written here with doses or instructions?

Set isValidPrescription: TRUE if pharmaceutical drug names with doses appear anywhere on the document — even if the printed header says "X-RAY REQUEST", "LAB REQUEST", "REFERRAL", or anything else.

Set isValidPrescription: FALSE only when:
• The document is a commercial document (INVOICE, QUOTATION, DELIVERY NOTE, RECEIPT) listing non-medical goods (clothing, car parts, food, school supplies) with pricing columns — AND contains no drug names
• The document contains ONLY medical equipment, devices, or procedures (oxygen concentrators, nasal prongs, X-ray examinations, blood tests, referral reasons) but NO pharmaceutical drug names with doses

STEP 2 — If drug names ARE present, extract each medication. Handwriting may be very poor — do your best.

Use ALL context clues to recover the correct pharmaceutical name:
• Specialist on the letterhead: Paediatrician → Cloxacillin, Bactroban, Nerizone, emulsifying ointment, Hydrocortisone; ENT → Flomist, Avamys, Exocin, Otosporin
• Dosage form after the name: "nasal spray" → nasal corticosteroid; "cream" → topical antibiotic/steroid; "ear drops" → antibiotic ear drop
• Vowels are easily confused in handwriting (o↔e, a↔e, i↔u) — choose the real pharmaceutical name that makes clinical sense
• Other drugs on the same prescription as cross-reference
• Medical equipment and devices (oxygen concentrators, nebulizers, etc.) can be legitimately prescribed — extract them if a doctor has prescribed them with usage instructions

Return ONLY a JSON object:
{
  "isValidPrescription": true,
  "rawText": "all visible text",
  "medications": [{"name": "correct drug name", "dose": "...", "form": "..."}]
}

If NO drug names with doses are present:
{
  "isValidPrescription": false,
  "notPrescriptionReason": "invoice|quotation|receipt|xray_request|lab_request|referral|no_drugs|other",
  "rawText": "all visible text",
  "medications": []
}

Return ONLY the JSON object, no markdown, no other text.`,
          },
        ],
      }],
    });

    const raw = response.content[0]?.text?.trim() || '';
    try {
      // Strip markdown code fences Claude sometimes adds
      const cleaned = raw.replace(/```(?:json)?\s*/gi, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const isValidPrescription = parsed.isValidPrescription !== false;
        const medications = Array.isArray(parsed.medications)
          ? parsed.medications.filter(m => m && m.name)
          : [];
        if (!isValidPrescription) {
          console.log(`[OCR] rejected non-prescription: ${parsed.notPrescriptionReason}`);
          return { text: parsed.rawText || raw, medications: [], isValidPrescription: false, notPrescriptionReason: parsed.notPrescriptionReason };
        }
        console.log(`[OCR] extracted medications:`, JSON.stringify(medications));
        return { text: parsed.rawText || raw, medications, isValidPrescription: true };
      }
    } catch (parseErr) {
      console.error('[OCR] JSON parse error:', parseErr.message, '| raw:', raw.slice(0, 200));
    }

    return { text: raw, medications: [], isValidPrescription: true };
  } catch (error) {
    console.error('OCR error:', error.message);
    return { text: '', medications: [] };
  }
}

async function extractTextFromImage(mediaId) {
  try {
    const urlResponse = await axios.get(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
    );
    const mediaUrl = urlResponse.data.url;

    const imageResponse = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    });

    return extractTextFromBuffer(Buffer.from(imageResponse.data));
  } catch (error) {
    console.error('OCR error:', error.message);
    return { text: '', medications: [] };
  }
}

module.exports = { extractTextFromImage, extractTextFromBuffer };
