const planService = require('../services/planService');

class PlanController {
  async listPlans(req, res, next) {
    try {
      const result = await planService.listPlans(req.query);
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

  async getPlan(req, res, next) {
    try { return res.status(200).json(await planService.getPlan(req.params.planId)); }
    catch (error) { return next(error); }
  }

  async updatePlan(req, res, next) {
    try { return res.status(200).json(await planService.updatePlan(req.params.planId, req.body || {}, req.user)); }
    catch (error) { return next(error); }
  }

  async archivePlan(req, res, next) {
    try { return res.status(200).json(await planService.archivePlan(req.params.planId, req.user)); }
    catch (error) { return next(error); }
  }

  async replacePlanItems(req, res, next) {
    try { return res.status(200).json(await planService.replacePlanItems(req.params.planId, req.body?.items, req.user)); }
    catch (error) { return next(error); }
  }
}

module.exports = new PlanController();
