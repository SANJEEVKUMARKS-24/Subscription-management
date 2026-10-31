const billingService = require('../services/billingService');

class BillingController {
  async listInvoices(req, res, next) {
    try {
      const result = await billingService.listInvoices();
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async createInvoice(req, res, next) {
    try {
      const result = await billingService.createInvoice(req.body);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new BillingController();
