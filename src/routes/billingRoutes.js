const express = require('express');
const billingController = require('../controllers/billingController');
const requireRoles = require('../middleware/requireRoles');
const validateIdParam = require('../middleware/validateIdParam');

const router = express.Router();
for (const parameter of ['invoiceId', 'subscriptionId', 'paymentId']) {
  router.param(parameter, validateIdParam(parameter));
}

router.get('/invoices', billingController.listInvoices);
router.get('/invoices/:invoiceId', billingController.getInvoice);
router.post('/invoices/:invoiceId/cancel', requireRoles('ADMIN', 'STAFF'), billingController.cancelInvoice);
router.post('/invoices/:invoiceId/checkout', billingController.createCheckout);
router.post('/subscriptions/:subscriptionId/invoices', requireRoles('ADMIN', 'STAFF'), billingController.createInvoice);
router.get('/invoices/:invoiceId/payments', billingController.listPayments);
router.post('/invoices/:invoiceId/payments', requireRoles('ADMIN', 'STAFF'), billingController.recordPayment);
router.post('/payments/:paymentId/refunds', requireRoles('ADMIN'), billingController.createRefund);

module.exports = router;
