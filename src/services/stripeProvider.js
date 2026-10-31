const Stripe = require('stripe');
const env = require('../config/env');
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

let client;
function stripe() {
  if (!env.stripeSecretKey) throw fail('Stripe payments are not configured', 503);
  if (!client) client = new Stripe(env.stripeSecretKey);
  return client;
}

function createCheckoutSession(params, idempotencyKey) {
  return stripe().checkout.sessions.create(params, { idempotencyKey });
}

function createRefund(params, idempotencyKey) {
  return stripe().refunds.create(params, { idempotencyKey });
}

function verifyWebhook(rawBody, signature) {
  if (!env.stripeWebhookSecret) throw fail('Stripe webhook is not configured', 503);
  if (!env.stripeSecretKey) throw fail('Stripe payments are not configured', 503);
  try {
    return stripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  } catch {
    throw fail('Invalid Stripe webhook signature', 401);
  }
}

module.exports = { createCheckoutSession, createRefund, verifyWebhook };
