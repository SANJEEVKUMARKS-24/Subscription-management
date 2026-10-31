const db = require('../config/database');

class SubscriptionRepository {
  async findAll() {
    const result = await db.query(
      `SELECT * FROM subscriptions ORDER BY created_at DESC`
    );

    return result.rows;
  }

  async findById(id) {
    const result = await db.query(
      `SELECT * FROM subscriptions WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  async create({ subscriptionNumber, customerId, planId, status, currency }) {
    const result = await db.query(
      `INSERT INTO subscriptions (
        subscription_number,
        customer_id,
        plan_id,
        status,
        currency
      ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [subscriptionNumber, customerId, planId, status, currency]
    );

    return result.rows[0];
  }

  async update(id, fields) {
    const keys = Object.keys(fields);
    const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...keys.map((key) => fields[key])];

    const result = await db.query(
      `UPDATE subscriptions
       SET ${setClause}, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  async delete(id) {
    const result = await db.query(
      `DELETE FROM subscriptions WHERE id = $1 RETURNING *`,
      [id]
    );

    return result.rows[0] || null;
  }
}

module.exports = new SubscriptionRepository();
