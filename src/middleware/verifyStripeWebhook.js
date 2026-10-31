const stripeProvider = require('../services/stripeProvider');

module.exports = (req, res, next) => {
  try {
    if (!req.rawBody) throw Object.assign(new Error('Stripe webhook requires the original request body'), { statusCode: 400 });
    req.stripeEvent = stripeProvider.verifyWebhook(req.rawBody, req.get('stripe-signature'));
    return next();
  } catch (error) { return next(error); }
};
