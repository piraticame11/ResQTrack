const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const fs     = require('fs');
const db     = require('../config/db');
const { logAudit } = require('../utils/audit');
const { geocodeAddress } = require('../utils/geocode');
const { extractIdText, parseIdFields } = require('../utils/ocr');

function generateTokens(user) {
  const payload = { id: user.id, role: user.role, name: user.full_name };
  const accessToken   = jwt.sign(payload, process.env.JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRES_IN         || '15m' });
  const refreshToken  = jwt.sign(payload, process.env.JWT_REFRESH_SECRET,  { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN  || '3y'  });
  return { accessToken, refreshToken };
}

// Pre-registration helper: OCR the captured ID photo and return best-guess
// field values so the client can pre-fill the form. This is scan-and-discard —
// the photo the resident actually registers with is uploaded separately by
// /register and stored there; nothing from this scan is persisted.
exports.scanId = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No ID image provided' });
  try {
    const buffer    = fs.readFileSync(req.file.path);
    const text      = await extractIdText(buffer);
    const extracted = parseIdFields(text);
    res.json({ extracted });
  } catch (err) {
    res.status(500).json({ message: 'Could not read ID', error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
};

exports.register = async (req, res) => {
  try {
    const {
      full_name, email, password, phone, purok_id, birthdate,
      address_line, residency_type, landlord_name, landlord_contact, landlord_address,
      id_type, id_number,
    } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ message: 'full_name, email and password are required' });
    }

    if (!id_type || !id_type.trim() || !id_number || !id_number.trim()) {
      return res.status(400).json({ message: 'Please select your ID type and enter its ID number.' });
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

    // A Purok alone isn't a locatable address — require the actual house
    // number / street / landmark so dispatch can find the resident.
    if (!address_line || address_line.trim().length < 5) {
      return res.status(400).json({ message: 'Please provide a complete address (house number, street, and landmark).' });
    }

    const residency = residency_type === 'Tenant' ? 'Tenant' : 'Owner';
    if (residency === 'Tenant' && (
      !landlord_name || !landlord_name.trim() ||
      !landlord_contact || !landlord_contact.trim() ||
      !landlord_address || !landlord_address.trim()
    )) {
      return res.status(400).json({ message: 'Tenants/boarders must provide their landlord\'s name, contact number, and address as proof of residency.' });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ message: 'Email already registered' });

    const id_image = req.files?.id_image?.[0]?.filename || null;
    const proof_of_residency_image = req.files?.proof_of_residency?.[0]?.filename || null;
    if (!id_image) {
      return res.status(400).json({ message: 'Please capture a photo of your valid ID.' });
    }
    if (!proof_of_residency_image) {
      return res.status(400).json({ message: 'Please capture a photo of a proof-of-residency document (barangay certificate, utility bill, or lease contract).' });
    }

    // Address matching: verify the typed address resolves to a real place
    // within the selected Purok's barangay. Purely advisory for the admin —
    // never blocks registration on its own, since geocoding a hand-typed
    // Philippine address is imprecise.
    let purokBarangay = null;
    if (purok_id) {
      const [[purok]] = await db.query('SELECT barangay FROM puroks WHERE id = ?', [purok_id]);
      purokBarangay = purok?.barangay || null;
    }
    const geo = await geocodeAddress(address_line.trim(), purokBarangay);

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO users
         (full_name, email, password_hash, phone, birthdate, role, purok_id,
          address_line, address_lat, address_lng, address_match_status,
          residency_type, landlord_name, landlord_contact, landlord_address,
          id_type, id_number,
          id_image, proof_of_residency_image, is_verified, verification_status, is_active)
       VALUES (?, ?, ?, ?, ?, "resident", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Pending', 1)`,
      [
        full_name, email, hash, phone || null, birthdate || null, purok_id || null,
        address_line.trim(), geo.lat, geo.lng, geo.status, residency,
        residency === 'Tenant' ? landlord_name.trim() : null,
        residency === 'Tenant' ? landlord_contact.trim() : null,
        residency === 'Tenant' ? landlord_address.trim() : null,
        id_type.trim(), id_number.trim(),
        id_image, proof_of_residency_image,
      ]
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
      if (user.verification_status === 'Rejected') {
        return res.status(403).json({
          message: user.verification_note
            ? `Your registration was not approved: ${user.verification_note}`
            : 'Your registration was not approved by the Barangay Administrator. Please visit the barangay hall for assistance.',
        });
      }
      return res.status(403).json({ message: 'Your account is currently under review. Please wait for the Barangay Administrator to verify your identity.' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    logAudit({
      actor_id: user.id, actor_name: user.full_name, action: 'Login',
      details: `role: ${user.role}`, ip_address: req.ip,
    });

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

// Step-up re-authentication for sensitive sections (e.g. the Blotter) —
// confirms the already-logged-in user still knows their own password before
// letting them past a client-side gate. Checked against the same
// password_hash as login, never a separate/weaker scheme.
exports.verifyPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password is required' });

    const [[user]] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(401).json({ message: 'Not authenticated' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Incorrect password' });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.logout = (req, res) => {
  if (req.user) {
    logAudit({ actor_id: req.user.id, actor_name: req.user.name, action: 'Logout', ip_address: req.ip });
  }
  res.json({ message: 'Logged out successfully' });
};
