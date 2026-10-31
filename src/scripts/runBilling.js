require('../config/env');
const platformService = require('../services/platformService');
platformService.runBilling({ id: null, role: 'ADMIN' })
  .then((result) => { console.log(JSON.stringify(result)); process.exitCode = result.failedCount ? 1 : 0; })
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => require('../config/database').pool.end());
