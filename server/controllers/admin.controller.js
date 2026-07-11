const bcrypt = require('bcrypt');
const db     = require('../config/db');
const { sendVerificationEmail } = require('../utils/mailer');
const { logAudit } = require('../utils/audit');

async function isLastActiveAdmin(userId) {
  const [[target]] = await db.query('SELECT role, is_active FROM users WHERE id = ?', [userId]);
  if (!target || target.role !== 'admin' || !target.is_active) return false;
  const [[{ count }]] = await db.query(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1"
  );
  return count <= 1;
}

exports.getUsers = async (req, res) => {
  try {
    const { role, purok_id } = req.query;
    let q = `SELECT u.id, u.full_name, u.email, u.phone, u.birthdate, u.role, u.purok_id,
                    u.address_line, u.residency_type, u.landlord_name, u.landlord_contact,
                    u.id_image, u.is_verified, u.verification_status, u.verification_note,
                    u.is_active, u.fake_report_count, u.created_at, p.name AS purok_name
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

// Households can legitimately share a surname (parent/child, siblings), so this
// only ever flags matches for the admin's manual review — it never blocks
// registration or verification on its own.
async function findSurnameMatches(id, full_name) {
  const surname = (full_name || '').split(',')[0].trim();
  if (!surname) return [];
  const [rows] = await db.query(
    `SELECT u.id, u.full_name, u.address_line, u.is_verified, u.verification_status, p.name AS purok_name
     FROM users u LEFT JOIN puroks p ON u.purok_id = p.id
     WHERE u.id != ? AND u.role = 'resident' AND TRIM(SUBSTRING_INDEX(u.full_name, ',', 1)) = ?`,
    [id, surname]
  );
  return rows;
}

exports.getUserById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.birthdate, u.role, u.purok_id,
              u.address_line, u.residency_type, u.landlord_name, u.landlord_contact,
              u.id_image, u.is_verified, u.verification_status, u.verification_note,
              u.is_active, u.fake_report_count, u.created_at, p.name AS purok_name
       FROM users u LEFT JOIN puroks p ON u.purok_id = p.id WHERE u.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const user = rows[0];
    user.duplicate_matches = user.role === 'resident'
      ? await findSurnameMatches(user.id, user.full_name)
      : [];

    res.json(user);
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

    logAudit({
      actor_id: req.user.id, actor_name: req.user.name, action: `Created ${role} account`,
      details: `${full_name} <${email}>`, ip_address: req.ip,
    });

    res.status(201).json({ message: 'User created', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists' });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { full_name, email, phone, role, purok_id, is_active, password } = req.body;

    const demotingAdmin  = role !== undefined && role !== 'admin';
    const deactivating   = is_active !== undefined && !is_active;
    if (demotingAdmin || deactivating) {
      if (await isLastActiveAdmin(req.params.id)) {
        return res.status(400).json({ message: 'Cannot change or deactivate the only remaining admin account.' });
      }
    }

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

    logAudit({
      actor_id: req.user.id, actor_name: req.user.name,
      action: deactivating ? 'Deactivated user' : is_active ? 'Reactivated user' : 'Updated user',
      details: `user #${req.params.id}: ${Object.keys(req.body).join(', ')}`, ip_address: req.ip,
    });

    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    if (await isLastActiveAdmin(req.params.id)) {
      return res.status(400).json({ message: 'Cannot deactivate the only remaining admin account.' });
    }
    await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
    logAudit({
      actor_id: req.user.id, actor_name: req.user.name, action: 'Deactivated user',
      details: `user #${req.params.id}`, ip_address: req.ip,
    });
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.verifyUser = async (req, res) => {
  try {
    const [[user]] = await db.query('SELECT email, full_name FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await db.query(
      "UPDATE users SET is_verified = 1, verification_status = 'Verified', verification_note = NULL WHERE id = ?",
      [req.params.id]
    );

    logAudit({
      actor_id: req.user.id, actor_name: req.user.name, action: 'Verified resident',
      details: `${user.full_name} <${user.email}>`, ip_address: req.ip,
    });

    try {
      await sendVerificationEmail(user.email, user.full_name);
    } catch (mailErr) {
      console.error('Verification email failed:', mailErr.message);
    }

    res.json({ message: 'User verified' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A reason is required so the resident knows what to correct.' });
    }
    const [[user]] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await db.query(
      "UPDATE users SET is_verified = 0, verification_status = 'Rejected', verification_note = ? WHERE id = ?",
      [reason.trim(), req.params.id]
    );

    logAudit({
      actor_id: req.user.id, actor_name: req.user.name, action: 'Rejected resident registration',
      details: `user #${req.params.id}: ${reason.trim()}`, ip_address: req.ip,
    });

    res.json({ message: 'Registration rejected' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
