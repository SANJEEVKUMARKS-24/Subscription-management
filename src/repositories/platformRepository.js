const db = require('../config/database');

async function paged(rowsSql, countSql, params, countParams = params) {
  const [rows, count] = await Promise.all([db.query(rowsSql, params), db.query(countSql, countParams)]);
  return { rows: rows.rows, total: count.rows[0].total };
}

class PlatformRepository {
  listCustomers(limit, offset) {
    return paged(
      `SELECT customer_id,company_name,email,phone FROM customers WHERE is_active=TRUE ORDER BY company_name,customer_id LIMIT $1 OFFSET $2`,
      `SELECT COUNT(*)::int AS total FROM customers WHERE is_active=TRUE`, [limit, offset], []
    );
  }

  listProducts(limit, offset) {
    return paged(`SELECT * FROM products WHERE is_active=TRUE ORDER BY name LIMIT $1 OFFSET $2`,
      `SELECT COUNT(*)::int AS total FROM products WHERE is_active=TRUE`, [limit, offset], []);
  }

  listQuotations(customerId, limit, offset) {
    const scope = `($1::bigint IS NULL OR customer_id=$1)`;
    return paged(`SELECT * FROM quotations WHERE ${scope} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      `SELECT COUNT(*)::int AS total FROM quotations WHERE ${scope}`, [customerId, limit, offset], [customerId]);
  }

  listQuotationTemplates(limit, offset) {
    return paged(`SELECT * FROM quotation_templates WHERE is_active=TRUE ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      `SELECT COUNT(*)::int AS total FROM quotation_templates WHERE is_active=TRUE`, [limit, offset], []);
  }

  listInvoices(customerId, limit, offset) {
    const scope = `($1::bigint IS NULL OR customer_id=$1)`;
    return paged(`SELECT * FROM invoices WHERE ${scope} ORDER BY invoice_date DESC,invoice_id DESC LIMIT $2 OFFSET $3`,
      `SELECT COUNT(*)::int AS total FROM invoices WHERE ${scope}`, [customerId, limit, offset], [customerId]);
  }

  listDiscounts(limit, offset) {
    return paged(`SELECT * FROM discounts ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      `SELECT COUNT(*)::int AS total FROM discounts`, [limit, offset], []);
  }

  listVariants(productId, limit, offset) {
    return paged(`SELECT * FROM product_variants WHERE product_id=$1 AND is_active=TRUE ORDER BY variant_name LIMIT $2 OFFSET $3`,
      `SELECT COUNT(*)::int AS total FROM product_variants WHERE product_id=$1 AND is_active=TRUE`, [productId, limit, offset], [productId]);
  }

  listPayments(invoiceId, customerId, limit, offset) {
    const scope = `p.invoice_id=$1 AND ($2::bigint IS NULL OR i.customer_id=$2)`;
    return paged(`SELECT p.* FROM payments p JOIN invoices i ON i.invoice_id=p.invoice_id WHERE ${scope} ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`,
      `SELECT COUNT(*)::int AS total FROM payments p JOIN invoices i ON i.invoice_id=p.invoice_id WHERE ${scope}`,
      [invoiceId, customerId, limit, offset], [invoiceId, customerId]);
  }

  listTaxes(limit, offset) {
    const where = `is_active=TRUE AND effective_from<=NOW() AND (effective_until IS NULL OR effective_until>=NOW())`;
    return paged(`SELECT * FROM taxes WHERE ${where} ORDER BY tax_name LIMIT $1 OFFSET $2`,
      `SELECT COUNT(*)::int AS total FROM taxes WHERE ${where}`, [limit, offset], []);
  }
}

module.exports = new PlatformRepository();
