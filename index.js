require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const webhookRoute = require('./src/routes/webhook');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/webhook', webhookRoute);

app.get('/', (req, res) => {
  res.json({
    service: 'MbesaAI',
    status:  'running',
    version: '1.0.0',
    purpose: 'WhatsApp prescription assistant for Zimbabwe'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MbesaAI running on port ${PORT}`));
