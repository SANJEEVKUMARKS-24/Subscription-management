const platformService = require('../services/platformService');

exports.handle = async (req, res, next) => {
  try {
    const result = await platformService.processStripeEvent(req.stripeEvent);
    return res.status(200).json({ received: true, duplicate: result.duplicate });
  } catch (error) { return next(error); }
};
