const platformService = require('../services/platformService');

exports.payment = async (req, res, next) => {
  try {
    const eventId = req.get('x-provider-event-id') || req.body?.id;
    if (!eventId || !req.body?.type) return res.status(400).json({ success: false, message: 'Provider event id and type are required' });
    const result = await platformService.processWebhook(req.params.provider, eventId, req.body);
    return res.status(200).json({ success: true, duplicate: result.duplicate });
  } catch (error) { return next(error); }
};
