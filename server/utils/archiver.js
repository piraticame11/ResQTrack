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

// Every minute: auto-publish announcements whose scheduled time has arrived
cron.schedule('* * * * *', async () => {
  try {
    const [result] = await db.query(`
      UPDATE announcements
      SET is_published = 1, published_at = NOW(), scheduled_at = NULL
      WHERE is_published = 0 AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()`);
    if (result.affectedRows > 0) {
      console.log(`[Scheduler] Auto-published ${result.affectedRows} scheduled announcement(s)`);
    }
  } catch (err) {
    console.error('[Scheduler] Error auto-publishing announcements:', err.message);
  }
});

console.log('[Scheduler] Announcement auto-publish scheduled (every minute)');
