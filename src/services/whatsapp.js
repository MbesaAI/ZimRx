const axios = require('axios');

const BASE_URL = () =>
  `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

const HEADERS = () => ({
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json'
});

async function sendMessage(to, text) {
  await axios.post(BASE_URL(), {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false }
  }, { headers: HEADERS() });
}

async function sendList(to, bodyText, items) {
  const numbered = items.map((item, i) => `${i + 1}. ${item}`).join('\n');
  await sendMessage(to, `${bodyText}\n\n${numbered}`);
}

module.exports = { sendMessage, sendList };
