const db = require('../config/db');

exports.getAnnouncements = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const isAdmin = req.user && req.user.role === 'admin';
    let q = `SELECT a.*, u.full_name AS author
             FROM announcements a LEFT JOIN users u ON a.admin_id = u.id
             WHERE a.version = ?`;
    const params = [version];
    if (!isAdmin) q += ' AND a.is_published = 1';
    q += ' ORDER BY a.published_at DESC';
    const [rows] = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const { title, body, is_published, scheduled_at } = req.body;
    const pub = is_published ? 1 : 0;
    const schedule = !pub && scheduled_at ? new Date(scheduled_at) : null;
    const [result] = await db.query(
      'INSERT INTO announcements (admin_id, title, body, is_published, scheduled_at, published_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, title, body, pub, schedule, pub ? new Date() : null, version]
    );
    res.status(201).json({ message: 'Announcement created', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateAnnouncement = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const { title, body, is_published, scheduled_at } = req.body;
    const updates = [], params = [];
    if (title       !== undefined) { updates.push('title = ?');        params.push(title); }
    if (body        !== undefined) { updates.push('body = ?');         params.push(body); }
    if (is_published !== undefined) {
      updates.push('is_published = ?'); params.push(is_published ? 1 : 0);
      if (is_published) {
        updates.push('published_at = ?'); params.push(new Date());
        updates.push('scheduled_at = NULL');
      }
    }
    if (scheduled_at !== undefined && !is_published) {
      updates.push('scheduled_at = ?'); params.push(scheduled_at || null);
    }
    if (!updates.length) return res.status(400).json({ message: 'No fields to update' });
    params.push(req.params.id, version);
    const [result] = await db.query(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ? AND version = ?`, params);
    if (!result.affectedRows) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ message: 'Announcement updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const [result] = await db.query('DELETE FROM announcements WHERE id = ? AND version = ?', [req.params.id, version]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getEmergencyContacts = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const [rows] = await db.query('SELECT * FROM emergency_contacts WHERE version = ? ORDER BY label', [version]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createEmergencyContact = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const { label, phone } = req.body;
    const [result] = await db.query(
      'INSERT INTO emergency_contacts (label, phone, updated_by, version) VALUES (?, ?, ?, ?)',
      [label, phone, req.user.id, version]
    );
    res.status(201).json({ message: 'Contact created', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateEmergencyContact = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const { label, phone } = req.body;
    const [result] = await db.query(
      'UPDATE emergency_contacts SET label = ?, phone = ?, updated_by = ? WHERE id = ? AND version = ?',
      [label, phone, req.user.id, req.params.id, version]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Contact not found' });
    res.json({ message: 'Contact updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.deleteEmergencyContact = async (req, res) => {
  try {
    const version = req.user?.version || req.tenantVersion || 'manay';
    const [result] = await db.query('DELETE FROM emergency_contacts WHERE id = ? AND version = ?', [req.params.id, version]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

