const db = require('../config/database');

class DbBootstrapService {
  async ensureSchema() {
    const sql = require('fs').readFileSync(require('path').join(__dirname, '../../database/schema.sql'), 'utf8');
    await db.query(sql);
    return { success: true, message: 'Database schema checked and initialized successfully.' };
  }
}

module.exports = new DbBootstrapService();
