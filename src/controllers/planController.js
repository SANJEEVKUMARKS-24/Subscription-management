const planService = require('../services/planService');

class PlanController {
  async listPlans(req, res, next) {
    try {
      const result = await planService.listPlans();
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async createPlan(req, res, next) {
    try {
      const result = await planService.createPlan(req.body);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new PlanController();
