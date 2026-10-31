const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const planRoutes = require('./routes/planRoutes');
const billingRoutes = require('./routes/billingRoutes');
const bootstrapRoutes = require('./routes/bootstrapRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const stripeWebhookRoutes = require('./routes/stripeWebhookRoutes');
const platformRoutes = require('./routes/platformRoutes');
const authMiddleware = require('./middleware/authMiddleware');
const requestContext = require('./middleware/requestContext');
const rateLimit = require('./middleware/rateLimit');

const app = express();

app.use(requestContext);
app.use(cors({ origin: env.corsOrigin ? env.corsOrigin.split(',').map((value) => value.trim()) : false }));
app.use(express.json({ limit: '1mb', verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Subscription Management backend is running',
    environment: env.nodeEnv,
  });
});

app.get('/api/health/ready', async (req, res) => {
  try {
    await require('./config/database').healthCheck();
    return res.status(200).json({ success: true, database: 'ready', requestId: req.id });
  } catch (error) {
    return res.status(503).json({ success: false, database: 'unavailable', requestId: req.id });
  }
});

app.use(`/api/${env.apiVersion}`, webhookRoutes);
app.use(`/api/${env.apiVersion}`, stripeWebhookRoutes);
app.use(`/api/${env.apiVersion}`, rateLimit({ windowMs: 60_000, max: env.apiRateLimitMax }));
app.use(`/api/${env.apiVersion}`, rateLimit({ windowMs: 60_000, max: 10 }), authRoutes);
app.use(`/api/${env.apiVersion}`, authMiddleware, bootstrapRoutes);
app.use(`/api/${env.apiVersion}`, authMiddleware, platformRoutes);
app.use(`/api/${env.apiVersion}`, authMiddleware, subscriptionRoutes);
app.use(`/api/${env.apiVersion}`, authMiddleware, planRoutes);
app.use(`/api/${env.apiVersion}`, authMiddleware, billingRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    requestId: req.id,
  });
});

app.use(errorHandler);

if (require.main === module) {
  app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

module.exports = app;
