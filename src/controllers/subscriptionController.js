const subscriptionService = require('../services/subscriptionService');

class SubscriptionController {
  async listSubscriptions(req, res, next) {
    try {
      const result = await subscriptionService.listSubscriptions(req.user, req.query);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async createSubscription(req, res, next) {
    try {
      const result = await subscriptionService.createSubscription(req.body, req.user, req);
      return res.status(result.status || 200).json(result.body || result);
    } catch (error) {
      return next(error);
    }
  }

  async getSubscriptionById(req, res, next) {
    try {
      const result = await subscriptionService.getSubscriptionById(req.params.id, req.user);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async updateSubscription(req, res, next) {
    try {
      const result = await subscriptionService.updateSubscription(req.params.id, req.body, req.user);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async deleteSubscription(req, res, next) {
    try {
      const result = await subscriptionService.closeSubscription(req.params.id, req.user);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new SubscriptionController();
