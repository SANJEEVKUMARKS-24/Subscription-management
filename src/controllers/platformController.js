const platformService = require('../services/platformService');

const sendResult = (res, result, defaultStatus = 200) => res.status(result.status || defaultStatus).json(result.body || result);

exports.listCustomers = async (req, res, next) => {
  try { return res.json({ success: true, ...(await platformService.listCustomers(req.query, req.user)) }); }
  catch (error) { return next(error); }
};

exports.listProducts = async (req, res, next) => {
  try { return res.json({ success: true, ...(await platformService.listProducts(req.query)) }); }
  catch (error) { return next(error); }
};
exports.createProduct = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await platformService.createProduct(req.body, req.user) }); }
  catch (error) { return next(error); }
};
exports.getProduct = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.getProduct(req.params.productId) }); }
  catch (error) { return next(error); }
};
exports.updateProduct = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.updateProduct(req.params.productId, req.body, req.user) }); }
  catch (error) { return next(error); }
};
exports.archiveProduct = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.archiveProduct(req.params.productId, req.user) }); }
  catch (error) { return next(error); }
};
exports.listVariants = async (req, res, next) => {
  try { return res.json({ success: true, ...(await platformService.listVariants(req.params.productId, req.query)) }); }
  catch (error) { return next(error); }
};
exports.createVariant = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await platformService.createVariant(req.params.productId, req.body, req.user) }); }
  catch (error) { return next(error); }
};
exports.updateVariant = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.updateVariant(req.params.variantId, req.body, req.user) }); }
  catch (error) { return next(error); }
};
exports.archiveVariant = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.archiveVariant(req.params.variantId, req.user) }); }
  catch (error) { return next(error); }
};
exports.listQuotations = async (req, res, next) => {
  try { return res.json({ success: true, ...(await platformService.listQuotations(req.user, req.query)) }); }
  catch (error) { return next(error); }
};
exports.createQuotation = async (req, res, next) => {
  try { return sendResult(res, await platformService.createQuotation(req.body, req.user, req), 201); }
  catch (error) { return next(error); }
};
exports.getQuotation = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.getQuotation(req.params.quotationId, req.user) }); }
  catch (error) { return next(error); }
};
exports.cancelQuotation = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.cancelQuotation(req.params.quotationId, req.user) }); }
  catch (error) { return next(error); }
};
exports.sendQuotation = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.sendQuotation(req.params.quotationId, req.user) }); }
  catch (error) { return next(error); }
};
exports.confirmQuotation = async (req, res, next) => {
  try { return sendResult(res, await platformService.confirmQuotation(req.params.quotationId, req.user, req), 201); }
  catch (error) { return next(error); }
};
exports.listQuotationTemplates = async (req, res, next) => {
  try { return res.json({ success: true, ...(await platformService.listQuotationTemplates(req.query)) }); }
  catch (error) { return next(error); }
};
exports.createQuotationTemplate = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await platformService.createQuotationTemplate(req.body, req.user) }); }
  catch (error) { return next(error); }
};
exports.listDiscounts = async (req, res, next) => {
  try { return res.json({ success: true, ...(await platformService.listDiscounts(req.user, req.query)) }); }
  catch (error) { return next(error); }
};
exports.createDiscount = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await platformService.createDiscount(req.body, req.user) }); }
  catch (error) { return next(error); }
};
exports.updateDiscount = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.updateDiscount(req.params.discountId, req.body, req.user) }); }
  catch (error) { return next(error); }
};
exports.archiveDiscount = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.archiveDiscount(req.params.discountId, req.user) }); }
  catch (error) { return next(error); }
};
exports.listTaxes = async (req, res, next) => {
  try { return res.json({ success: true, ...(await platformService.listTaxes(req.query)) }); }
  catch (error) { return next(error); }
};
exports.createTax = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await platformService.createTax(req.body, req.user) }); }
  catch (error) { return next(error); }
};
exports.deactivateTax = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.deactivateTax(req.params.taxId, req.user) }); }
  catch (error) { return next(error); }
};
exports.dashboardSummary = async (req, res, next) => {
  try { return res.json({ success: true, data: await platformService.dashboardSummary(req.user) }); }
  catch (error) { return next(error); }
};
exports.runBilling = async (req, res, next) => {
  try { return res.status(202).json({ success: true, data: await platformService.runBilling(req.user) }); }
  catch (error) { return next(error); }
};
