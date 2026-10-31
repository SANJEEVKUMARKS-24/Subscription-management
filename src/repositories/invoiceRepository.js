const db = require('../config/database');

class InvoiceRepository {
  async findAll() {
    const result = await db.query(`SELECT * FROM invoices ORDER BY created_at DESC`);
    return result.rows;
  }

  async create({ invoiceNumber, customerId, subscriptionId, billingPeriodStart, billingPeriodEnd, dueDate, currency, total }) {
    const result = await db.query(
      `INSERT INTO invoices (
        invoice_number,
        customer_id,
        subscription_id,
        billing_period_start,
        billing_period_end,
        due_date,
        currency,
        total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [invoiceNumber, customerId, subscriptionId, billingPeriodStart, billingPeriodEnd, dueDate, currency, total]
    );

    return result.rows[0];
  }
}

module.exports = new InvoiceRepository();
