const buckets = new Map();
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
}, 60_000);
cleanup.unref();

module.exports = ({ windowMs = 60_000, max = 60 } = {}) => (req, res, next) => {
  // Reads are authenticated and side-effect free. Do not let normal screen
  // refreshes consume the mutation budget or block the post-write refresh.
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();

  const now = Date.now();
  const key = `${req.ip}:${req.method}:${req.baseUrl}${req.path}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > max) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({ success: false, message: 'Too many requests', requestId: req.id });
  }
  return next();
};
