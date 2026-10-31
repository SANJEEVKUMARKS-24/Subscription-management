const { verifyToken } = require('../config/auth');
const userRepository = require('../repositories/userRepository');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access token is required',
    });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try { decoded = verifyToken(token); }
  catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
  try {
    const currentUser = await userRepository.findById(decoded.id);
    if (!currentUser || !currentUser.is_active || currentUser.auth_version !== (decoded.authVersion || 0)) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = {
      id: currentUser.id,
      email: currentUser.email,
      role: String(currentUser.role || '').toUpperCase(),
      customerId: currentUser.customer_id,
    };
    return next();
  } catch (error) { return next(error); }
};

module.exports = authMiddleware;
