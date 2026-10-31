const bcrypt = require('bcryptjs');
const { signToken } = require('../config/auth');
const userRepository = require('../repositories/userRepository');

class AuthService {
  async login({ email, password }) {
    if (!email || !password) {
      throw Object.assign(new Error('Email and password are required'), { statusCode: 400 });
    }

    const user = await userRepository.findByEmail(email.toLowerCase().trim());
    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customer_id,
    });

    return {
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          customerId: user.customer_id,
        },
      },
      message: 'Login successful',
    };
  }
}

module.exports = new AuthService();
