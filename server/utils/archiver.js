const cron = require('node-cron');
const db   = require('../config/db');

// Every night at midnight: archive resolved incidents older than 30 days
cron.schedule('0 0 * * *', async () => {
  try {
    const [result] = await db.query(`
      UPDATE incidents
      SET status = 'Archived', archived_at = NOW()
      WHERE status = 'Resolved'
        AND resolved_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`);
    if (result.affectedRows > 0) {
      console.log(`[Archiver] Auto-archived ${result.affectedRows} resolved incident(s)`);
    }
  } catch (err) {
    console.error('[Archiver] Error during auto-archiving:', err.message);
  }
});

console.log('[Archiver] Nightly auto-archiver scheduled (00:00 daily)');
