require('../config/env');
const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('../config/database');

async function seedDemoPresentation() {
  const ownerName = String(process.env.DEMO_OWNER_NAME || '').trim();
  if (!ownerName) throw new Error('Set DEMO_OWNER_NAME to the full name of the customer account to seed.');

  const matches = await db.query(
    `SELECT DISTINCT customer_id FROM users
     WHERE role='CUSTOMER' AND is_active=TRUE AND customer_id IS NOT NULL
       AND lower(trim(full_name))=lower($1)`,
    [ownerName]
  );
  if (matches.rowCount !== 1) {
    throw new Error(`Expected exactly one active customer account named "${ownerName}"; found ${matches.rowCount}.`);
  }

  const customerId = Number(matches.rows[0].customer_id);
  const seedPath = path.join(__dirname, '../../database/seeds/demo_presentation.sql');
  const seedSql = (await fs.readFile(seedPath, 'utf8')).replaceAll('__DEMO_CUSTOMER_ID__', String(customerId));
  if (seedSql.includes('__DEMO_CUSTOMER_ID__')) throw new Error('Demo seed has an unresolved customer ID placeholder.');

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(seedSql);
    await client.query('COMMIT');
    const counts = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM customers WHERE email LIKE '%@demo.example') AS demo_customers,
         (SELECT COUNT(*)::int FROM subscriptions WHERE customer_id=$1 AND subscription_number LIKE 'DEMO-MF-%') AS demo_subscriptions,
         (SELECT COUNT(*)::int FROM invoices WHERE customer_id=$1 AND invoice_number LIKE 'DEMO-INV-MF-%') AS demo_invoices`,
      [customerId]
    );
    console.log(`Demo presentation data is ready for customer ${customerId}: ${counts.rows[0].demo_customers} demo customers, ${counts.rows[0].demo_subscriptions} subscriptions, ${counts.rows[0].demo_invoices} invoices.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

seedDemoPresentation()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
