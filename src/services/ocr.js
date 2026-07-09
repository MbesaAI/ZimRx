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

STEP 1 — Is this a genuine medical prescription from a doctor or healthcare provider?

Signs it IS a valid prescription: headed "PRESCRIPTION FORM" or "Rx", has a "DRUGS PRESCRIBED" / "MEDICATIONS" section, lists drug names with doses, has a doctor name/signature/stamp/registration number (e.g. AHFOZ number).

Signs it is NOT a prescription — reject these:
• Headed INVOICE, QUOTATION, DELIVERY NOTE, RECEIPT, or STATEMENT
• Items are clothing, car parts, food, school supplies, building materials, or other non-medical goods
• Has columns for QTY / UNIT PRICE / TOTAL PRICE / GRAND TOTAL / VAT / SUB-TOTAL
• Issued by a shop, garage, mechanic, supplier, wholesaler, or school

STEP 2 — If it IS a prescription, extract each medication. Handwritten drug names often have vowel OCR errors (o↔e, a↔e, i↔u, etc.). Use ALL available context clues to recover the correct pharmaceutical name:
• Specialist type on the letterhead: ENT/Ear-Nose-Throat surgeon → expect nasal sprays and ear drops (Flomist, Avamys, Nasonex, Otosporin, Exocin); Paediatrician → paediatric antibiotics, antiparasitics; Oncologist → chemotherapy agents; etc.
• Dosage form written after the name: "nasal spray" → the drug is almost certainly a nasal corticosteroid (Flomist/Avamys/Nasonex), NOT an unknown word like "flemist"
• Other drugs on the same prescription as cross-reference
• When a word looks like a misspelled drug, return the closest real pharmaceutical name

Return ONLY a JSON object:
{
  "isValidPrescription": true,
  "rawText": "all visible text",
  "medications": [{"name": "correct drug name", "dose": "...", "form": "..."}]
}

If NOT a prescription:
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
