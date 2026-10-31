const db = require('../config/database');

class PlanRepository {
  async findAll() {
    const result = await db.query(`SELECT * FROM plans ORDER BY created_at DESC`);
    return result.rows;
  }

  async create({ name, description, basePrice, billingFrequency, minimumQuantity }) {
    const result = await db.query(
      `INSERT INTO plans (name, description, base_price, billing_frequency, minimum_quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, basePrice, billingFrequency, minimumQuantity]
    );

    return result.rows[0];
  }
}

module.exports = new PlanRepository();
