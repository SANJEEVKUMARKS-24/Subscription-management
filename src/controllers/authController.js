const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

const registerCustomer = async (req, res, next) => {
  try { return res.status(201).json(await authService.registerCustomer(req.body || {})); }
  catch (error) { return next(error); }
};

const requestPasswordReset = async (req, res, next) => {
  try { return res.status(202).json(await authService.requestPasswordReset(req.body?.email)); }
  catch (error) { return next(error); }
};

const resetPassword = async (req, res, next) => {
  try { return res.status(200).json(await authService.resetPassword(req.body || {})); }
  catch (error) { return next(error); }
};

const createManagedUser = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await authService.createManagedUser(req.body || {}, req.user) }); }
  catch (error) { return next(error); }
};

const listUsers = async (req, res, next) => {
  try { return res.json({ success: true, ...(await authService.listUsers(req.query, req.user)) }); }
  catch (error) { return next(error); }
};

module.exports = {
  login,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  createManagedUser,
  listUsers,
};
