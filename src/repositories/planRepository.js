const db = require('../config/database');

class PlanRepository {
  async findAll(limit = 20, offset = 0) {
    const result = await db.query(`SELECT * FROM plans WHERE is_active = TRUE ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    return result.rows;
  }

  async findById(id) {
    const result = await db.query(`SELECT * FROM plans WHERE plan_id=$1 AND is_active=TRUE`, [id]);
    const plan = result.rows[0];
    if (!plan) return null;
    plan.items = (await db.query(`SELECT * FROM plan_items WHERE plan_id=$1 ORDER BY plan_item_id`, [id])).rows;
    return plan;
  }

  async create({ name, description, basePrice, billingFrequency, minimumQuantity }) {
    const result = await db.query(
      `INSERT INTO plans (plan_name, description, price, billing_frequency, minimum_quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, basePrice, billingFrequency, minimumQuantity]
    );

    return result.rows[0];
  }

  async update(id, fields) {
    const columns = { name: 'plan_name', description: 'description', price: 'price', billingFrequency: 'billing_frequency', minimumQuantity: 'minimum_quantity', allowPause: 'allow_pause', allowRenewal: 'allow_renewal', allowEarlyClosure: 'allow_early_closure', autoClose: 'auto_close' };
    const entries = Object.entries(fields).filter(([key]) => columns[key]);
    if (!entries.length) return null;
    const values = [id];
    const set = entries.map(([key, value]) => { values.push(value); return `${columns[key]}=$${values.length}`; });
    const result = await db.query(`UPDATE plans SET ${set.join(', ')}, updated_at=NOW() WHERE plan_id=$1 AND is_active=TRUE RETURNING *`, values);
    return result.rows[0] || null;
  }

  async archive(id) {
    const result = await db.query(`UPDATE plans SET is_active=FALSE, updated_at=NOW() WHERE plan_id=$1 AND is_active=TRUE RETURNING *`, [id]);
    return result.rows[0] || null;
  }

  async replaceItems(id, items) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const plan = (await client.query(`SELECT plan_id FROM plans WHERE plan_id=$1 AND is_active=TRUE FOR UPDATE`, [id])).rows[0];
      if (!plan) throw Object.assign(new Error('Plan not found'), { statusCode: 404 });
      for (const item of items) {
        const product = (await client.query(`SELECT is_active FROM products WHERE product_id=$1 FOR KEY SHARE`, [item.productId])).rows[0];
        if (!product?.is_active) throw Object.assign(new Error(`Active product ${item.productId} not found`), { statusCode: 400 });
        if (item.variantId) {
          const variant = (await client.query(`SELECT is_active FROM product_variants WHERE variant_id=$1 AND product_id=$2 FOR KEY SHARE`, [item.variantId, item.productId])).rows[0];
          if (!variant?.is_active) throw Object.assign(new Error(`Active variant ${item.variantId} does not belong to product ${item.productId}`), { statusCode: 400 });
        }
      }
      await client.query(`DELETE FROM plan_items WHERE plan_id=$1`, [id]);
      for (const item of items) {
        await client.query(`INSERT INTO plan_items(plan_id,product_id,variant_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)`, [id, item.productId, item.variantId || null, item.quantity, item.unitPrice]);
      }
      await client.query('COMMIT');
      return items;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
}

module.exports = new PlanRepository();
