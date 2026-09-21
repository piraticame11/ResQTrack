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

// Every 2 minutes: check for incidents in 'Initiate' status without update for >= 1 hour
const staleInitiateNotified = new Map();

cron.schedule('*/2 * * * *', async () => {
  try {
    const [staleList] = await db.query(`
      SELECT i.id, i.reference_no, i.incident_type, p.name AS purok_name,
             TIMESTAMPDIFF(MINUTE, i.updated_at, NOW()) AS elapsed_minutes
      FROM incidents i
      LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE i.status = 'Initiate'
        AND TIMESTAMPDIFF(MINUTE, i.updated_at, NOW()) >= 60
    `);

    if (staleList.length && global.__resqtrack_io) {
      const now = Date.now();
      for (const inc of staleList) {
        const lastNotif = staleInitiateNotified.get(inc.id) || 0;
        // Notify once every 60 minutes
        if (now - lastNotif >= 60 * 60 * 1000) {
          staleInitiateNotified.set(inc.id, now);
          global.__resqtrack_io.emit('incident:stale_initiate', {
            id: inc.id,
            reference_no: inc.reference_no,
            incident_type: inc.incident_type,
            purok_name: inc.purok_name || 'Barangay Manay',
            elapsed_minutes: inc.elapsed_minutes,
          });
          console.log(`[Initiate Monitor] Emitted stale initiate alert for incident ${inc.reference_no} (${inc.elapsed_minutes} min overdue)`);
        }
      }
    }
  } catch (err) {
    console.error('[Initiate Monitor] Error checking stale initiate incidents:', err.message);
  }
});

console.log('[Scheduler] Stale initiate monitor scheduled (every 2 minutes)');
