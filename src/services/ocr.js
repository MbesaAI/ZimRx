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

STEP 1 — Is this a drug prescription? A drug prescription is a document from a doctor or clinic that lists MEDICATIONS (drugs) for a patient to collect and take.

ACCEPT as a prescription when it PRESCRIBES DRUGS and you see ANY of:
• A printed "PRESCRIPTION FORM", "PRESCRIPTION", or "Rx" heading
• A "DRUGS PRESCRIBED" or "MEDICATIONS" section with drug names and doses
• A doctor's personal letterhead (name + qualifications: MBChB, MD, MMed, Paediatrician, Specialist, etc.) with handwritten drug names and doses below
• A doctor stamp or AHFOZ/prescribing registration number alongside drug entries

REJECT — set isValidPrescription: false — for ALL of these:

Non-medical commercial documents:
• Headed INVOICE, QUOTATION, DELIVERY NOTE, RECEIPT, or STATEMENT
• Itemises non-medical goods: clothing, car parts, food, school supplies, building materials
• Has commercial columns: QTY / UNIT PRICE / TOTAL / GRAND TOTAL / VAT / SUB-TOTAL
• Issued by a shop, garage, mechanic, supplier, wholesaler, or school

Medical-but-not-a-prescription documents (these are FROM a hospital but do NOT prescribe drugs):
• X-RAY REQUEST, RADIOLOGY REQUEST, IMAGING REQUEST
• LAB REQUEST, LABORATORY REQUEST, PATHOLOGY REQUEST, BLOOD TEST REQUEST
• REFERRAL LETTER, REFERRAL FORM, TRANSFER LETTER
• ADMISSION FORM, WARD ADMISSION, HOSPITALIZATION form
• SICK NOTE, MEDICAL CERTIFICATE, FIT NOTE
• Any form whose main purpose is to request an investigation, procedure, or service — NOT to dispense medication

STEP 2 — If it IS a drug prescription, extract each medication. The handwriting may be very poor — do your best.

Use ALL context clues to identify the correct pharmaceutical name:
• Specialist on letterhead: Paediatrician → Cloxacillin, Bactroban, Nerizone, emulsifying ointment, Hydrocortisone; ENT → Flomist, Avamys, Exocin, Otosporin
• Dosage form after the name: "nasal spray" → nasal corticosteroid; "cream" → topical antibiotic/steroid; "ear drops" → antibiotic ear drop
• Vowels are easily confused in handwriting (o↔e, a↔e, i↔u) — choose the real pharmaceutical name that makes clinical sense
• Other drugs on the same prescription as cross-reference
• Do NOT extract medical equipment, devices, or procedures (oxygen concentrators, nasal prongs, X-rays) as medications

Return ONLY a JSON object:
{
  "isValidPrescription": true,
  "rawText": "all visible text",
  "medications": [{"name": "correct drug name", "dose": "...", "form": "..."}]
}

If NOT a drug prescription:
{
  "isValidPrescription": false,
  "notPrescriptionReason": "invoice|quotation|receipt|xray_request|lab_request|referral|admission_form|sick_note|other",
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
