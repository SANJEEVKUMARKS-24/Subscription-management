const express = require('express');
const stripeWebhookController = require('../controllers/stripeWebhookController');
const verifyStripeWebhook = require('../middleware/verifyStripeWebhook');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();
router.post('/webhooks/stripe', rateLimit({ windowMs: 60_000, max: 120 }), verifyStripeWebhook, stripeWebhookController.handle);
module.exports = router;
