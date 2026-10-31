module.exports = (parameter) => (req, res, next, value) => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return res.status(400).json({ success: false, message: `${parameter} must be a positive integer`, requestId: req.id });
  }
  return next();
};
