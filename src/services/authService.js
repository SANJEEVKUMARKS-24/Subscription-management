const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { signToken } = require('../config/auth');
const userRepository = require('../repositories/userRepository');
const db = require('../config/database');
const env = require('../config/env');
const { parsePagination, paginationMeta } = require('../utils/pagination');

class AuthService {
  async login({ email, password }) {
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      throw Object.assign(new Error('Email and password are required'), { statusCode: 400 });
    }

    const user = await userRepository.findByEmail(email.toLowerCase().trim());
    if (!user || !user.is_active) {
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
      authVersion: user.auth_version,
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

  async registerCustomer({ companyName, fullName, email, password }) {
    if (!companyName || !fullName || !email || !password) throw Object.assign(new Error('companyName, fullName, email and password are required'), { statusCode: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('A valid email is required'), { statusCode: 400 });
    if (String(password).length < 12) throw Object.assign(new Error('Password must be at least 12 characters'), { statusCode: 400 });
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const customer = await userRepository.createCustomer({ companyName: companyName.trim(), billingEmail: normalizedEmail, client });
      const user = await userRepository.createUser({ customerId: customer.customer_id, fullName: fullName.trim(), email: normalizedEmail, passwordHash, role: 'CUSTOMER', client });
      await client.query('COMMIT');
      const token = signToken({ id: user.id, email: user.email, role: 'CUSTOMER', customerId: customer.customer_id, authVersion: 0 });
      return { success: true, data: { token, user }, message: 'Customer account created.' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') throw Object.assign(new Error('An account with that email already exists'), { statusCode: 409 });
      throw error;
    } finally { client.release(); }
  }

  async requestPasswordReset(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) throw Object.assign(new Error('email is required'), { statusCode: 400 });
    const user = await userRepository.findByEmail(normalized);
    if (!user || !user.is_active) return { success: true, message: 'If the account exists, reset instructions will be sent.' };
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await userRepository.createPasswordResetToken({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) });
    const resetUrl = `${env.publicAppUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    if (env.resendApiKey && env.emailFrom) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.emailFrom, to: [normalized], subject: 'Reset your password', text: `Reset your password: ${resetUrl}` }),
      });
      if (!response.ok) throw Object.assign(new Error('Password reset email could not be sent'), { statusCode: 502 });
    } else if (env.emailApiUrl && env.emailApiKey) {
      const response = await fetch(env.emailApiUrl, {
        method: 'POST', headers: { Authorization: `Bearer ${env.emailApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: normalized, subject: 'Reset your password', text: `Reset your password: ${resetUrl}` }),
      });
      if (!response.ok) throw Object.assign(new Error('Password reset email could not be sent'), { statusCode: 502 });
    } else if (env.nodeEnv === 'production') {
      throw Object.assign(new Error('Password reset email is not configured'), { statusCode: 503 });
    }
    return { success: true, message: 'If the account exists, reset instructions will be sent.', ...(env.nodeEnv === 'production' ? {} : { developmentResetUrl: resetUrl }) };
  }

  async resetPassword({ token, password }) {
    if (!token || !password || String(password).length < 12) throw Object.assign(new Error('A reset token and a password of at least 12 characters are required'), { statusCode: 400 });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const changed = await userRepository.resetPassword({ tokenHash, passwordHash, client });
      if (!changed) throw Object.assign(new Error('Reset token is invalid, expired, or already used'), { statusCode: 400 });
      await client.query('COMMIT');
      return { success: true, message: 'Password updated. Please sign in again.' };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async createManagedUser({ fullName, email, password, role = 'STAFF', customerId = null }, actor) {
    if (actor.role !== 'ADMIN') throw Object.assign(new Error('Only admins can create users'), { statusCode: 403 });
    const normalizedRole = String(role).toUpperCase();
    if (!['STAFF', 'CUSTOMER'].includes(normalizedRole) || !fullName || typeof email !== 'string' || typeof password !== 'string' || password.length < 12) {
      throw Object.assign(new Error('fullName, email, a 12-character password, and STAFF or CUSTOMER role are required'), { statusCode: 400 });
    }
    if ((normalizedRole === 'CUSTOMER' && !customerId) || (normalizedRole === 'STAFF' && customerId)) throw Object.assign(new Error('CUSTOMER users need customerId; STAFF users cannot be tenant-scoped'), { statusCode: 400 });
    if (normalizedRole === 'CUSTOMER') {
      const parsedCustomerId = Number(customerId);
      if (!Number.isSafeInteger(parsedCustomerId) || parsedCustomerId < 1) throw Object.assign(new Error('customerId must be a positive integer'), { statusCode: 400 });
      const customer = await db.query(`SELECT customer_id FROM customers WHERE customer_id=$1 AND is_active=TRUE`, [parsedCustomerId]);
      if (!customer.rowCount) throw Object.assign(new Error('Active customer not found'), { statusCode: 404 });
      customerId = parsedCustomerId;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      return await userRepository.createUser({ customerId, fullName: fullName.trim(), email: email.trim().toLowerCase(), passwordHash, role: normalizedRole });
    } catch (error) {
      if (error.code === '23505') throw Object.assign(new Error('An account with that email already exists'), { statusCode: 409 });
      throw error;
    }
  }

  async listUsers(query, actor) {
    if (actor.role !== 'ADMIN') throw Object.assign(new Error('Only admins can list users'), { statusCode: 403 });
    const { limit, offset } = parsePagination(query);
    const customerId = query.customerId ? Number(query.customerId) : null;
    if (customerId !== null && !Number.isSafeInteger(customerId)) throw Object.assign(new Error('customerId must be an integer'), { statusCode: 400 });
    const result = await userRepository.list({ customerId, limit, offset });
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }
}

module.exports = new AuthService();
