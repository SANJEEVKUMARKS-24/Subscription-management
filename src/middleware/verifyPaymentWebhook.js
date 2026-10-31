const crypto = require('node:crypto');
const env = require('../config/env');

module.exports = (req, res, next) => {
  if (!env.paymentWebhookSecret) return res.status(503).json({ success: false, message: 'Payment webhook is not configured' });
  if (!/^[a-z0-9_-]{1,40}$/i.test(req.params.provider)) return res.status(400).json({ success: false, message: 'Invalid payment provider' });
  const value = (req.get('x-webhook-signature') || '').replace(/^sha256=/i, '');
  if (!/^[a-f\d]{64}$/i.test(value)) return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
  const expected = crypto.createHmac('sha256', env.paymentWebhookSecret).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  const actualBuffer = Buffer.from(value, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
  }
  return next();
};
