const crypto = require('node:crypto');
const db = require('../config/database');
const env = require('../config/env');
const stripeProvider = require('./stripeProvider');
const platformRepository = require('../repositories/platformRepository');
const { parsePagination, paginationMeta } = require('../utils/pagination');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const isManager = (user) => ['ADMIN', 'STAFF'].includes(String(user?.role || '').toUpperCase());
const tenantId = (user) => String(user?.role || '').toUpperCase() === 'CUSTOMER' ? Number(user.customerId) : null;
const page = parsePagination;
const amountCents = (value, field = 'amount') => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || Math.abs(Math.round(number * 100) - number * 100) > 1e-7) throw fail(`${field} must be a non-negative amount with at most two decimal places`);
  return Math.round(number * 100);
};
const cents = (value) => Math.round(Number(value) * 100);
const money = (value) => (value / 100).toFixed(2);
const isDateOnly = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const rateBasisPoints = (value = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw fail('taxRate must be between 0 and 100');
  return Math.round(number * 100);
};
const storedRateBasisPoints = (value = 0) => Math.round(Number(value) * 10_000);
const rowOr404 = (row, name = 'Record') => { if (!row) throw fail(`${name} not found`, 404); return row; };
const positiveId = (value, field) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw fail(`${field} must be a positive integer`);
  return parsed;
};
function addBillingPeriod(dateText, frequency) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw fail('Invalid billing date');
  if (frequency === 'DAILY') date.setUTCDate(date.getUTCDate() + 1);
  else if (frequency === 'WEEKLY') date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === 'MONTHLY' || frequency === 'YEARLY') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    if (frequency === 'MONTHLY') date.setUTCMonth(date.getUTCMonth() + 1);
    else date.setUTCFullYear(date.getUTCFullYear() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

async function transaction(work) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function requestHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function idempotent(req, work) {
  const key = req.get('Idempotency-Key');
  if (!key) throw fail('Idempotency-Key header is required');
  if (key.length > 200) throw fail('Idempotency-Key must be 200 characters or fewer');
  const scope = `${req.method}:${req.baseUrl}${req.path}:user:${req.user.id}`;
  const hash = requestHash(req.body || {});
  return transaction(async (client) => {
    await client.query(`DELETE FROM idempotency_keys WHERE scope=$1 AND key=$2 AND expires_at <= NOW()`, [scope, key]);
    const inserted = await client.query(
      `INSERT INTO idempotency_keys(scope, key, request_hash, status)
       VALUES ($1, $2, $3, 'PROCESSING') ON CONFLICT (scope, key) DO NOTHING RETURNING idempotency_id`,
      [scope, key, hash]
    );
    if (!inserted.rowCount) {
      const existing = (await client.query(
        `SELECT * FROM idempotency_keys WHERE scope = $1 AND key = $2 FOR UPDATE`, [scope, key]
      )).rows[0];
      if (existing.request_hash !== hash) throw fail('Idempotency-Key was already used with a different request', 409);
      if (existing.status === 'COMPLETED') return { replay: true, status: existing.response_status, body: existing.response_body };
      throw fail('An identical request is already being processed', 409);
    }
    const result = await work(client);
    await client.query(
      `UPDATE idempotency_keys SET status = 'COMPLETED', response_status = $2, response_body = $3::jsonb,
         resource_id = $4, expires_at = NOW() + INTERVAL '24 hours' WHERE idempotency_id = $1`,
      [inserted.rows[0].idempotency_id, result.status, JSON.stringify(result.body), result.resourceId || null]
    );
    return { replay: false, ...result };
  });
}

async function audit(client, userId, action, entityType, entityId, metadata = {}) {
  await (client || db).query(
    `INSERT INTO audit_logs(user_id, entity_type, entity_id, action, new_values)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId || null, entityType, entityId, action, JSON.stringify(metadata)]
  );
}

class PlatformService {
  async listCustomers(query = {}, user) {
    if (!isManager(user)) throw fail('Only staff can list customers', 403);
    const { limit, offset } = page(query);
    const result = await platformRepository.listCustomers(limit, offset);
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }

  async listProducts(query = {}) {
    const { limit, offset } = page(query);
    const result = await platformRepository.listProducts(limit, offset);
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }

  async getProduct(id) {
    const result = await db.query(`SELECT * FROM products WHERE product_id=$1 AND is_active=TRUE`, [id]);
    return rowOr404(result.rows[0], 'Product');
  }

  async createProduct(payload, user) {
    const { name, productType, salesPrice, costPrice = 0, notes = null } = payload || {};
    if (!isManager(user)) throw fail('Only staff can manage products', 403);
    if (!name || !productType) throw fail('name and productType are required');
    const sales = money(amountCents(salesPrice, 'salesPrice'));
    const cost = money(amountCents(costPrice, 'costPrice'));
    const result = await db.query(
      `INSERT INTO products(name, product_type, sales_price, cost_price, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [String(name).trim(), String(productType).trim(), sales, cost, notes]
    );
    await db.query(`INSERT INTO audit_logs(user_id, entity_type, entity_id, action, new_values) VALUES ($1,'product',$2,'created',$3::jsonb)`, [user.id, result.rows[0].product_id, JSON.stringify(result.rows[0])]);
    return result.rows[0];
  }

  async updateProduct(id, payload, user) {
    if (!isManager(user)) throw fail('Only staff can manage products', 403);
    const allowed = { name: 'name', productType: 'product_type', salesPrice: 'sales_price', costPrice: 'cost_price', notes: 'notes' };
    const entries = Object.entries(payload || {}).filter(([key]) => allowed[key]);
    if (!entries.length) throw fail('No editable product fields supplied');
    const params = [id];
    const set = entries.map(([key, value]) => {
      params.push(['salesPrice', 'costPrice'].includes(key) ? money(amountCents(value, key)) : value);
      return `${allowed[key]} = $${params.length}`;
    });
    const updated = await db.query(`UPDATE products SET ${set.join(', ')}, updated_at = NOW() WHERE product_id = $1 AND is_active = TRUE RETURNING *`, params);
    const product = rowOr404(updated.rows[0], 'Product');
    await db.query(`INSERT INTO audit_logs(user_id, entity_type, entity_id, action, new_values) VALUES ($1,'product',$2,'updated',$3::jsonb)`, [user.id, id, JSON.stringify(product)]);
    return product;
  }

  async archiveProduct(id, user) {
    if (!isManager(user)) throw fail('Only staff can manage products', 403);
    const result = await db.query(`UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE product_id = $1 AND is_active = TRUE RETURNING *`, [id]);
    const product = rowOr404(result.rows[0], 'Product');
    await audit(null, user.id, 'archived', 'product', id, product);
    return product;
  }

  async listVariants(productId, query = {}) {
    const { limit, offset } = page(query);
    const result = await platformRepository.listVariants(productId, limit, offset);
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }

  async createVariant(productId, payload, user) {
    if (!isManager(user)) throw fail('Only staff can manage product variants', 403);
    const { name, additionalPrice = 0 } = payload || {};
    if (!name) throw fail('name is required');
    const product = (await db.query(`SELECT product_id FROM products WHERE product_id=$1 AND is_active=TRUE`, [productId])).rows[0];
    rowOr404(product, 'Active product');
    const result = await db.query(`INSERT INTO product_variants(product_id, variant_name, additional_price) VALUES ($1,$2,$3) RETURNING *`, [productId, name, money(amountCents(additionalPrice, 'additionalPrice'))]);
    await audit(null, user.id, 'created', 'product_variant', result.rows[0].variant_id, result.rows[0]);
    return result.rows[0];
  }

  async updateVariant(id, payload, user) {
    if (!isManager(user)) throw fail('Only staff can manage product variants', 403);
    const allowed = { name: 'variant_name', additionalPrice: 'additional_price' };
    const entries = Object.entries(payload || {}).filter(([key]) => allowed[key]);
    if (!entries.length) throw fail('No editable variant fields supplied');
    const params = [id];
    const set = entries.map(([key, value]) => {
      params.push(key === 'additionalPrice' ? money(amountCents(value, key)) : value);
      return `${allowed[key]}=$${params.length}`;
    });
    const result = await db.query(`UPDATE product_variants SET ${set.join(', ')} WHERE variant_id=$1 AND is_active=TRUE RETURNING *`, params);
    const variant = rowOr404(result.rows[0], 'Product variant');
    await audit(null, user.id, 'updated', 'product_variant', id, variant);
    return variant;
  }

  async archiveVariant(id, user) {
    if (!isManager(user)) throw fail('Only staff can manage product variants', 403);
    const result = await db.query(`UPDATE product_variants SET is_active=FALSE WHERE variant_id=$1 AND is_active=TRUE RETURNING *`, [id]);
    const variant = rowOr404(result.rows[0], 'Product variant');
    await audit(null, user.id, 'archived', 'product_variant', id, variant);
    return variant;
  }

  async listQuotations(user, query = {}) {
    const { limit, offset } = page(query);
    const customerId = tenantId(user);
    const result = await platformRepository.listQuotations(customerId, limit, offset);
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }

  async getQuotation(id, user) {
    const header = (await db.query(`SELECT * FROM quotations WHERE quotation_id=$1 AND ($2::bigint IS NULL OR customer_id=$2)`, [id, tenantId(user)])).rows[0];
    rowOr404(header, 'Quotation');
    const items = (await db.query(`SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY quotation_item_id`, [id])).rows;
    return { ...header, items };
  }

  async cancelQuotation(id, user) {
    const result = await db.query(
      `UPDATE quotations SET status='CANCELLED' WHERE quotation_id=$1 AND ($2::bigint IS NULL OR customer_id=$2) AND status IN ('DRAFT','SENT') RETURNING *`,
      [id, tenantId(user)]
    );
    const quotation = rowOr404(result.rows[0], 'Open quotation');
    await audit(null, user.id, 'cancelled', 'quotation', id, quotation);
    return quotation;
  }

  async listQuotationTemplates(query = {}) {
    const { limit, offset } = page(query);
    const result = await platformRepository.listQuotationTemplates(limit, offset);
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }

  async createQuotationTemplate(payload, user) {
    if (!isManager(user)) throw fail('Only staff can manage quotation templates', 403);
    const { name, validityDays, items = [] } = payload || {};
    if (!name || !Number.isInteger(Number(validityDays)) || Number(validityDays) < 1 || !Array.isArray(items)) throw fail('name, positive validityDays and an items array are required');
    return transaction(async (client) => {
      const template = (await client.query(`INSERT INTO quotation_templates(template_name,validity_days) VALUES($1,$2) RETURNING *`, [name.trim(), Number(validityDays)])).rows[0];
      for (const item of items) {
        const qty = Number(item.quantity); const price = money(amountCents(item.unitPrice, 'unitPrice'));
        if (!Number.isInteger(qty) || qty < 1 || Boolean(item.productId) === Boolean(item.planId)) throw fail('Template item needs exactly one productId or planId and a positive integer quantity');
        if (item.productId) item.productId = positiveId(item.productId, 'productId');
        if (item.planId) item.planId = positiveId(item.planId, 'planId');
        const reference = item.productId
          ? (await client.query(`SELECT product_id FROM products WHERE product_id=$1 AND is_active=TRUE`, [item.productId])).rows[0]
          : (await client.query(`SELECT plan_id FROM plans WHERE plan_id=$1 AND is_active=TRUE`, [item.planId])).rows[0];
        rowOr404(reference, item.productId ? 'Active product' : 'Active plan');
        await client.query(`INSERT INTO quotation_template_items(template_id,product_id,plan_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)`, [template.template_id, item.productId || null, item.planId || null, qty, price]);
      }
      await audit(client, user.id, 'created', 'quotation_template', template.template_id, template);
      return template;
    });
  }

  async createQuotation(payload, user, req) {
    if (!isManager(user)) throw fail('Only staff can create quotations', 403);
    const customerId = Number(payload?.customerId);
    const items = payload?.items;
    if (!Number.isSafeInteger(customerId) || customerId < 1 || !Array.isArray(items) || items.length === 0) throw fail('customerId and at least one item are required');
    const issueDate = payload.issueDate || new Date().toISOString().slice(0, 10);
    const validUntil = payload.validUntil;
    if (!isDateOnly(issueDate) || !isDateOnly(validUntil) || validUntil < issueDate) throw fail('issueDate and validUntil must be valid dates, with validUntil on or after issueDate');
    const result = await idempotent(req, async (client) => {
      const customer = (await client.query(`SELECT customer_id FROM customers WHERE customer_id=$1 AND is_active=TRUE FOR KEY SHARE`, [customerId])).rows[0];
      rowOr404(customer, 'Active customer');
      const quotationNumber = `QT-${crypto.randomUUID()}`;
      const header = (await client.query(
        `INSERT INTO quotations(customer_id, quotation_number, quotation_date, valid_until, status)
         VALUES($1,$2,$3,$4,'DRAFT') RETURNING *`, [customerId, quotationNumber, issueDate, validUntil]
      )).rows[0];
      let subtotal = 0; let taxTotal = 0;
      for (const item of items) {
        const quantity = Number(item.quantity);
        const unitPrice = amountCents(item.unitPrice, 'unitPrice');
        if (!Number.isSafeInteger(quantity) || quantity < 1 || Boolean(item.productId) === Boolean(item.planId)) throw fail('Each item needs exactly one productId or planId and a positive integer quantity');
        if (item.productId) item.productId = positiveId(item.productId, 'productId');
        if (item.planId) item.planId = positiveId(item.planId, 'planId');
        if (item.taxId) item.taxId = positiveId(item.taxId, 'taxId');
        const reference = item.productId
          ? (await client.query(`SELECT name AS description FROM products WHERE product_id=$1 AND is_active=TRUE`, [item.productId])).rows[0]
          : (await client.query(`SELECT plan_name AS description FROM plans WHERE plan_id=$1 AND is_active=TRUE`, [item.planId])).rows[0];
        rowOr404(reference, item.productId ? 'Active product' : 'Active plan');
        let configuredTaxRate = Number(item.taxRate || 0);
        if (item.taxId) {
          const tax = (await client.query(
            `SELECT tax_rate FROM taxes WHERE tax_id=$1 AND is_active=TRUE AND effective_from<=NOW() AND (effective_until IS NULL OR effective_until>=NOW())`, [item.taxId]
          )).rows[0];
          rowOr404(tax, 'Active tax');
          configuredTaxRate = Number(tax.tax_rate) * 100;
        }
        const taxRate = rateBasisPoints(configuredTaxRate);
        const lineBase = unitPrice * quantity;
        const tax = Math.round(lineBase * taxRate / 10_000);
        const lineTotal = lineBase + tax;
        subtotal += lineBase; taxTotal += tax;
        let description = item.description || reference.description;
        description ||= 'Quoted item';
        await client.query(
          `INSERT INTO quotation_items(quotation_id, product_id, plan_id, description_snapshot, quantity, unit_price, tax_rate, tax_amount, line_total)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [header.quotation_id, item.productId || null, item.planId || null, description, quantity, money(unitPrice), (taxRate / 10_000).toFixed(4), money(tax), money(lineTotal)]
        );
      }
      const updated = (await client.query(
        `UPDATE quotations SET subtotal=$2, tax_total=$3, total_amount=$4 WHERE quotation_id=$1 RETURNING *`,
        [header.quotation_id, money(subtotal), money(taxTotal), money(subtotal + taxTotal)]
      )).rows[0];
      await audit(client, user.id, 'created', 'quotation', updated.quotation_id, updated);
      return { status: 201, body: { success: true, data: updated }, resourceId: updated.quotation_id };
    });
    return result;
  }

  async confirmQuotation(id, user, req) {
    if (user.role !== 'CUSTOMER' && !isManager(user)) throw fail('Not authorized', 403);
    const customerId = tenantId(user);
    const result = await idempotent(req, async (client) => {
      const quotation = (await client.query(
        `SELECT * FROM quotations WHERE quotation_id=$1 AND ($2::bigint IS NULL OR customer_id=$2) FOR UPDATE`, [id, customerId]
      )).rows[0];
      rowOr404(quotation, 'Quotation');
      if (quotation.status === 'ACCEPTED') {
        const existing = (await client.query(`SELECT * FROM subscriptions WHERE source_quotation_id=$1`, [id])).rows[0];
        return { status: 200, body: { success: true, data: existing }, resourceId: existing?.subscription_id };
      }
      if (quotation.status !== 'SENT' || quotation.valid_until < new Date().toISOString().slice(0, 10)) throw fail('Only a current sent quotation can be accepted', 409);
      const lines = (await client.query(`SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY quotation_item_id`, [id])).rows;
      const planLine = lines.find((line) => line.plan_id);
      if (!planLine) throw fail('A quotation must include a plan before it can create a subscription');
      await client.query(`UPDATE quotations SET status='ACCEPTED' WHERE quotation_id=$1`, [id]);
      const subscription = (await client.query(
        `INSERT INTO subscriptions(customer_id, plan_id, source_quotation_id, subscription_number, start_date, status)
         VALUES($1,$2,$3,$4,CURRENT_DATE,'CONFIRMED') RETURNING *`,
        [quotation.customer_id, planLine.plan_id, id, `SUB-${crypto.randomUUID()}`]
      )).rows[0];
      for (const line of lines) {
        if (line.product_id) {
          await client.query(
            `INSERT INTO subscription_items(subscription_id, product_id, description_snapshot, quantity, unit_price, tax_rate_snapshot)
             VALUES($1,$2,$3,$4,$5,$6)`,
            [subscription.subscription_id, line.product_id, line.description_snapshot, line.quantity, line.unit_price, line.tax_rate]
          );
        } else {
          await client.query(
            `INSERT INTO subscription_items(subscription_id,description_snapshot,quantity,unit_price,tax_rate_snapshot)
             VALUES($1,$2,$3,$4,$5)`,
            [subscription.subscription_id, line.description_snapshot, line.quantity, line.unit_price, line.tax_rate]
          );
        }
      }
      await audit(client, user.id, 'accepted', 'quotation', id, { subscriptionId: subscription.subscription_id });
      return { status: 201, body: { success: true, data: subscription }, resourceId: subscription.subscription_id };
    });
    return result;
  }

  async sendQuotation(id, user) {
    if (!isManager(user)) throw fail('Only staff can send quotations', 403);
    const result = await db.query(
      `UPDATE quotations SET status='SENT' WHERE quotation_id=$1 AND status='DRAFT' AND valid_until >= CURRENT_DATE RETURNING *`, [id]
    );
    const quotation = rowOr404(result.rows[0], 'Draft quotation');
    await db.query(`INSERT INTO audit_logs(user_id, entity_type, entity_id, action, new_values) VALUES($1,'quotation',$2,'sent',$3::jsonb)`, [user.id, id, JSON.stringify(quotation)]);
    return quotation;
  }

  async listInvoices(user, query = {}) {
    const { limit, offset } = page(query);
    const result = await platformRepository.listInvoices(tenantId(user), limit, offset);
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }

  async getInvoice(id, user) {
    const invoice = (await db.query(`SELECT * FROM invoices WHERE invoice_id=$1 AND ($2::bigint IS NULL OR customer_id=$2)`, [id, tenantId(user)])).rows[0];
    rowOr404(invoice, 'Invoice');
    invoice.items = (await db.query(`SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY invoice_item_id`, [id])).rows;
    return invoice;
  }

  async cancelInvoice(id, user) {
    if (!isManager(user)) throw fail('Only staff can cancel invoices', 403);
    return transaction(async (client) => {
      const invoice = (await client.query(`SELECT * FROM invoices WHERE invoice_id=$1 FOR UPDATE`, [id])).rows[0];
      rowOr404(invoice, 'Invoice');
      if (invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID') throw fail('An invoice with payments cannot be cancelled', 409);
      if (invoice.status === 'CANCELLED') return invoice;
      const openCheckout = (await client.query(
        `SELECT 1 FROM payments WHERE invoice_id=$1 AND provider='stripe' AND status='PENDING' AND provider_checkout_session_id IS NOT NULL LIMIT 1`, [id]
      )).rowCount;
      if (openCheckout) throw fail('Wait for the Stripe Checkout session to finish or expire before cancelling this invoice', 409);
      await client.query(`UPDATE payments SET status='CANCELLED' WHERE invoice_id=$1 AND status='PENDING'`, [id]);
      const updated = (await client.query(`UPDATE invoices SET status='CANCELLED',updated_at=NOW() WHERE invoice_id=$1 RETURNING *`, [id])).rows[0];
      await audit(client, user.id, 'cancelled', 'invoice', id, updated);
      return updated;
    });
  }

  async generateInvoice(subscriptionId, payload, user, req) {
    if (!isManager(user)) throw fail('Only staff can generate invoices', 403);
    const periodStart = payload.billingPeriodStart;
    if (!isDateOnly(periodStart)) throw fail('billingPeriodStart must be a valid YYYY-MM-DD date');
    const result = await idempotent(req, async (client) => {
      const subscription = (await client.query(
        `SELECT s.*, p.billing_frequency, p.allow_renewal, p.auto_close
         FROM subscriptions s JOIN plans p ON p.plan_id=s.plan_id
         WHERE s.subscription_id=$1 FOR UPDATE OF s`, [subscriptionId]
      )).rows[0];
      rowOr404(subscription, 'Subscription');
      if (!['ACTIVE', 'CONFIRMED'].includes(subscription.status)) throw fail('Only confirmed or active subscriptions can be billed', 409);
      if (subscription.status === 'ACTIVE' && !subscription.allow_renewal) {
        await client.query(`UPDATE subscriptions SET status='CLOSED',updated_at=NOW() WHERE subscription_id=$1`, [subscriptionId]);
        await audit(client, user.id, 'closed', 'subscription', subscriptionId, { reason: 'renewal_not_allowed' });
        return { status: 200, body: { success: true, message: 'Subscription closed because renewal is disabled.' }, resourceId: subscriptionId };
      }
      if (subscription.auto_close && subscription.expiry_date && new Date(subscription.expiry_date) < new Date(periodStart)) {
        await client.query(`UPDATE subscriptions SET status='CLOSED',updated_at=NOW() WHERE subscription_id=$1`, [subscriptionId]);
        await audit(client, user.id, 'closed', 'subscription', subscriptionId, { reason: 'expired' });
        return { status: 200, body: { success: true, message: 'Expired subscription was closed.' }, resourceId: subscriptionId };
      }
      const periodEnd = payload.billingPeriodEnd || addBillingPeriod(periodStart, subscription.billing_frequency);
      if (!isDateOnly(periodEnd) || periodEnd < periodStart) throw fail('billingPeriodEnd must be a valid date on or after billingPeriodStart');
      const prior = (await client.query(
        `SELECT * FROM invoices WHERE subscription_id=$1 AND billing_period_start=$2 AND billing_period_end=$3 AND status <> 'CANCELLED'`,
        [subscriptionId, periodStart, periodEnd]
      )).rows[0];
      if (prior) return { status: 200, body: { success: true, data: prior, message: 'Invoice already exists for this billing period.' }, resourceId: prior.invoice_id };

      let items = (await client.query(
        `SELECT si.product_id, si.description_snapshot, si.quantity, si.unit_price, si.tax_rate_snapshot
         FROM subscription_items si WHERE si.subscription_id=$1 ORDER BY si.subscription_item_id`, [subscriptionId]
      )).rows;
      if (!items.length) {
        items = (await client.query(
          `SELECT NULL::bigint AS product_id, p.plan_name AS description_snapshot, 1 AS quantity, p.price AS unit_price, 0::numeric AS tax_rate_snapshot
           FROM plans p WHERE p.plan_id=$1`, [subscription.plan_id]
        )).rows;
      }
      if (!items.length) throw fail('Subscription has no billable items', 409);
      let subtotal = 0; let taxTotal = 0; let quantityTotal = 0;
      const calculated = items.map((item) => {
        const qty = Number(item.quantity);
        const unit = cents(item.unit_price);
        const lineBase = Math.round(qty * unit);
        const taxRate = storedRateBasisPoints(item.tax_rate_snapshot);
        const tax = Math.round(lineBase * taxRate / 10_000);
        subtotal += lineBase; taxTotal += tax; quantityTotal += qty;
        return { ...item, qty, unit, lineBase, taxRate, tax, lineTotal: lineBase + tax };
      });
      let discountAmount = 0;
      if (payload.discountId) {
        const discount = (await client.query(`SELECT * FROM discounts WHERE discount_id=$1 FOR UPDATE`, [payload.discountId])).rows[0];
        rowOr404(discount, 'Discount');
        if (!discount.is_active || new Date(discount.starts_at) > new Date() || (discount.ends_at && new Date(discount.ends_at) < new Date())) throw fail('Discount is not currently active', 409);
        if (subtotal < cents(discount.minimum_purchase) || quantityTotal < Number(discount.minimum_quantity)) throw fail('Invoice does not meet discount minimums', 409);
        if (discount.usage_limit !== null && Number(discount.usage_count) >= Number(discount.usage_limit)) throw fail('Discount usage limit has been reached', 409);
        if (discount.applies_to === 'products') {
          const eligible = (await client.query(`SELECT product_id FROM discount_products WHERE discount_id=$1`, [discount.discount_id])).rows.map((row) => Number(row.product_id));
          if (eligible.length && calculated.some((item) => !eligible.includes(Number(item.product_id)))) throw fail('Discount does not cover every invoice product', 409);
        }
        discountAmount = discount.discount_type === 'PERCENTAGE'
          ? Math.min(subtotal, Math.round(subtotal * Number(discount.discount_value) / 100))
          : Math.min(subtotal, cents(discount.discount_value));
        await client.query(`UPDATE discounts SET usage_count=usage_count+1 WHERE discount_id=$1`, [discount.discount_id]);
      }
      taxTotal = 0;
      let allocatedDiscount = 0;
      calculated.forEach((item, index) => {
        item.discount = index === calculated.length - 1
          ? discountAmount - allocatedDiscount
          : (subtotal ? Math.round(discountAmount * item.lineBase / subtotal) : 0);
        allocatedDiscount += item.discount;
        const taxableBase = item.lineBase - item.discount;
        item.tax = Math.round(taxableBase * item.taxRate / 10_000);
        item.lineTotal = taxableBase + item.tax;
        taxTotal += item.tax;
      });
      const total = subtotal - discountAmount + taxTotal;
      const dueDate = payload.dueDate || (() => { const d = new Date(`${periodStart}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + Number(subscription.payment_terms_days || 0)); return d.toISOString().slice(0, 10); })();
      const currency = String(payload.currency || env.defaultCurrency).toUpperCase();
      if (!isDateOnly(dueDate) || dueDate < new Date().toISOString().slice(0, 10) || !/^[A-Z]{3}$/.test(currency)) throw fail('dueDate must be a valid current/future date and currency must be a three-letter code');
      const invoice = (await client.query(
        `INSERT INTO invoices(invoice_number, customer_id, subscription_id, invoice_date, due_date, billing_period_start, billing_period_end, currency, subtotal, discount_amount, tax_amount, total_amount, status)
         VALUES($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING') RETURNING *`,
        [`INV-${crypto.randomUUID()}`, subscription.customer_id, subscriptionId, dueDate, periodStart, periodEnd, currency, money(subtotal), money(discountAmount), money(taxTotal), money(total)]
      )).rows[0];
      for (const item of calculated) {
        await client.query(
          `INSERT INTO invoice_items(invoice_id, product_id, description_snapshot, quantity, unit_price, discount_amount, tax_rate_snapshot, tax_amount, line_total)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [invoice.invoice_id, item.product_id, item.description_snapshot, item.qty, money(item.unit), money(item.discount), (item.taxRate / 10_000).toFixed(4), money(item.tax), money(item.lineTotal)]
        );
      }
      if (payload.discountId) {
        await client.query(`INSERT INTO discount_usages(discount_id, subscription_id, invoice_id, discount_amount) VALUES($1,$2,$3,$4)`, [payload.discountId, subscriptionId, invoice.invoice_id, money(discountAmount)]);
      }
      await client.query(`UPDATE subscriptions SET next_billing_at=$2::date, status='ACTIVE' WHERE subscription_id=$1`, [subscriptionId, periodEnd]);
      await audit(client, user.id, 'generated', 'invoice', invoice.invoice_id, { subscriptionId, periodStart, periodEnd });
      return { status: 201, body: { success: true, data: invoice }, resourceId: invoice.invoice_id };
    });
    return result;
  }

  async listPayments(invoiceId, user, query = {}) {
    const { limit, offset } = page(query);
    const result = await platformRepository.listPayments(invoiceId, tenantId(user), limit, offset);
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }

  async createCheckout(invoiceId, user, req) {
    const result = await idempotent(req, async (client) => {
      const invoice = (await client.query(
        `SELECT i.*, c.email AS customer_email, c.billing_email
         FROM invoices i JOIN customers c ON c.customer_id=i.customer_id
         WHERE i.invoice_id=$1 AND ($2::bigint IS NULL OR i.customer_id=$2) FOR UPDATE OF i`,
        [invoiceId, tenantId(user)]
      )).rows[0];
      rowOr404(invoice, 'Invoice');
      if (!['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) throw fail('Only unpaid invoices can be paid online', 409);
      const existingCheckout = await client.query(
        `SELECT 1 FROM payments WHERE invoice_id=$1 AND provider='stripe' AND status='PENDING' AND provider_checkout_session_id IS NOT NULL LIMIT 1`, [invoiceId]
      );
      if (existingCheckout.rowCount) throw fail('A Stripe Checkout session is already open for this invoice', 409);
      const paid = Number((await client.query(`SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE invoice_id=$1 AND status='SUCCESS'`, [invoiceId])).rows[0].amount);
      const refunded = Number((await client.query(`SELECT COALESCE(SUM(r.amount),0) AS amount FROM payment_refunds r JOIN payments p ON p.payment_id=r.payment_id WHERE p.invoice_id=$1 AND r.status='COMPLETED'`, [invoiceId])).rows[0].amount);
      const outstandingCents = Math.round((Number(invoice.total_amount) - paid + refunded) * 100);
      if (outstandingCents <= 0) throw fail('This invoice has no outstanding balance', 409);
      const currency = invoice.currency.trim().toUpperCase();
      let minorUnitDigits;
      try {
        minorUnitDigits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
      } catch { throw fail('Invoice currency is not a valid ISO currency code'); }
      if (minorUnitDigits !== 2) throw fail('Stripe Checkout currently supports currencies with two minor-unit decimal places');
      const paymentReference = `PAY-${crypto.randomUUID()}`;
      const checkout = await stripeProvider.createCheckoutSession({
        mode: 'payment',
        client_reference_id: String(invoiceId),
        customer_email: invoice.billing_email || invoice.customer_email,
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: `Invoice ${invoice.invoice_number}` },
            unit_amount: outstandingCents,
          },
          quantity: 1,
        }],
        metadata: { invoiceId: String(invoiceId), paymentReference },
        payment_intent_data: { metadata: { invoiceId: String(invoiceId), paymentReference } },
        success_url: `${env.publicAppUrl.replace(/\/$/, '')}/invoices?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.publicAppUrl.replace(/\/$/, '')}/invoices?checkout=cancelled`,
      }, req.get('Idempotency-Key'));
      const payment = (await client.query(
        `INSERT INTO payments(invoice_id,payment_reference,payment_method,amount,currency,payment_date,status,note,idempotency_key,provider,provider_checkout_session_id)
         VALUES($1,$2,'stripe_checkout',$3,$4,NOW(),'PENDING','Stripe Checkout', $5,'stripe',$6) RETURNING *`,
        [invoiceId, paymentReference, (outstandingCents / 100).toFixed(2), currency.toUpperCase(), `${user.id}:stripe-checkout:${invoiceId}:${req.get('Idempotency-Key')}`, checkout.id]
      )).rows[0];
      await audit(client, user.id, 'checkout_created', 'payment', payment.payment_id, { invoiceId, checkoutSessionId: checkout.id });
      return { status: 201, body: { success: true, data: { payment, checkoutUrl: checkout.url } }, resourceId: payment.payment_id };
    });
    return result;
  }

  async recordPayment(invoiceId, payload, user, req) {
    if (!isManager(user)) throw fail('Only staff can record payments', 403);
    const amount = money(amountCents(payload?.amount, 'amount'));
    if (Number(amount) <= 0) throw fail('Payment amount must be greater than zero');
    const method = String(payload?.method || '').trim();
    if (!method) throw fail('method is required');
    return idempotent(req, async (client) => {
      const invoice = (await client.query(`SELECT * FROM invoices WHERE invoice_id=$1 FOR UPDATE`, [invoiceId])).rows[0];
      rowOr404(invoice, 'Invoice');
      if (invoice.status === 'CANCELLED') throw fail('A cancelled invoice cannot accept payments', 409);
      const paid = Number((await client.query(`SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE invoice_id=$1 AND status='SUCCESS'`, [invoiceId])).rows[0].amount);
      const refunds = Number((await client.query(`SELECT COALESCE(SUM(r.amount),0) AS amount FROM payment_refunds r JOIN payments p ON p.payment_id=r.payment_id WHERE p.invoice_id=$1 AND r.status='COMPLETED'`, [invoiceId])).rows[0].amount);
      const outstanding = Number(invoice.total_amount) - paid + refunds;
      if (Number(amount) > outstanding) throw fail('Payment exceeds the outstanding invoice balance', 409);
      const payment = (await client.query(
        `INSERT INTO payments(invoice_id,payment_reference,payment_method,amount,currency,payment_date,status,note,idempotency_key)
         VALUES($1,$2,$3,$4,$5,NOW(),'PENDING',$6,$7) RETURNING *`,
        [invoiceId, `PAY-${crypto.randomUUID()}`, method, amount, payload.currency || invoice.currency, payload.note || null, `${user.id}:invoice:${invoiceId}:${req.get('Idempotency-Key')}`]
      )).rows[0];
      await audit(client, user.id, 'recorded', 'payment', payment.payment_id, { invoiceId });
      return { status: 201, body: { success: true, data: payment }, resourceId: payment.payment_id };
    });
  }

  async createRefund(paymentId, payload, user, req) {
    if (user.role !== 'ADMIN') throw fail('Only admins can create refunds', 403);
    const amount = money(amountCents(payload?.amount, 'amount'));
    if (Number(amount) <= 0) throw fail('Refund amount must be greater than zero');
    return idempotent(req, async (client) => {
      const payment = (await client.query(`SELECT * FROM payments WHERE payment_id=$1 FOR UPDATE`, [paymentId])).rows[0];
      rowOr404(payment, 'Payment');
      if (payment.status !== 'SUCCESS') throw fail('Only successful payments can be refunded', 409);
      const refunded = Number((await client.query(`SELECT COALESCE(SUM(amount),0) AS amount FROM payment_refunds WHERE payment_id=$1 AND status IN ('PENDING','COMPLETED')`, [paymentId])).rows[0].amount);
      if (Number(amount) + refunded > Number(payment.amount)) throw fail('Refund exceeds the remaining payment amount', 409);
      let providerRefundId = null;
      if (payment.provider === 'stripe') {
        if (!payment.provider_payment_id) throw fail('Stripe payment is missing its provider payment ID', 409);
        const providerRefund = await stripeProvider.createRefund({
          payment_intent: payment.provider_payment_id,
          amount: Math.round(Number(amount) * 100),
          metadata: { paymentId: String(paymentId) },
        }, req.get('Idempotency-Key'));
        providerRefundId = providerRefund.id;
      }
      const refund = (await client.query(
        `INSERT INTO payment_refunds(payment_id,refund_reference,amount,refund_date,status,reason,provider_refund_id)
         VALUES($1,$2,$3,NOW(),'PENDING',$4,$5) RETURNING *`,
        [paymentId, `REF-${crypto.randomUUID()}`, amount, payload.reason || null, providerRefundId]
      )).rows[0];
      await audit(client, user.id, 'requested', 'payment_refund', refund.refund_id, { paymentId });
      return { status: 201, body: { success: true, data: refund }, resourceId: refund.refund_id };
    });
  }

  async processStripeEvent(event) {
    return transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO webhook_events(provider,provider_event_id,event_type,payload)
         VALUES('stripe',$1,$2,$3::jsonb) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING webhook_event_id`,
        [event.id, event.type, JSON.stringify(event)]
      );
      if (!inserted.rowCount) return { duplicate: true };
      const object = event.data?.object || {};
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
        if (event.type === 'checkout.session.completed' && object.payment_status !== 'paid') {
          await client.query(`UPDATE webhook_events SET status='PROCESSED',processed_at=NOW() WHERE webhook_event_id=$1`, [inserted.rows[0].webhook_event_id]);
          return { duplicate: false };
        }
        const payment = (await client.query(
          `SELECT * FROM payments WHERE provider='stripe' AND provider_checkout_session_id=$1 FOR UPDATE`, [object.id]
        )).rows[0];
        rowOr404(payment, 'Stripe Checkout payment');
        if (Math.round(Number(payment.amount) * 100) !== Number(object.amount_total) || payment.currency.toLowerCase() !== object.currency) throw fail('Stripe Checkout amount or currency does not match the invoice payment', 409);
        if (payment.status === 'PENDING') {
          const paymentIntent = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
          if (!paymentIntent) throw fail('Stripe Checkout session has no successful payment intent', 409);
          const succeeded = (await client.query(
            `UPDATE payments SET status='SUCCESS',provider_payment_id=$2,paid_at=NOW() WHERE payment_id=$1 RETURNING *`, [payment.payment_id, paymentIntent]
          )).rows[0];
          await this.refreshInvoiceBalance(client, payment.invoice_id);
          await audit(client, null, 'succeeded', 'payment', succeeded.payment_id, { eventId: event.id, provider: 'stripe' });
        }
      } else if (['checkout.session.async_payment_failed', 'checkout.session.expired'].includes(event.type)) {
        const payment = (await client.query(
          `UPDATE payments SET status='FAILED' WHERE provider='stripe' AND provider_checkout_session_id=$1 AND status='PENDING' RETURNING *`, [object.id]
        )).rows[0];
        if (payment) await audit(client, null, 'failed', 'payment', payment.payment_id, { eventId: event.id, provider: 'stripe' });
      } else if (['refund.updated', 'refund.failed'].includes(event.type)) {
        const isFailed = event.type === 'refund.failed' || object.status === 'failed';
        if (!isFailed && object.status !== 'succeeded') {
          await client.query(`UPDATE webhook_events SET status='PROCESSED',processed_at=NOW() WHERE webhook_event_id=$1`, [inserted.rows[0].webhook_event_id]);
          return { duplicate: false };
        }
        const refund = (await client.query(
          `UPDATE payment_refunds SET status=$2 WHERE provider_refund_id=$1 AND status='PENDING' RETURNING *`, [object.id, isFailed ? 'FAILED' : 'COMPLETED']
        )).rows[0];
        if (refund) {
          const payment = (await client.query(`SELECT * FROM payments WHERE payment_id=$1`, [refund.payment_id])).rows[0];
          await this.refreshInvoiceBalance(client, payment.invoice_id);
          await audit(client, null, isFailed ? 'failed' : 'completed', 'payment_refund', refund.refund_id, { eventId: event.id, provider: 'stripe' });
        }
      }
      await client.query(`UPDATE webhook_events SET status='PROCESSED',processed_at=NOW() WHERE webhook_event_id=$1`, [inserted.rows[0].webhook_event_id]);
      return { duplicate: false };
    });
  }

  async refreshInvoiceBalance(client, invoiceId) {
    const invoice = (await client.query(`SELECT total_amount,status FROM invoices WHERE invoice_id=$1 FOR UPDATE`, [invoiceId])).rows[0];
    rowOr404(invoice, 'Invoice');
    if (invoice.status === 'CANCELLED') return;
    const paid = Number((await client.query(`SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE invoice_id=$1 AND status='SUCCESS'`, [invoiceId])).rows[0].amount);
    const refunded = Number((await client.query(`SELECT COALESCE(SUM(r.amount),0) AS amount FROM payment_refunds r JOIN payments p ON p.payment_id=r.payment_id WHERE p.invoice_id=$1 AND r.status='COMPLETED'`, [invoiceId])).rows[0].amount);
    const outstanding = Number(invoice.total_amount) - paid + refunded;
    const status = outstanding <= 0 ? 'PAID' : paid > refunded ? 'PARTIALLY_PAID' : 'PENDING';
    await client.query(`UPDATE invoices SET status=$2,updated_at=NOW() WHERE invoice_id=$1`, [invoiceId, status]);
  }

  async processWebhook(provider, eventId, event) {
    return transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO webhook_events(provider,provider_event_id,event_type,payload)
         VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING webhook_event_id`,
        [provider, eventId, event.type, JSON.stringify(event)]
      );
      if (!inserted.rowCount) return { duplicate: true };
      if (event.type === 'payment.succeeded') {
        if (!event.paymentId || !event.invoiceId) throw fail('Provider payment id and invoiceId are required');
        const invoiceId = Number(event.invoiceId);
        const amount = money(amountCents(event.amount, 'amount'));
        if (Number(amount) <= 0) throw fail('Payment amount must be greater than zero');
        const invoice = (await client.query(`SELECT * FROM invoices WHERE invoice_id=$1 FOR UPDATE`, [invoiceId])).rows[0];
        rowOr404(invoice, 'Invoice');
        if (invoice.status === 'CANCELLED') throw fail('A cancelled invoice cannot be paid', 409);
        if (event.currency && event.currency !== invoice.currency.trim()) throw fail('Payment currency does not match invoice currency', 409);
        const paidBefore = Number((await client.query(`SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE invoice_id=$1 AND status='SUCCESS'`, [invoiceId])).rows[0].amount);
        const refundedBefore = Number((await client.query(`SELECT COALESCE(SUM(r.amount),0) AS amount FROM payment_refunds r JOIN payments p ON p.payment_id=r.payment_id WHERE p.invoice_id=$1 AND r.status='COMPLETED'`, [invoiceId])).rows[0].amount);
        if (Number(amount) > Number(invoice.total_amount) - paidBefore + refundedBefore) throw fail('Payment exceeds the outstanding invoice balance', 409);
        let payment = event.paymentReference
          ? (await client.query(`SELECT * FROM payments WHERE payment_reference=$1 FOR UPDATE`, [event.paymentReference])).rows[0]
          : null;
        if (payment) {
          if (Number(payment.invoice_id) !== invoiceId || Number(payment.amount) !== Number(amount) || payment.status !== 'PENDING') throw fail('Provider payment does not match the pending payment record', 409);
          payment = (await client.query(
            `UPDATE payments SET status='SUCCESS',provider=$2,provider_payment_id=$3,paid_at=NOW() WHERE payment_id=$1 RETURNING *`,
            [payment.payment_id, provider, event.paymentId]
          )).rows[0];
        } else {
          const insertedPayment = await client.query(
            `INSERT INTO payments(invoice_id,payment_reference,payment_method,amount,currency,payment_date,status,provider,provider_payment_id,paid_at)
             VALUES($1,$2,$3,$4,$5,NOW(),'SUCCESS',$6,$7,NOW()) ON CONFLICT DO NOTHING RETURNING *`,
            [invoiceId, `PAY-${crypto.randomUUID()}`, event.method || provider, amount, event.currency || invoice.currency, provider, event.paymentId]
          );
          payment = insertedPayment.rows[0];
          if (!payment) {
            payment = (await client.query(`SELECT * FROM payments WHERE provider=$1 AND provider_payment_id=$2 FOR UPDATE`, [provider, event.paymentId])).rows[0];
            if (!payment || Number(payment.invoice_id) !== invoiceId || Number(payment.amount) !== Number(amount) || payment.status !== 'SUCCESS') throw fail('Provider payment id is already linked to another payment', 409);
          }
        }
        const paid = Number((await client.query(`SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE invoice_id=$1 AND status='SUCCESS'`, [invoiceId])).rows[0].amount);
        const refunds = Number((await client.query(`SELECT COALESCE(SUM(r.amount),0) AS amount FROM payment_refunds r JOIN payments p ON p.payment_id=r.payment_id WHERE p.invoice_id=$1 AND r.status='COMPLETED'`, [invoiceId])).rows[0].amount);
        const balance = Number(invoice.total_amount) - paid + refunds;
        await client.query(`UPDATE invoices SET status=$2,updated_at=NOW() WHERE invoice_id=$1`, [invoiceId, balance <= 0 ? 'PAID' : 'PARTIALLY_PAID']);
        await audit(client, null, 'succeeded', 'payment', payment.payment_id, { eventId });
      } else if (event.type === 'refund.completed') {
        if (!event.paymentId || !event.refundId || event.amount === undefined) throw fail('Provider payment id, refund id and amount are required');
        const payment = (await client.query(`SELECT * FROM payments WHERE provider=$1 AND provider_payment_id=$2 FOR UPDATE`, [provider, event.paymentId])).rows[0];
        rowOr404(payment, 'Payment');
        const refund = (await client.query(
          `SELECT * FROM payment_refunds WHERE payment_id=$1 AND status='PENDING' AND amount=$2 ORDER BY created_at LIMIT 1 FOR UPDATE`,
          [payment.payment_id, event.amount]
        )).rows[0];
        rowOr404(refund, 'Pending refund');
        await client.query(`UPDATE payment_refunds SET status='COMPLETED',provider_refund_id=$2 WHERE refund_id=$1`, [refund.refund_id, event.refundId]);
        await audit(client, null, 'completed', 'payment_refund', refund.refund_id, { provider, eventId });
        const invoice = (await client.query(`SELECT invoice_id,total_amount FROM invoices WHERE invoice_id=$1`, [payment.invoice_id])).rows[0];
        const paid = Number((await client.query(`SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE invoice_id=$1 AND status='SUCCESS'`, [invoice.invoice_id])).rows[0].amount);
        const refunded = Number((await client.query(`SELECT COALESCE(SUM(r.amount),0) AS amount FROM payment_refunds r JOIN payments p ON p.payment_id=r.payment_id WHERE p.invoice_id=$1 AND r.status='COMPLETED'`, [invoice.invoice_id])).rows[0].amount);
        const balance = Number(invoice.total_amount) - paid + refunded;
        await client.query(`UPDATE invoices SET status=$2,updated_at=NOW() WHERE invoice_id=$1`, [invoice.invoice_id, balance <= 0 ? 'PAID' : (paid > refunded ? 'PARTIALLY_PAID' : 'PENDING')]);
      } else if (event.type === 'payment.failed') {
        if (!event.paymentId) throw fail('Provider payment id is required');
        const pending = event.paymentReference
          ? (await client.query(`SELECT * FROM payments WHERE payment_reference=$1 AND status='PENDING' FOR UPDATE`, [event.paymentReference])).rows[0]
          : (await client.query(`SELECT * FROM payments WHERE provider=$1 AND provider_payment_id=$2 AND status='PENDING' FOR UPDATE`, [provider, event.paymentId])).rows[0];
        rowOr404(pending, 'Pending payment');
        await client.query(`UPDATE payments SET status='FAILED',provider=$2,provider_payment_id=$3 WHERE payment_id=$1`, [pending.payment_id, provider, event.paymentId]);
        await audit(client, null, 'failed', 'payment', pending.payment_id, { eventId });
      } else {
        throw fail('Unsupported payment webhook event', 400);
      }
      await client.query(`UPDATE webhook_events SET status='PROCESSED',processed_at=NOW() WHERE webhook_event_id=$1`, [inserted.rows[0].webhook_event_id]);
      return { duplicate: false };
    });
  }

  async listDiscounts(user, query = {}) {
    if (!isManager(user)) throw fail('Only staff can manage discounts', 403);
    const { limit, offset } = page(query);
    const result = await platformRepository.listDiscounts(limit, offset);
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }

  async listTaxes(query = {}) {
    const { limit, offset } = page(query);
    const result = await platformRepository.listTaxes(limit, offset);
    return { data: result.rows, meta: paginationMeta({ limit, offset, total: result.total }) };
  }

  async createTax(payload, user) {
    if (user.role !== 'ADMIN') throw fail('Only admins can manage tax rates', 403);
    const { name, rate, effectiveFrom = new Date().toISOString(), effectiveUntil = null } = payload || {};
    const value = Number(rate);
    if (!name || !Number.isFinite(value) || value < 0 || value > 100 || Number.isNaN(Date.parse(effectiveFrom)) || (effectiveUntil && Number.isNaN(Date.parse(effectiveUntil)))) throw fail('name, valid effective dates and a tax rate between 0 and 100 are required');
    const result = await db.query(
      `INSERT INTO taxes(tax_name,tax_rate,effective_from,effective_until) VALUES($1,$2,$3,$4) RETURNING *`,
      [name.trim(), (value / 100).toFixed(4), effectiveFrom, effectiveUntil]
    );
    await audit(null, user.id, 'created', 'tax', result.rows[0].tax_id, result.rows[0]);
    return result.rows[0];
  }

  async createDiscount(payload, user) {
    if (user.role !== 'ADMIN') throw fail('Only admins can create discounts', 403);
    const { name, type, value, minimumPurchase = 0, minimumQuantity = 0, startsAt, endsAt = null, usageLimit = null, appliesTo = 'products', productIds = [] } = payload || {};
    const discountType = String(type || '').toUpperCase();
    if (!name || !['FIXED', 'PERCENTAGE'].includes(discountType) || !startsAt || Number.isNaN(Date.parse(startsAt)) || !['products', 'subscription'].includes(appliesTo)) throw fail('name, valid type, startsAt and appliesTo are required');
    const centsValue = amountCents(value, 'value');
    if (centsValue <= 0 || (discountType === 'PERCENTAGE' && Number(value) > 100)) throw fail('Discount value must be greater than zero and percentage cannot exceed 100');
    if (!Number.isInteger(Number(minimumQuantity)) || Number(minimumQuantity) < 0) throw fail('minimumQuantity must be a non-negative integer');
    if (usageLimit !== null && (!Number.isInteger(Number(usageLimit)) || Number(usageLimit) < 1)) throw fail('usageLimit must be a positive integer or null');
    if (!Array.isArray(productIds)) throw fail('productIds must be an array');
    for (const id of productIds) positiveId(id, 'productId');
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) throw fail('endsAt must be after startsAt');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const productId of productIds) {
        const product = (await client.query(`SELECT product_id FROM products WHERE product_id=$1 AND is_active=TRUE FOR KEY SHARE`, [productId])).rows[0];
        rowOr404(product, 'Active product for discount');
      }
      const discount = (await client.query(
        `INSERT INTO discounts(discount_name,discount_type,discount_value,minimum_purchase,minimum_quantity,starts_at,ends_at,usage_limit,applies_to)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [name, discountType, money(centsValue), money(amountCents(minimumPurchase, 'minimumPurchase')), Number(minimumQuantity), startsAt, endsAt, usageLimit, appliesTo]
      )).rows[0];
      for (const productId of productIds) await client.query(`INSERT INTO discount_products(discount_id,product_id) VALUES($1,$2)`, [discount.discount_id, productId]);
      await audit(client, user.id, 'created', 'discount', discount.discount_id, discount);
      await client.query('COMMIT');
      return discount;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async updateDiscount(id, payload, user) {
    if (user.role !== 'ADMIN') throw fail('Only admins can update discounts', 403);
    const columns = { name: 'discount_name', minimumPurchase: 'minimum_purchase', minimumQuantity: 'minimum_quantity', startsAt: 'starts_at', endsAt: 'ends_at', usageLimit: 'usage_limit', isActive: 'is_active', appliesTo: 'applies_to' };
    const entries = Object.entries(payload || {}).filter(([key]) => columns[key]);
    if (payload?.value !== undefined) entries.push(['value', payload.value]);
    if (!entries.length) throw fail('No editable discount fields supplied');
    const values = [id];
    const set = entries.map(([key, raw]) => {
      let column = columns[key]; let value = raw;
      if (key === 'value') { column = 'discount_value'; value = money(amountCents(raw, 'value')); }
      if (key === 'minimumPurchase') value = money(amountCents(raw, 'minimumPurchase'));
      if (key === 'minimumQuantity' || key === 'usageLimit') {
        if (raw !== null && (!Number.isInteger(Number(raw)) || Number(raw) < (key === 'usageLimit' ? 1 : 0))) throw fail(`${key} has an invalid value`);
        value = raw === null ? null : Number(raw);
      }
      if (key === 'appliesTo' && !['products', 'subscription'].includes(value)) throw fail('appliesTo must be products or subscription');
      if (key === 'isActive' && typeof value !== 'boolean') throw fail('isActive must be a boolean');
      values.push(value);
      return `${column}=$${values.length}`;
    });
    const result = await db.query(`UPDATE discounts SET ${set.join(',')},updated_at=NOW() WHERE discount_id=$1 AND (usage_limit IS NULL OR usage_limit >= usage_count) RETURNING *`, values);
    const discount = rowOr404(result.rows[0], 'Discount');
    await audit(null, user.id, 'updated', 'discount', id, discount);
    return discount;
  }

  async archiveDiscount(id, user) {
    if (user.role !== 'ADMIN') throw fail('Only admins can archive discounts', 403);
    const result = await db.query(`UPDATE discounts SET is_active=FALSE,updated_at=NOW() WHERE discount_id=$1 AND is_active=TRUE RETURNING *`, [id]);
    const discount = rowOr404(result.rows[0], 'Discount');
    await audit(null, user.id, 'archived', 'discount', id, discount);
    return discount;
  }

  async deactivateTax(id, user) {
    if (user.role !== 'ADMIN') throw fail('Only admins can manage tax rates', 403);
    const result = await db.query(`UPDATE taxes SET is_active=FALSE WHERE tax_id=$1 AND is_active=TRUE RETURNING *`, [id]);
    const tax = rowOr404(result.rows[0], 'Tax rate');
    await audit(null, user.id, 'deactivated', 'tax', id, tax);
    return tax;
  }

  async dashboardSummary(user) {
    const customerId = tenantId(user);
    if (!customerId && !isManager(user)) throw fail('Not authorized', 403);
    const result = await db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM subscriptions WHERE status='ACTIVE' AND ($1::bigint IS NULL OR customer_id=$1)) AS active_subscriptions,
        (SELECT COALESCE(SUM(total_amount),0) FROM invoices WHERE ($1::bigint IS NULL OR customer_id=$1)) AS invoiced_total,
        (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN invoices i ON i.invoice_id=p.invoice_id WHERE p.status='SUCCESS' AND p.payment_date >= date_trunc('month',NOW()) AND ($1::bigint IS NULL OR i.customer_id=$1)) AS revenue_this_month,
        (SELECT COALESCE(SUM(i.total_amount - COALESCE(p.paid,0) + COALESCE(r.refunded,0)),0)
         FROM invoices i
         LEFT JOIN LATERAL (SELECT SUM(amount) AS paid FROM payments WHERE invoice_id=i.invoice_id AND status='SUCCESS') p ON TRUE
         LEFT JOIN LATERAL (SELECT SUM(pr.amount) AS refunded FROM payment_refunds pr JOIN payments pay ON pay.payment_id=pr.payment_id WHERE pay.invoice_id=i.invoice_id AND pr.status='COMPLETED') r ON TRUE
         WHERE i.status <> 'CANCELLED' AND ($1::bigint IS NULL OR i.customer_id=$1)) AS outstanding_total,
        (SELECT COUNT(*)::int FROM invoices WHERE status IN ('PENDING','OVERDUE') AND due_date < CURRENT_DATE AND ($1::bigint IS NULL OR customer_id=$1)) AS overdue_invoices`,
      [customerId]
    );
    return result.rows[0];
  }

  async runBilling(user) {
    if (!isManager(user)) throw fail('Only staff can run billing', 403);
    await db.query(`UPDATE invoices SET status='OVERDUE',updated_at=NOW() WHERE status IN ('PENDING','PARTIALLY_PAID') AND due_date<CURRENT_DATE`);
    const run = (await db.query(`INSERT INTO billing_runs(started_by,status) VALUES($1,'RUNNING') RETURNING billing_run_id`, [user.id])).rows[0];
    const due = (await db.query(
      `SELECT subscription_id, to_char(next_billing_at::date, 'YYYY-MM-DD') AS billing_period_start FROM subscriptions
       WHERE status='ACTIVE' AND next_billing_at <= NOW() ORDER BY next_billing_at LIMIT 500`
    )).rows;
    let processed = 0; let failed = 0;
    for (const subscription of due) {
      try {
        const key = `billing-run:${run.billing_run_id}:subscription:${subscription.subscription_id}:${subscription.billing_period_start}`;
        const fakeRequest = { method: 'POST', baseUrl: '/api/v1', path: `/subscriptions/${subscription.subscription_id}/invoices`, body: { billingPeriodStart: subscription.billing_period_start }, user, get: (name) => name.toLowerCase() === 'idempotency-key' ? key : undefined };
        await this.generateInvoice(subscription.subscription_id, fakeRequest.body, user, fakeRequest);
        processed += 1;
      } catch (error) { failed += 1; console.error(`Billing run ${run.billing_run_id}, subscription ${subscription.subscription_id}:`, error.message); }
    }
    const status = failed ? (processed ? 'COMPLETED' : 'FAILED') : 'COMPLETED';
    await db.query(`UPDATE billing_runs SET completed_at=NOW(), status=$2, processed_count=$3, failed_count=$4 WHERE billing_run_id=$1`, [run.billing_run_id, status, processed, failed]);
    return { billingRunId: run.billing_run_id, status, processedCount: processed, failedCount: failed };
  }
}

module.exports = Object.assign(new PlatformService(), { idempotent, audit, fail });
