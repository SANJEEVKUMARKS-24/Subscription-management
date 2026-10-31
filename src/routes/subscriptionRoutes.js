const express = require('express');
const subscriptionController = require('../controllers/subscriptionController');

const router = express.Router();

router.get('/subscriptions', subscriptionController.listSubscriptions);
router.post('/subscriptions', subscriptionController.createSubscription);
router.get('/subscriptions/:id', subscriptionController.getSubscriptionById);
router.put('/subscriptions/:id', subscriptionController.updateSubscription);
router.delete('/subscriptions/:id', subscriptionController.deleteSubscription);

module.exports = router;
