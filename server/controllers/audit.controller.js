const db = require('../config/db');

exports.getAuditLogs = async (req, res) => {
  try {
    const { search, action } = req.query;
    let q = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    if (action) { q += ' AND action = ?'; params.push(action); }
    if (search) {
      q += ' AND (actor_name LIKE ? OR details LIKE ? OR ip_address LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    q += ' ORDER BY logged_at DESC LIMIT 500';
    const [rows] = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
