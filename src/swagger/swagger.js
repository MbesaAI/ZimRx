const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'ZimRx API',
      version:     '1.0.0',
      description: 'WhatsApp AI Prescription Assistant for Zimbabwe — POTRAZ AI4I 2026',
      contact:     { name: 'ZimRx Team' }
    },
    servers: [
      { url: 'http://localhost:3000',          description: 'Local development' },
      { url: 'https://web-production-ece38.up.railway.app', description: 'Production (Railway)' },
    ],
    tags: [
      { name: 'Webhook',    description: 'WhatsApp Cloud API webhook endpoints' },
      { name: 'Translate',  description: 'Prescription OCR and drug lookup' },
      { name: 'Explain',    description: 'LLM drug explanation' },
      { name: 'Pharmacies', description: 'MCAZ pharmacy register queries' },
      { name: 'Records',    description: 'Patient prescription records' },
    ]
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = { swaggerSpec };
