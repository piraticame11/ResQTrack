const bcrypt = require('bcrypt');
const db     = require('../config/db');

exports.getUsers = async (req, res) => {
  try {
    const { role, purok_id } = req.query;
    let q = `SELECT u.id, u.full_name, u.email, u.phone, u.birthdate, u.role, u.purok_id,
                    u.id_image, u.is_verified, u.is_active, u.created_at, p.name AS purok_name
             FROM users u
             LEFT JOIN puroks p ON u.purok_id = p.id
             WHERE 1=1`;
    const params = [];
    if (role)     { q += ' AND u.role = ?';     params.push(role); }
    if (purok_id) { q += ' AND u.purok_id = ?'; params.push(purok_id); }
    q += ' ORDER BY u.created_at DESC';
    const [rows] = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.birthdate, u.role, u.purok_id,
              u.id_image, u.is_verified, u.is_active, u.created_at, p.name AS purok_name
       FROM users u LEFT JOIN puroks p ON u.purok_id = p.id WHERE u.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { full_name, email, password, phone, role, purok_id } = req.body;
    if (!['responder', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role must be responder or admin' });
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active) VALUES (?, ?, ?, ?, ?, ?, 1, 1)',
      [full_name, email, hash, phone || null, role, purok_id || null]
    );
    res.status(201).json({ message: 'User created', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists' });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { full_name, email, phone, role, purok_id, is_active, password } = req.body;
    const updates = [], params = [];
    if (full_name   !== undefined) { updates.push('full_name = ?');     params.push(full_name); }
    if (email       !== undefined) { updates.push('email = ?');         params.push(email); }
    if (phone       !== undefined) { updates.push('phone = ?');         params.push(phone); }
    if (role        !== undefined) { updates.push('role = ?');          params.push(role); }
    if (purok_id    !== undefined) { updates.push('purok_id = ?');      params.push(purok_id); }
    if (is_active   !== undefined) { updates.push('is_active = ?');     params.push(is_active ? 1 : 0); }
    if (password)                  { updates.push('password_hash = ?'); params.push(await bcrypt.hash(password, 10)); }
    if (!updates.length) return res.status(400).json({ message: 'No fields to update' });
    params.push(req.params.id);
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.verifyUser = async (req, res) => {
  try {
    await db.query('UPDATE users SET is_verified = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'User verified' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
