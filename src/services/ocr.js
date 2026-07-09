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
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
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

STEP 1 — Decide if this is a medical prescription. When in doubt, treat it as a prescription.

Reject ONLY when the document is CLEARLY a commercial or non-medical document:
• Headed INVOICE, QUOTATION, DELIVERY NOTE, RECEIPT, or STATEMENT
• Itemises non-medical goods: clothing, car parts, food, school supplies, building materials, electronics
• Has commercial columns: QTY / UNIT PRICE / TOTAL PRICE / GRAND TOTAL / VAT / SUB-TOTAL
• Issued by a shop, garage, mechanic, supplier, wholesaler, school, or auto dealer

Accept as a prescription when you see ANY of these — even if the handwriting is very messy:
• A printed "PRESCRIPTION FORM", "PRESCRIPTION", or "Rx" heading
• A doctor's personal letterhead (doctor name + medical qualifications: MBChB, MD, MBBCh, MMed, FRCGP, FCORL, Paediatrician, Specialist, etc.)
• A "DRUGS PRESCRIBED" or "MEDICATIONS" section
• A doctor stamp, AHFOZ number, or prescribing doctor registration number
• Handwritten drug names with doses, even if very hard to read

STEP 2 — If it IS a prescription, extract each medication. The handwriting may be very poor — do your best.

Use ALL context clues to identify the correct pharmaceutical name:
• Specialist on the letterhead: Paediatrician → paediatric antibiotics, antifungals, emollients (Cloxacillin, Bactroban, Nerizone, emulsifying ointment, Hydrocortisone); ENT surgeon → nasal sprays and ear drops (Flomist, Avamys, Exocin, Otosporin)
• Dosage form after the name: "nasal spray" → nasal corticosteroid; "cream" → topical antibiotic or steroid; "ear drops" → antibiotic ear drop
• Other drugs on the same prescription as cross-reference
• Vowels are easily confused in handwriting (o↔e, a↔e, i↔u) — choose the real pharmaceutical name that makes clinical sense
• If a word is completely illegible but a dose/form is visible, make your best pharmaceutical guess for that specialty

Return ONLY a JSON object:
{
  "isValidPrescription": true,
  "rawText": "all visible text",
  "medications": [{"name": "correct drug name", "dose": "...", "form": "..."}]
}

If NOT a prescription (clearly a commercial document):
{
  "isValidPrescription": false,
  "notPrescriptionReason": "invoice|quotation|receipt|delivery_note|other",
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
