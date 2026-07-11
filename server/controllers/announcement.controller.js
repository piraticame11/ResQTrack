const db = require('../config/db');

exports.getAnnouncements = async (req, res) => {
  try {
    const isAdmin = req.user && req.user.role === 'admin';
    let q = `SELECT a.*, u.full_name AS author
             FROM announcements a LEFT JOIN users u ON a.admin_id = u.id`;
    if (!isAdmin) q += ' WHERE a.is_published = 1';
    q += ' ORDER BY a.published_at DESC';
    const [rows] = await db.query(q);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const { title, body, is_published, scheduled_at } = req.body;
    const pub = is_published ? 1 : 0;
    const schedule = !pub && scheduled_at ? new Date(scheduled_at) : null;
    const [result] = await db.query(
      'INSERT INTO announcements (admin_id, title, body, is_published, scheduled_at, published_at) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, title, body, pub, schedule, pub ? new Date() : null]
    );
    res.status(201).json({ message: 'Announcement created', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateAnnouncement = async (req, res) => {
  try {
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
    params.push(req.params.id);
    await db.query(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Announcement updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    await db.query('DELETE FROM announcements WHERE id = ?', [req.params.id]);
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getEmergencyContacts = async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM emergency_contacts ORDER BY label');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createEmergencyContact = async (req, res) => {
  try {
    const { label, phone } = req.body;
    const [result] = await db.query(
      'INSERT INTO emergency_contacts (label, phone, updated_by) VALUES (?, ?, ?)',
      [label, phone, req.user.id]
    );
    res.status(201).json({ message: 'Contact created', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateEmergencyContact = async (req, res) => {
  try {
    const { label, phone } = req.body;
    await db.query(
      'UPDATE emergency_contacts SET label = ?, phone = ?, updated_by = ? WHERE id = ?',
      [label, phone, req.user.id, req.params.id]
    );
    res.json({ message: 'Contact updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
