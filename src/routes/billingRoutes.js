const express = require('express');
const billingController = require('../controllers/billingController');

const router = express.Router();

router.get('/invoices', billingController.listInvoices);
router.post('/invoices', billingController.createInvoice);

module.exports = router;
