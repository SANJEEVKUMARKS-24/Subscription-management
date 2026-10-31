const db = require('../config/database');

class UserRepository {
  async findByEmail(email) {
    const result = await db.query(
      `SELECT id, customer_id, full_name, email, password_hash, role, is_active
       FROM users
       WHERE email = $1`,
      [email]
    );

    return result.rows[0] || null;
  }

  async createCustomer({ companyName, billingEmail }) {
    const result = await db.query(
      `INSERT INTO customers (company_name, billing_email)
       VALUES ($1, $2)
       RETURNING *`,
      [companyName, billingEmail]
    );

    return result.rows[0];
  }

  async createUser({ customerId, fullName, email, passwordHash, role }) {
    const result = await db.query(
      `INSERT INTO users (customer_id, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, customer_id, full_name, email, role`,
      [customerId, fullName, email, passwordHash, role]
    );

    return result.rows[0];
  }
}

module.exports = new UserRepository();
