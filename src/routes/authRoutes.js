const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const requireRoles = require('../middleware/requireRoles');

const router = express.Router();

router.post('/login', authController.login);
router.post('/register', authController.registerCustomer);
router.post('/password-reset/request', authController.requestPasswordReset);
router.post('/password-reset/confirm', authController.resetPassword);
router.get('/users', authMiddleware, requireRoles('ADMIN'), authController.listUsers);
router.post('/users', authMiddleware, requireRoles('ADMIN'), authController.createManagedUser);

module.exports = router;
