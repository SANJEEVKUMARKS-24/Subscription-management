const db = require('../config/database');

class InvoiceRepository {
  async findAll(customerId = null) {
    const result = await db.query(
      `SELECT * FROM invoices WHERE ($1::bigint IS NULL OR customer_id = $1) ORDER BY created_at DESC LIMIT 100`,
      [customerId]
    );
    return result.rows;
  }

  async create({ invoiceNumber, customerId, subscriptionId, billingPeriodStart, billingPeriodEnd, dueDate, currency = 'USD', subtotal, discountAmount = 0, taxAmount = 0, total, client = db }) {
    const result = await client.query(
      `INSERT INTO invoices (
        invoice_number,
        customer_id,
        subscription_id,
        invoice_date,
        billing_period_start,
        billing_period_end,
        due_date,
        currency,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount
      ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [invoiceNumber, customerId, subscriptionId, billingPeriodStart, billingPeriodEnd, dueDate, currency, subtotal, discountAmount, taxAmount, total]
    );

    return result.rows[0];
  }

  async createItem({ invoiceId, productId = null, description, quantity, unitPrice, taxRate = 0, taxAmount = 0, lineTotal, client = db }) {
    const result = await client.query(
      `INSERT INTO invoice_items (invoice_id, product_id, description_snapshot, quantity, unit_price, tax_rate_snapshot, tax_amount, line_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [invoiceId, productId, description, quantity, unitPrice, taxRate, taxAmount, lineTotal]
    );
    return result.rows[0];
  }
}

module.exports = new InvoiceRepository();
