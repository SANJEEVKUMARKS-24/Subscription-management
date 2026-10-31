const db = require('../config/database');

class UserRepository {
  async findByEmail(email) {
    const result = await db.query(
      `SELECT user_id AS id, customer_id, full_name, email, password_hash, role, is_active, auth_version
       FROM users
       WHERE email = $1`,
      [email]
    );

    return result.rows[0] || null;
  }

  async findById(id) {
    const result = await db.query(
      `SELECT user_id AS id, customer_id, email, role, is_active, auth_version FROM users WHERE user_id=$1`, [id]
    );
    return result.rows[0] || null;
  }

  async createCustomer({ companyName, billingEmail, client = db }) {
    const result = await client.query(
      `INSERT INTO customers (company_name, email, billing_email)
       VALUES ($1, $2, $2)
       RETURNING *`,
      [companyName, billingEmail]
    );

    return result.rows[0];
  }

  async createUser({ customerId, fullName, email, passwordHash, role, client = db }) {
    const result = await client.query(
      `INSERT INTO users (customer_id, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id AS id, customer_id, full_name, email, role`,
      [customerId, fullName, email, passwordHash, role]
    );

    return result.rows[0];
  }

  async createPasswordResetToken({ userId, tokenHash, expiresAt, client = db }) {
    const result = await client.query(
      `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES($1,$2,$3) RETURNING token_id`,
      [userId, tokenHash, expiresAt]
    );
    return result.rows[0];
  }

  async resetPassword({ tokenHash, passwordHash, client = db }) {
    const result = await client.query(
      `UPDATE users SET password_hash=$2, auth_version=auth_version+1, updated_at=NOW()
       WHERE user_id=(SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE)
       RETURNING user_id`, [tokenHash, passwordHash]
    );
    if (!result.rowCount) return false;
    await client.query(
      `UPDATE password_reset_tokens SET used_at=NOW()
       WHERE user_id=$1 AND used_at IS NULL`, [result.rows[0].user_id]
    );
    return true;
  }

  async list({ customerId = null, limit = 20, offset = 0 } = {}) {
    const [result, count] = await Promise.all([db.query(
      `SELECT user_id AS id, customer_id, full_name, email, role, is_active, created_at
       FROM users WHERE ($1::bigint IS NULL OR customer_id=$1) ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [customerId, limit, offset]
    ), db.query(`SELECT COUNT(*)::int AS total FROM users WHERE ($1::bigint IS NULL OR customer_id=$1)`, [customerId])]);
    return { rows: result.rows, total: count.rows[0].total };
  }
}

module.exports = new UserRepository();
