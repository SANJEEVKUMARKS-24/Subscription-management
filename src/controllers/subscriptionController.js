const subscriptionService = require('../services/subscriptionService');

class SubscriptionController {
  async listSubscriptions(req, res, next) {
    try {
      const result = await subscriptionService.listSubscriptions();
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async createSubscription(req, res, next) {
    try {
      const result = await subscriptionService.createSubscription(req.body);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async getSubscriptionById(req, res, next) {
    try {
      const result = await subscriptionService.getSubscriptionById(req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async updateSubscription(req, res, next) {
    try {
      const result = await subscriptionService.updateSubscription(req.params.id, req.body);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async deleteSubscription(req, res, next) {
    try {
      const result = await subscriptionService.deleteSubscription(req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new SubscriptionController();
