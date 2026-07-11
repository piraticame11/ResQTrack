const db = require('../config/db');

// Fire-and-forget audit logger. Never throws — a logging failure must not
// break the action it's recording.
async function logAudit({ actor_id = null, actor_name = null, action, details = null, ip_address = null }) {
  try {
    await db.query(
      'INSERT INTO audit_logs (actor_id, actor_name, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
      [actor_id, actor_name, action, details, ip_address]
    );
  } catch (err) {
    console.error('[Audit] Failed to write log:', err.message);
  }
}

module.exports = { logAudit };
