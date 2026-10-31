require('dotenv').config();
const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const Stripe = require('stripe');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('Set TEST_DATABASE_URL to a dedicated empty database whose name contains "test".');
const parsedTestUrl = new URL(testDatabaseUrl);
if (!/(^|[-_])test($|[-_])/i.test(parsedTestUrl.pathname.slice(1))) {
  throw new Error('Refusing to run integration tests: TEST_DATABASE_URL database name must contain "test".');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-change-before-production';
process.env.STRIPE_SECRET_KEY = 'sk_test_integration_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_integration_mock';

const app = require('../src/server');
const db = require('../src/config/database');
const migrationService = require('../src/services/migrationService');
const stripeProvider = require('../src/services/stripeProvider');
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const adminEmail = `admin-${suffix}@example.invalid`;
const adminPassword = 'Integration-Admin-Password-2026!';
const customerPassword = 'Integration-Customer-Password-2026!';
const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
let adminToken;
let customerToken;
let secondCustomerToken;
let customerId;
let secondCustomerId;
let productId;
let planId;

stripeProvider.createCheckoutSession = async () => ({ id: `cs_test_${suffix}`, url: 'https://checkout.stripe.test/session' });
stripeProvider.createRefund = async () => ({ id: `re_test_${suffix}`, status: 'pending' });

test('PDF acceptance workflows', { timeout: 30_000 }, async (t) => {
  await migrationService.migrate();
  const adminHash = await bcrypt.hash(adminPassword, 10);
  await db.query(
    `INSERT INTO users(customer_id,full_name,email,password_hash,role,is_active)
     VALUES(NULL,'Integration Admin',$1,$2,'ADMIN',TRUE)`, [adminEmail, adminHash]
  );

  await t.test('authentication, protected routes, and role authorization', async () => {
    assert.equal((await request(app).get('/api/v1/products')).status, 401);
    const login = await request(app).post('/api/v1/login').send({ email: adminEmail, password: 'wrong-password' });
    assert.equal(login.status, 401);
    const success = await request(app).post('/api/v1/login').send({ email: adminEmail, password: adminPassword });
    assert.equal(success.status, 200);
    adminToken = success.body.data.token;
    assert.equal((await request(app).get('/api/v1/products/0').set('Authorization', `Bearer ${adminToken}`)).status, 400);
  });

  await t.test('tenant registration and isolation', async () => {
    const first = await request(app).post('/api/v1/register').send({ companyName: `Tenant One ${suffix}`, fullName: 'Customer One', email: `customer1-${suffix}@example.invalid`, password: customerPassword });
    const second = await request(app).post('/api/v1/register').send({ companyName: `Tenant Two ${suffix}`, fullName: 'Customer Two', email: `customer2-${suffix}@example.invalid`, password: customerPassword });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    customerId = first.body.data.user.customer_id;
    secondCustomerId = second.body.data.user.customer_id;
    customerToken = first.body.data.token;
    secondCustomerToken = second.body.data.token;
    assert.equal((await request(app).post('/api/v1/discounts').set('Authorization', `Bearer ${customerToken}`).send({ name: 'Nope', type: 'FIXED', value: 1, startsAt: new Date().toISOString() })).status, 403);
  });

  await t.test('catalog validation, plan transactions, quotation confirmation and tenant scope', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const product = await request(app).post('/api/v1/products').set(auth).send({ name: `Test Product ${suffix}`, productType: 'service', salesPrice: 20, costPrice: 5 });
    assert.equal(product.status, 201);
    productId = product.body.data.product_id;
    const variant = await request(app).post(`/api/v1/products/${productId}/variants`).set(auth).send({ name: 'Annual', additionalPrice: 2 });
    assert.equal(variant.status, 201);
    const plan = await request(app).post('/api/v1/plans').set(auth).send({ name: `Test Plan ${suffix}`, price: 100, billingFrequency: 'MONTHLY' });
    assert.equal(plan.status, 201);
    planId = plan.body.data.plan_id;
    await request(app).patch(`/api/v1/plans/${planId}`).set(auth).send({ allowRenewal: true, allowPause: true, allowEarlyClosure: true }).expect(200);
    await request(app).put(`/api/v1/plans/${planId}/items`).set(auth).send({ items: [{ productId, variantId: variant.body.data.variant_id, quantity: 1, unitPrice: 100 }] }).expect(200);
    const badReplace = await request(app).put(`/api/v1/plans/${planId}/items`).set(auth).send({ items: [{ productId: 99999999, quantity: 1, unitPrice: 1 }] });
    assert.equal(badReplace.status, 400);
    const planAfterFailure = await request(app).get(`/api/v1/plans/${planId}`).set(auth);
    assert.equal(planAfterFailure.body.data.items.length, 1);
    const date = new Date().toISOString().slice(0, 10);
    const quote = await request(app).post('/api/v1/quotations').set(auth).set('Idempotency-Key', `quote-${suffix}`).send({ customerId, issueDate: date, validUntil: date, items: [{ productId, quantity: 1, unitPrice: 20, taxRate: 10 }, { planId, quantity: 1, unitPrice: 100 }] });
    assert.equal(quote.status, 201);
    assert.equal(Number(quote.body.data.total_amount), 122);
    await request(app).post(`/api/v1/quotations/${quote.body.data.quotation_id}/send`).set(auth).expect(200);
    const confirmPath = `/api/v1/quotations/${quote.body.data.quotation_id}/confirm`;
    const accept = await request(app).post(confirmPath).set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `accept-${suffix}`).send({});
    const retry = await request(app).post(confirmPath).set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `accept-${suffix}`).send({});
    assert.equal(accept.status, 201);
    assert.equal(retry.body.data.subscription_id, accept.body.data.subscription_id);
    assert.equal((await request(app).get(`/api/v1/quotations/${quote.body.data.quotation_id}`).set('Authorization', `Bearer ${secondCustomerToken}`)).status, 404);
  });

  await t.test('invoice idempotency, Stripe Checkout and signed duplicate webhook', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const list = await request(app).get('/api/v1/subscriptions').set(auth);
    const subscription = list.body.data.find((row) => Number(row.customer_id) === Number(customerId));
    assert.ok(subscription);
    const date = new Date().toISOString().slice(0, 10);
    const invoicePath = `/api/v1/subscriptions/${subscription.subscription_id}/invoices`;
    const invoiceBody = { billingPeriodStart: date, dueDate: date };
    const [one, two] = await Promise.all([
      request(app).post(invoicePath).set(auth).set('Idempotency-Key', `invoice-a-${suffix}`).send(invoiceBody),
      request(app).post(invoicePath).set(auth).set('Idempotency-Key', `invoice-b-${suffix}`).send(invoiceBody),
    ]);
    assert.ok([200, 201].includes(one.status));
    assert.ok([200, 201].includes(two.status));
    assert.equal(one.body.data.invoice_id, two.body.data.invoice_id);
    const invoiceId = one.body.data.invoice_id;
    const checkout = await request(app).post(`/api/v1/invoices/${invoiceId}/checkout`).set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `checkout-${suffix}`).send({});
    assert.equal(checkout.status, 201);
    assert.equal(checkout.body.data.checkoutUrl, 'https://checkout.stripe.test/session');
    const amountMinor = Math.round(Number(checkout.body.data.payment.amount) * 100);
    const event = { id: `evt_test_${suffix}`, object: 'event', type: 'checkout.session.completed', data: { object: { id: `cs_test_${suffix}`, payment_status: 'paid', amount_total: amountMinor, currency: 'usd', payment_intent: `pi_test_${suffix}` } } };
    const raw = JSON.stringify(event);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: stripeSecret });
    const webhook = () => request(app).post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(raw);
    const applied = await webhook();
    const duplicate = await webhook();
    assert.equal(applied.status, 200);
    assert.equal(duplicate.body.duplicate, true);
    const invoice = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(invoice.body.data.status, 'PAID');

    const payments = await request(app).get(`/api/v1/invoices/${invoiceId}/payments`).set('Authorization', `Bearer ${customerToken}`);
    const refund = await request(app).post(`/api/v1/payments/${payments.body.data[0].payment_id}/refunds`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `refund-${suffix}`)
      .send({ amount: 25, reason: 'Integration verification' });
    assert.equal(refund.status, 201);
    assert.equal(refund.body.data.provider_refund_id, `re_test_${suffix}`);

    const refundEvent = {
      id: `evt_refund_${suffix}`,
      object: 'event',
      type: 'refund.updated',
      data: { object: { id: `re_test_${suffix}`, status: 'succeeded' } },
    };
    const refundRaw = JSON.stringify(refundEvent);
    const refundSignature = stripe.webhooks.generateTestHeaderString({ payload: refundRaw, secret: stripeSecret });
    const refundWebhook = await request(app).post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', refundSignature)
      .send(refundRaw);
    assert.equal(refundWebhook.status, 200);
    const afterRefund = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(afterRefund.body.data.status, 'PARTIALLY_PAID');
  });

  await t.test('one-time reset token and session invalidation', async () => {
    const oldToken = secondCustomerToken;
    const email = `customer2-${suffix}@example.invalid`;
    const reset = await request(app).post('/api/v1/password-reset/request').send({ email });
    assert.equal(reset.status, 202);
    const token = new URL(reset.body.developmentResetUrl).searchParams.get('token');
    await request(app).post('/api/v1/password-reset/confirm').send({ token, password: 'Updated-Customer-Password-2026!' }).expect(200);
    await request(app).post('/api/v1/password-reset/confirm').send({ token, password: 'Another-Customer-Password-2026!' }).expect(400);
    assert.equal((await request(app).get('/api/v1/plans').set('Authorization', `Bearer ${oldToken}`)).status, 401);
  });
});

test.after(async () => {
  await db.pool.end();
});
