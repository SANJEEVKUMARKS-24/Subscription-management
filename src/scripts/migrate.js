require('../config/env');
const migrationService = require('../services/migrationService');
const db = require('../config/database');

migrationService.migrate()
  .then((applied) => {
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());
