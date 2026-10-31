const express = require('express');
const dbBootstrapService = require('../services/dbBootstrapService');
const requireRoles = require('../middleware/requireRoles');

const router = express.Router();

router.post('/bootstrap-db', requireRoles('ADMIN'), async (req, res, next) => {
  try {
    const result = await dbBootstrapService.ensureSchema();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
