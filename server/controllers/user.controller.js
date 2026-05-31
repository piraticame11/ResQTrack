const bcrypt = require('bcrypt');
const path   = require('path');
const fs     = require('fs');
const db     = require('../config/db');

exports.getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, full_name, email, phone, role, profile_photo, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { full_name, phone, current_password, new_password } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const user = rows[0];
    const updates = {};

    if (full_name && full_name.trim()) updates.full_name = full_name.trim();
    if (phone !== undefined) updates.phone = phone || null;

    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ message: 'Current password is required to set a new password' });
      }
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });
      updates.password_hash = await bcrypt.hash(new_password, 10);
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'No changes provided' });
    }

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.user.id];
    await db.query(`UPDATE users SET ${fields} WHERE id = ?`, values);

    const [updated] = await db.query(
      'SELECT id, full_name, email, phone, role, profile_photo FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ message: 'Profile updated successfully', user: updated[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updatePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const [rows] = await db.query('SELECT profile_photo FROM users WHERE id = ?', [req.user.id]);
    if (rows[0]?.profile_photo) {
      const oldPath = path.join(__dirname, '../uploads', path.basename(rows[0].profile_photo));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const photoUrl = `/uploads/${req.file.filename}`;
    await db.query('UPDATE users SET profile_photo = ? WHERE id = ?', [photoUrl, req.user.id]);
    res.json({ message: 'Photo updated', profile_photo: photoUrl });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
