const { Pool } = require('pg');
const fs = require('node:fs');

const databaseSsl = process.env.NODE_ENV === 'production'
  ? {
    rejectUnauthorized: true,
    ...(process.env.DB_SSL_CA ? { ca: fs.readFileSync(process.env.DB_SSL_CA, 'utf8') } : {}),
  }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: databaseSsl,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  healthCheck: async () => {
    await pool.query('SELECT 1');
    return true;
  },
  pool,
};
