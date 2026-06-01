const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

function generateTokens(user) {
  const payload = { id: user.id, role: user.role, name: user.full_name };
  const accessToken   = jwt.sign(payload, process.env.JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRES_IN         || '15m' });
  const refreshToken  = jwt.sign(payload, process.env.JWT_REFRESH_SECRET,  { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN  || '3y'  });
  return { accessToken, refreshToken };
}

exports.register = async (req, res) => {
  try {
    const { full_name, email, password, phone, purok_id, birthdate } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ message: 'full_name, email and password are required' });
    }

    // Phone: exactly 11 digits, must start with 09
    if (phone) {
      if (!/^09\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'Phone number must be 11 digits and start with 09' });
      }
    }

    // Password: strong alphanumeric — at least 8 chars, one uppercase, one lowercase, one digit
    const strongPw = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strongPw.test(password)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters with uppercase, lowercase, and a number',
      });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ message: 'Email already registered' });

    const id_image = req.file ? req.file.filename : null;
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (full_name, email, password_hash, phone, birthdate, role, purok_id, id_image, is_verified, is_active) VALUES (?, ?, ?, ?, ?, "resident", ?, ?, 0, 1)',
      [full_name, email, hash, phone || null, birthdate || null, purok_id || null, id_image]
    );
    res.status(201).json({ message: 'Registration submitted successfully. Your account is under review and will be activated once verified by the Barangay Administrator.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    if (!rows.length) return res.status(401).json({ message: 'Invalid credentials' });

    const user  = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    if (user.role === 'resident' && !user.is_verified) {
      return res.status(403).json({ message: 'Your account is currently under review. Please wait for the Barangay Administrator to verify your identity.' });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.full_name, role: user.role, email: user.email, profile_photo: user.profile_photo || null },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: 'No refresh token provided' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const [rows]  = await db.query('SELECT * FROM users WHERE id = ? AND is_active = 1', [payload.id]);
    if (!rows.length) return res.status(401).json({ message: 'User not found' });
    const tokens = generateTokens(rows[0]);
    res.json(tokens);
  } catch {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

exports.logout = (_req, res) => res.json({ message: 'Logged out successfully' });
