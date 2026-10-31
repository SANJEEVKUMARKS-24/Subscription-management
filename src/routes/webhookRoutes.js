const express = require('express');
const controller = require('../controllers/webhookController');
const verifyPaymentWebhook = require('../middleware/verifyPaymentWebhook');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();
router.post('/webhooks/payments/:provider', rateLimit({ windowMs: 60_000, max: 120 }), verifyPaymentWebhook, controller.payment);
module.exports = router;
