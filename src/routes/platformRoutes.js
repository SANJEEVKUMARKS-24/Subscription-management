const express = require('express');
const controller = require('../controllers/platformController');
const requireRoles = require('../middleware/requireRoles');
const validateIdParam = require('../middleware/validateIdParam');

const router = express.Router();
for (const parameter of ['productId', 'variantId', 'quotationId', 'discountId', 'taxId']) {
  router.param(parameter, validateIdParam(parameter));
}
router.get('/products', controller.listProducts);
router.post('/products', requireRoles('ADMIN', 'STAFF'), controller.createProduct);
router.get('/products/:productId', controller.getProduct);
router.patch('/products/:productId', requireRoles('ADMIN', 'STAFF'), controller.updateProduct);
router.delete('/products/:productId', requireRoles('ADMIN', 'STAFF'), controller.archiveProduct);
router.get('/products/:productId/variants', controller.listVariants);
router.post('/products/:productId/variants', requireRoles('ADMIN', 'STAFF'), controller.createVariant);
router.patch('/product-variants/:variantId', requireRoles('ADMIN', 'STAFF'), controller.updateVariant);
router.delete('/product-variants/:variantId', requireRoles('ADMIN', 'STAFF'), controller.archiveVariant);
router.get('/quotations', controller.listQuotations);
router.post('/quotations', requireRoles('ADMIN', 'STAFF'), controller.createQuotation);
router.get('/quotations/:quotationId', controller.getQuotation);
router.post('/quotations/:quotationId/cancel', controller.cancelQuotation);
router.post('/quotations/:quotationId/send', requireRoles('ADMIN', 'STAFF'), controller.sendQuotation);
router.post('/quotations/:quotationId/confirm', controller.confirmQuotation);
router.get('/quotation-templates', requireRoles('ADMIN', 'STAFF'), controller.listQuotationTemplates);
router.post('/quotation-templates', requireRoles('ADMIN', 'STAFF'), controller.createQuotationTemplate);
router.get('/discounts', requireRoles('ADMIN', 'STAFF'), controller.listDiscounts);
router.post('/discounts', requireRoles('ADMIN'), controller.createDiscount);
router.patch('/discounts/:discountId', requireRoles('ADMIN'), controller.updateDiscount);
router.delete('/discounts/:discountId', requireRoles('ADMIN'), controller.archiveDiscount);
router.get('/taxes', controller.listTaxes);
router.post('/taxes', requireRoles('ADMIN'), controller.createTax);
router.delete('/taxes/:taxId', requireRoles('ADMIN'), controller.deactivateTax);
router.get('/dashboard/summary', controller.dashboardSummary);
router.post('/billing-runs', requireRoles('ADMIN', 'STAFF'), controller.runBilling);
module.exports = router;
