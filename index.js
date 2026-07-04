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

app.get('/', (req, res) => {
  res.json({
    service: 'ZimRx',
    status:  'running',
    version: '1.0.0',
    docs:    '/api-docs',
    purpose: 'WhatsApp prescription assistant for Zimbabwe'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nZimRx running on port ${PORT}`);
  console.log(`Swagger docs → http://localhost:${PORT}/api-docs\n`);
});
