const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;

  if (statusCode >= 500) console.error(`[${req.id || 'no-request-id'}]`, err);
  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
    requestId: req.id,
  });
};

module.exports = errorHandler;
