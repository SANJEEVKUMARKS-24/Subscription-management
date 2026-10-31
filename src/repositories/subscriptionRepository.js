const db = require('../config/database');

class SubscriptionRepository {
  async findAll(customerId = null, limit = 20, offset = 0) {
    const [result, count] = await Promise.all([db.query(
      `SELECT s.*, c.company_name, c.company_name AS customer_name,
              p.plan_name, p.price, p.billing_frequency
       FROM subscriptions s
       JOIN customers c ON c.customer_id=s.customer_id
       JOIN plans p ON p.plan_id=s.plan_id
       WHERE ($1::bigint IS NULL OR s.customer_id=$1)
       ORDER BY s.created_at DESC, s.subscription_id DESC LIMIT $2 OFFSET $3`,
      [customerId, limit, offset]
    ), db.query(`SELECT COUNT(*)::int AS total FROM subscriptions WHERE ($1::bigint IS NULL OR customer_id=$1)`, [customerId])]);

    return { rows: result.rows, total: count.rows[0].total };
  }

  async findById(id, customerId = null) {
    const result = await db.query(
      `SELECT * FROM subscriptions WHERE subscription_id = $1 AND ($2::bigint IS NULL OR customer_id = $2)`,
      [id, customerId]
    );

    return result.rows[0] || null;
  }

  async create({ subscriptionNumber, customerId, planId, status = 'DRAFT', startDate = new Date().toISOString().slice(0, 10), expiryDate = null, paymentTermsDays = 0, client = db }) {
    const result = await client.query(
      `INSERT INTO subscriptions (
        subscription_number,
        customer_id,
        plan_id,
        status,
        start_date,
        expiry_date,
        payment_terms_days
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [subscriptionNumber, customerId, planId, status, startDate, expiryDate, paymentTermsDays]
    );

    return result.rows[0];
  }

  async update(id, fields, customerId = null) {
    const allowed = new Set(['status', 'expiry_date', 'next_billing_at', 'payment_terms_days']);
    const entries = Object.entries(fields).filter(([key]) => allowed.has(key));
    if (!entries.length) return this.findById(id, customerId);
    const setClause = entries.map(([key], index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...entries.map(([, value]) => value), customerId];

    const result = await db.query(
      `UPDATE subscriptions
       SET ${setClause}, updated_at = now()
       WHERE subscription_id = $1 AND ($${values.length}::bigint IS NULL OR customer_id = $${values.length})
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  async delete(id, customerId = null) {
    const result = await db.query(
      `UPDATE subscriptions SET status = 'CLOSED', updated_at = now()
       WHERE subscription_id = $1 AND ($2::bigint IS NULL OR customer_id = $2)
       RETURNING *`,
      [id, customerId]
    );

    return result.rows[0] || null;
  }

  async findPausePolicy(id, customerId = null) {
    const result = await db.query(
      `SELECT s.subscription_id, s.customer_id, s.status, p.allow_pause
       FROM subscriptions s JOIN plans p ON p.plan_id = s.plan_id
       WHERE s.subscription_id = $1 AND ($2::bigint IS NULL OR s.customer_id = $2)`,
      [id, customerId]
    );
    return result.rows[0] || null;
  }

  async findClosurePolicy(id, customerId = null) {
    const result = await db.query(
      `SELECT s.subscription_id,s.customer_id,s.status,p.allow_early_closure FROM subscriptions s JOIN plans p ON p.plan_id=s.plan_id
       WHERE s.subscription_id=$1 AND ($2::bigint IS NULL OR s.customer_id=$2)`, [id, customerId]
    );
    return result.rows[0] || null;
  }

  async activate(id) {
    const result = await db.query(
      `UPDATE subscriptions SET status='ACTIVE',next_billing_at=COALESCE(next_billing_at,NOW()),updated_at=NOW()
       WHERE subscription_id=$1 AND status IN ('DRAFT','CONFIRMED') RETURNING *`, [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = new SubscriptionRepository();
