const platformService = require('../services/platformService');

class BillingController {
  async listInvoices(req, res, next) {
    try {
      const result = await platformService.listInvoices(req.user, req.query);
      return res.status(200).json({ success: true, ...result });
    } catch (error) { return next(error); }
  }
  async getInvoice(req, res, next) {
    try { return res.status(200).json({ success: true, data: await platformService.getInvoice(req.params.invoiceId, req.user) }); }
    catch (error) { return next(error); }
  }
  async cancelInvoice(req, res, next) {
    try { return res.status(200).json({ success: true, data: await platformService.cancelInvoice(req.params.invoiceId, req.user) }); }
    catch (error) { return next(error); }
  }
  async createInvoice(req, res, next) {
    try {
      const result = await platformService.generateInvoice(req.params.subscriptionId, req.body, req.user, req);
      return res.status(result.status || 200).json(result.body || result);
    } catch (error) { return next(error); }
  }
  async createCheckout(req, res, next) {
    try {
      const result = await platformService.createCheckout(req.params.invoiceId, req.user, req);
      return res.status(result.status || 200).json(result.body || result);
    } catch (error) { return next(error); }
  }
  async listPayments(req, res, next) {
    try {
      const data = await platformService.listPayments(req.params.invoiceId, req.user);
      return res.status(200).json({ success: true, data });
    } catch (error) { return next(error); }
  }
  async recordPayment(req, res, next) {
    try {
      const result = await platformService.recordPayment(req.params.invoiceId, req.body, req.user, req);
      return res.status(result.status || 200).json(result.body || result);
    } catch (error) { return next(error); }
  }
  async createRefund(req, res, next) {
    try {
      const result = await platformService.createRefund(req.params.paymentId, req.body, req.user, req);
      return res.status(result.status || 200).json(result.body || result);
    } catch (error) { return next(error); }
  }
}

module.exports = new BillingController();
