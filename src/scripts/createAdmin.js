require('../config/env');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function createAdmin() {
  const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (at least 12 characters) in the environment.');
  }
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const result = await db.query(
    `INSERT INTO users(customer_id, full_name, email, password_hash, role, is_active)
     VALUES(NULL,$1,$2,$3,'ADMIN',TRUE) ON CONFLICT(email) DO NOTHING RETURNING user_id,email`,
    [ADMIN_NAME.trim(), ADMIN_EMAIL.trim().toLowerCase(), hash]
  );
  if (!result.rowCount) throw new Error('An account with that email already exists.');
  console.log(`Created admin user ${result.rows[0].email}.`);
}

createAdmin().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.pool.end());
