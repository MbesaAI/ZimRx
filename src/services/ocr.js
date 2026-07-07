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
            text: 'This is a medical prescription. Extract ALL text exactly as it appears — drug names, dosages, instructions, quantities, prescriber details. Output only the raw extracted text with no commentary.',
          },
        ],
      }],
    });

    return response.content[0]?.text?.trim() || '';
  } catch (error) {
    console.error('OCR error:', error.message);
    return '';
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
    return '';
  }
}

module.exports = { extractTextFromImage, extractTextFromBuffer };
