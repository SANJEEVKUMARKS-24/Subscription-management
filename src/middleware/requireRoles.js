module.exports = (...roles) => (req, res, next) => {
  const role = String(req.user?.role || '').toUpperCase();
  if (!roles.map((value) => String(value).toUpperCase()).includes(role)) {
    return res.status(403).json({ success: false, message: 'You are not allowed to perform this action', requestId: req.id });
  }
  return next();
};
