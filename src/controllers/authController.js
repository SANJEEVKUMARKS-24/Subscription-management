const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  login,
};
