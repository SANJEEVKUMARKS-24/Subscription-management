const express = require('express');
const planController = require('../controllers/planController');

const router = express.Router();

router.get('/plans', planController.listPlans);
router.post('/plans', planController.createPlan);

module.exports = router;
