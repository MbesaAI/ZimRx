const vision = require('@google-cloud/vision');
const axios = require('axios');

const client = new vision.ImageAnnotatorClient();

async function getWhatsAppMediaBuffer(mediaId) {
  const urlResponse = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  const mediaUrl = urlResponse.data.url;

  const imageResponse = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
  });

  return Buffer.from(imageResponse.data);
}

async function extractTextFromImage(mediaId) {
  try {
    const imageBuffer = await getWhatsAppMediaBuffer(mediaId);

    const [result] = await client.textDetection({
      image: { content: imageBuffer }
    });

    const detections = result.textAnnotations;
    if (detections && detections.length > 0) {
      return detections[0].description;
    }
    return '';
  } catch (error) {
    console.error('OCR error:', error.message);
    return '';
  }
}

module.exports = { extractTextFromImage };
