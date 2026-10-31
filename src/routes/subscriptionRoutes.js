const express = require('express');
const subscriptionController = require('../controllers/subscriptionController');
const requireRoles = require('../middleware/requireRoles');
const validateIdParam = require('../middleware/validateIdParam');

const router = express.Router();
router.param('id', validateIdParam('id'));

router.get('/subscriptions', subscriptionController.listSubscriptions);
router.post('/subscriptions', subscriptionController.createSubscription);
router.get('/subscriptions/:id', subscriptionController.getSubscriptionById);
router.put('/subscriptions/:id', requireRoles('ADMIN', 'STAFF'), subscriptionController.updateSubscription);
router.delete('/subscriptions/:id', subscriptionController.deleteSubscription);
router.post('/subscriptions/:id/pause', async (req, res, next) => {
  try {
    const result = await require('../services/subscriptionService').pauseSubscription(req.params.id, req.user);
    return res.status(200).json(result);
  } catch (error) { return next(error); }
});
router.post('/subscriptions/:id/resume', async (req, res, next) => {
  try {
    const result = await require('../services/subscriptionService').resumeSubscription(req.params.id, req.user);
    return res.status(200).json(result);
  } catch (error) { return next(error); }
});
router.post('/subscriptions/:id/activate', requireRoles('ADMIN', 'STAFF'), async (req, res, next) => {
  try {
    const result = await require('../services/subscriptionService').activateSubscription(req.params.id, req.user);
    return res.status(200).json(result);
  } catch (error) { return next(error); }
});

module.exports = router;
