const subscriptionRepository = require('../repositories/subscriptionRepository');
const { idempotent, audit, fail } = require('./platformService');

class SubscriptionService {
  async listSubscriptions(user, query = {}) {
    const customerId = user.role === 'CUSTOMER' ? user.customerId : null;
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
    const offset = Math.max(Number.parseInt(query.offset, 10) || 0, 0);
    const rows = await subscriptionRepository.findAll(customerId, limit, offset);
    return { success: true, data: rows, meta: { limit, offset }, message: 'Subscriptions listed successfully.' };
  }

  async createSubscription(payload = {}, user, req) {
    const paymentTermsDays = Number(payload.paymentTermsDays ?? 0);
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0) throw Object.assign(new Error('paymentTermsDays must be a non-negative integer'), { statusCode: 400 });
    const customerId = user.role === 'CUSTOMER' ? Number(user.customerId) : Number(payload.customerId);
    const planId = Number(payload.planId);
    if (!Number.isSafeInteger(customerId) || customerId < 1 || !Number.isSafeInteger(planId) || planId < 1) throw Object.assign(new Error('customerId and planId must be positive integers'), { statusCode: 400 });
    if (payload.startDate && !isDateOnly(payload.startDate)) throw Object.assign(new Error('startDate must be a valid YYYY-MM-DD date'), { statusCode: 400 });
    if (payload.expiryDate && (!isDateOnly(payload.expiryDate) || (payload.startDate && payload.expiryDate < payload.startDate))) throw Object.assign(new Error('expiryDate must be a valid date on or after startDate'), { statusCode: 400 });
    return idempotent(req, async (client) => {
      const customer = (await client.query(`SELECT customer_id FROM customers WHERE customer_id=$1 AND is_active=TRUE FOR KEY SHARE`, [customerId])).rows[0];
      if (!customer) throw Object.assign(new Error('Active customer not found'), { statusCode: 404 });
      const plan = (await client.query(`SELECT plan_id,plan_name,price,is_active FROM plans WHERE plan_id=$1`, [planId])).rows[0];
      if (!plan || !plan.is_active) throw Object.assign(new Error('Active plan not found'), { statusCode: 404 });
      const data = await subscriptionRepository.create({
        subscriptionNumber: `SUB-${require('node:crypto').randomUUID()}`,
        customerId, planId, status: 'DRAFT', startDate: payload.startDate,
        expiryDate: payload.expiryDate || null, paymentTermsDays, client,
      });
      await client.query(
        `INSERT INTO subscription_items(subscription_id,description_snapshot,quantity,unit_price,tax_rate_snapshot)
         VALUES($1,$2,1,$3,0)`, [data.subscription_id, plan.plan_name, plan.price]
      );
      await audit(client, user.id, 'created', 'subscription', data.subscription_id, data);
      return { status: 201, body: { success: true, data }, resourceId: data.subscription_id };
    });
  }

  async getSubscriptionById(id, user) {
    const customerId = user.role === 'CUSTOMER' ? user.customerId : null;
    const data = await subscriptionRepository.findById(id, customerId);
    if (!data) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
    return { success: true, data, message: 'Subscription fetched successfully.' };
  }

  async updateSubscription(id, payload = {}, user) {
    if (!['ADMIN', 'STAFF'].includes(user.role)) throw Object.assign(new Error('Only staff can update subscriptions'), { statusCode: 403 });
    const customerId = user.role === 'CUSTOMER' ? user.customerId : null;
    const fields = {};
    if (payload.expiryDate !== undefined) fields.expiry_date = payload.expiryDate;
    if (payload.nextBillingAt !== undefined) fields.next_billing_at = payload.nextBillingAt;
    if (payload.paymentTermsDays !== undefined) {
      const days = Number(payload.paymentTermsDays);
      if (!Number.isInteger(days) || days < 0) throw Object.assign(new Error('paymentTermsDays must be a non-negative integer'), { statusCode: 400 });
      fields.payment_terms_days = days;
    }
    if (fields.expiry_date && !isDateOnly(fields.expiry_date)) throw Object.assign(new Error('expiryDate must be a valid YYYY-MM-DD date'), { statusCode: 400 });
    if (fields.next_billing_at && Number.isNaN(Date.parse(fields.next_billing_at))) throw Object.assign(new Error('nextBillingAt must be a valid timestamp'), { statusCode: 400 });
    if (!Object.keys(fields).length) throw Object.assign(new Error('No editable subscription fields supplied'), { statusCode: 400 });
    const data = await subscriptionRepository.update(id, fields, customerId);
    if (!data) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
    await audit(null, user.id, 'updated', 'subscription', id, data);
    return { success: true, data, message: 'Subscription updated successfully.' };
  }

  async closeSubscription(id, user) {
    const customerId = user.role === 'CUSTOMER' ? user.customerId : null;
    const policy = await subscriptionRepository.findClosurePolicy(id, customerId);
    if (!policy) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
    if (user.role === 'CUSTOMER' && policy.status === 'ACTIVE' && !policy.allow_early_closure) {
      throw Object.assign(new Error('This plan does not allow early closure'), { statusCode: 409 });
    }
    const data = await subscriptionRepository.delete(id, customerId);
    if (!data) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
    await audit(null, user.id, 'closed', 'subscription', id, data);
    return { success: true, data, message: 'Subscription closed successfully.' };
  }

  async pauseSubscription(id, user) {
    const customerId = user.role === 'CUSTOMER' ? user.customerId : null;
    const row = await subscriptionRepository.findPausePolicy(id, customerId);
    if (!row) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
    if (!row.allow_pause) throw Object.assign(new Error('This plan does not allow pausing'), { statusCode: 409 });
    if (!['ACTIVE', 'CONFIRMED'].includes(row.status)) throw Object.assign(new Error('Only confirmed or active subscriptions can be paused'), { statusCode: 409 });
    const data = await subscriptionRepository.update(id, { status: 'PAUSED' }, customerId);
    await audit(null, user.id, 'paused', 'subscription', id, data);
    return { success: true, data, message: 'Subscription paused.' };
  }

  async resumeSubscription(id, user) {
    const customerId = user.role === 'CUSTOMER' ? user.customerId : null;
    const row = await subscriptionRepository.findPausePolicy(id, customerId);
    if (!row) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
    if (row.status !== 'PAUSED') throw Object.assign(new Error('Only paused subscriptions can be resumed'), { statusCode: 409 });
    const data = await subscriptionRepository.update(id, { status: 'ACTIVE' }, customerId);
    await audit(null, user.id, 'resumed', 'subscription', id, data);
    return { success: true, data, message: 'Subscription resumed.' };
  }

  async activateSubscription(id, user) {
    if (!['ADMIN', 'STAFF'].includes(user.role)) throw Object.assign(new Error('Only staff can activate subscriptions'), { statusCode: 403 });
    const data = await subscriptionRepository.activate(id);
    if (!data) throw Object.assign(new Error('Subscription cannot be activated from its current status'), { statusCode: 409 });
    await audit(null, user.id, 'activated', 'subscription', id, data);
    return { success: true, data, message: 'Subscription activated.' };
  }
}

module.exports = new SubscriptionService();

function isDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
