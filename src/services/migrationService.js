const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('../config/database');

const migrationDirectory = path.join(__dirname, '../../database/migrations');

class MigrationService {
  async migrate() {
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const baseline = await db.query(`SELECT to_regclass('public.users') AS users_table`);
    const applied = await db.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(applied.rows.map((row) => row.version));
    if (baseline.rows[0].users_table && !appliedSet.has('001_schema.sql')) {
      await db.query('INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING', ['001_schema.sql']);
      appliedSet.add('001_schema.sql');
    }

    const files = (await fs.readdir(migrationDirectory))
      .filter((file) => /^\d+_.+\.sql$/.test(file) && !file.includes('_seed.'))
      .sort();
    const newlyApplied = [];
    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(await fs.readFile(path.join(migrationDirectory, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        newlyApplied.push(file);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw Object.assign(new Error(`Migration ${file} failed: ${error.message}`), { cause: error });
      } finally {
        client.release();
      }
    }
    return newlyApplied;
  }
}

module.exports = new MigrationService();
