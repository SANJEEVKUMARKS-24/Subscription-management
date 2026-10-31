const planRepository = require('../repositories/planRepository');

class PlanService {
  async listPlans(query = {}) {
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
    const offset = Math.max(Number.parseInt(query.offset, 10) || 0, 0);
    const rows = await planRepository.findAll(limit, offset);
    return { success: true, data: rows, meta: { limit, offset }, message: 'Plans listed successfully.' };
  }

  async getPlan(id) {
    const data = await planRepository.findById(id);
    if (!data) throw Object.assign(new Error('Plan not found'), { statusCode: 404 });
    return { success: true, data };
  }

  async createPlan(payload) {
    const { name, description = null, price, billingFrequency, minimumQuantity = 1 } = payload || {};
    const frequency = String(billingFrequency || '').toUpperCase();
    if (!name || !Number.isFinite(Number(price)) || Number(price) < 0 || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(frequency)) {
      throw Object.assign(new Error('name, non-negative price and valid billingFrequency are required'), { statusCode: 400 });
    }
    if (!Number.isInteger(Number(minimumQuantity)) || Number(minimumQuantity) < 1) {
      throw Object.assign(new Error('minimumQuantity must be a positive integer'), { statusCode: 400 });
    }
    const data = await planRepository.create({
      name: String(name).trim(), description, basePrice: Number(price),
      billingFrequency: frequency, minimumQuantity: Number(minimumQuantity),
    });
    return { success: true, data, message: 'Plan created successfully.' };
  }

  async updatePlan(id, payload, user) {
    if (!['ADMIN', 'STAFF'].includes(user.role)) throw Object.assign(new Error('Only staff can manage plans'), { statusCode: 403 });
    if (payload.price !== undefined) payload.price = moneyAmount(payload.price);
    if (payload.billingFrequency !== undefined) {
      payload.billingFrequency = String(payload.billingFrequency).toUpperCase();
      if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(payload.billingFrequency)) throw Object.assign(new Error('billingFrequency must be daily, weekly, monthly or yearly'), { statusCode: 400 });
    }
    const data = await planRepository.update(id, payload);
    if (!data) throw Object.assign(new Error('Plan not found or no editable fields supplied'), { statusCode: 404 });
    return { success: true, data };
  }

  async archivePlan(id, user) {
    if (!['ADMIN', 'STAFF'].includes(user.role)) throw Object.assign(new Error('Only staff can manage plans'), { statusCode: 403 });
    const data = await planRepository.archive(id);
    if (!data) throw Object.assign(new Error('Plan not found'), { statusCode: 404 });
    return { success: true, data };
  }

  async replacePlanItems(id, items, user) {
    if (!['ADMIN', 'STAFF'].includes(user.role)) throw Object.assign(new Error('Only staff can manage plans'), { statusCode: 403 });
    if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('items must be a non-empty array'), { statusCode: 400 });
    for (const item of items) {
      if (!Number.isSafeInteger(Number(item.productId)) || Number(item.productId) < 1 || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1) throw Object.assign(new Error('Each item needs a positive productId, positive quantity and non-negative unitPrice'), { statusCode: 400 });
      if (item.variantId !== undefined && item.variantId !== null && (!Number.isSafeInteger(Number(item.variantId)) || Number(item.variantId) < 1)) throw Object.assign(new Error('variantId must be a positive integer'), { statusCode: 400 });
      item.unitPrice = moneyAmount(item.unitPrice);
    }
    const data = await planRepository.replaceItems(id, items);
    return { success: true, data };
  }
}

function moneyAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.abs(Math.round(n * 100) - n * 100) > 1e-7) throw Object.assign(new Error('price must be a non-negative amount with at most two decimals'), { statusCode: 400 });
  return n;
}

module.exports = new PlanService();
