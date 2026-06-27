require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const swaggerUi  = require('swagger-ui-express');
const { swaggerSpec } = require('./src/swagger/swagger');

const webhookRoute    = require('./src/routes/webhook');
const translateRoute  = require('./src/routes/translate');
const explainRoute    = require('./src/routes/explain');
const pharmaciesRoute = require('./src/routes/pharmacies');
const recordsRoute    = require('./src/routes/records');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api-docs',       swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/webhook',        webhookRoute);
app.use('/api/translate',  translateRoute);
app.use('/api/explain',    explainRoute);
app.use('/api/pharmacies', pharmaciesRoute);
app.use('/api/records',    recordsRoute);

// Temporary debug route — remove after webhook is working
app.get('/debug/webhook', (req, res) => {
  res.json({
    query:            req.query,
    tokenEnvSet:      !!process.env.WEBHOOK_VERIFY_TOKEN,
    tokenEnvValue:    process.env.WEBHOOK_VERIFY_TOKEN,
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'MbesaAI',
    status:  'running',
    version: '1.0.0',
    docs:    '/api-docs',
    purpose: 'WhatsApp prescription assistant for Zimbabwe'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nMbesaAI running on port ${PORT}`);
  console.log(`Swagger docs → http://localhost:${PORT}/api-docs\n`);
});
