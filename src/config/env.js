require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',
  apiRateLimitMax: Math.max(1, Number.parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 300),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173',
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  defaultCurrency: (process.env.DEFAULT_CURRENCY || 'USD').toUpperCase(),
  emailApiUrl: process.env.EMAIL_API_URL || '',
  emailApiKey: process.env.EMAIL_API_KEY || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  publicAppUrl: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
};
