const db = require('../config/db');

// Fire-and-forget audit logger. Never throws — a logging failure must not
// break the action it's recording.
async function logAudit({ actor_id = null, actor_name = null, action, details = null, ip_address = null, version = null }) {
  try {
    let finalVersion = version;
    if (!finalVersion && actor_id) {
      const [[u]] = await db.query('SELECT version FROM users WHERE id = ?', [actor_id]);
      if (u) finalVersion = u.version;
    }
    finalVersion = finalVersion || 'manay';

    await db.query(
      'INSERT INTO audit_logs (actor_id, actor_name, action, details, ip_address, version) VALUES (?, ?, ?, ?, ?, ?)',
      [actor_id, actor_name, action, details, ip_address, finalVersion]
    );
  } catch (err) {
    console.error('[Audit] Failed to write log:', err.message);
  }
}

module.exports = { logAudit };
