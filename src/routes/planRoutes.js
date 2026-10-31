const express = require('express');
const planController = require('../controllers/planController');
const requireRoles = require('../middleware/requireRoles');
const validateIdParam = require('../middleware/validateIdParam');

const router = express.Router();
router.param('planId', validateIdParam('planId'));

router.get('/plans', planController.listPlans);
router.get('/plans/:planId', planController.getPlan);
router.post('/plans', requireRoles('ADMIN', 'STAFF'), planController.createPlan);
router.patch('/plans/:planId', requireRoles('ADMIN', 'STAFF'), planController.updatePlan);
router.delete('/plans/:planId', requireRoles('ADMIN', 'STAFF'), planController.archivePlan);
router.put('/plans/:planId/items', requireRoles('ADMIN', 'STAFF'), planController.replacePlanItems);

module.exports = router;
