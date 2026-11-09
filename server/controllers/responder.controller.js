const db = require('../config/db');

exports.getLocations = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const [rows] = await db.query(`
      SELECT rl.*, u.full_name AS responder_name
      FROM responder_locations rl
      JOIN users u ON rl.responder_id = u.id
      WHERE u.is_active = 1 AND u.role = 'responder' AND u.version = ?`, [version]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const responder_id = req.user.id;
    const version = req.user?.version || req.tenantVersion || 'manay';

    await db.query(
      `INSERT INTO responder_locations (responder_id, latitude, longitude)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), updated_at = CURRENT_TIMESTAMP`,
      [responder_id, latitude, longitude]
    );

    const io = req.app.get('io');
    if (io) {
      const payload = { responder_id, latitude, longitude, name: req.user.name, version };
      io.to(`barangay:${version}`).emit('responder:location_update', payload);
      io.emit('responder:location_update', payload);
    }

    res.json({ message: 'Location updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const [rows] = await db.query(`
      SELECT DISTINCT i.*, p.name AS purok_name
      FROM incidents i
      LEFT JOIN puroks p ON i.purok_id = p.id
      LEFT JOIN incident_responders ir ON ir.incident_id = i.id
      WHERE (i.assigned_responder_id = ? OR ir.responder_id = ?)
        AND i.version = ?
      ORDER BY i.reported_at DESC`, [req.params.id, req.params.id, version]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
