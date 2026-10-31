const migrationService = require('./migrationService');

class DbBootstrapService {
  async ensureSchema() {
    const applied = await migrationService.migrate();
    return { success: true, applied, message: 'Database migrations completed successfully.' };
  }
}

module.exports = new DbBootstrapService();
