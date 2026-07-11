const db = require('../config/db');

function generateRefNo() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `INC-${date}-${rand}`;
}

// Inbound webhook for "report by SMS" — lets a resident text a report in
// when they have no data connection. This is provider-shaped, not
// provider-tested: no PH SMS gateway account is wired up in this deployment,
// so the field names below (from/message) are a reasonable default and will
// likely need adjusting to match whichever gateway's webhook payload you
// actually configure (Semaphore, Movider, etc.), along with the webhook URL
// on that provider's dashboard pointing at POST /api/sms/inbound.
//
// Security: set SMS_WEBHOOK_SECRET in .env and configure the same value as
// a `?secret=` query param on the webhook URL you give the provider, so
// randos on the internet can't create fake incidents by POSTing here.
exports.inbound = async (req, res) => {
  try {
    const expectedSecret = process.env.SMS_WEBHOOK_SECRET;
    if (expectedSecret && req.query.secret !== expectedSecret) {
      return res.status(401).json({ message: 'Invalid webhook secret' });
    }

    const { from, message } = req.body;
    if (!from || !message) {
      return res.status(400).json({ message: 'Expected { from, message } in the webhook payload — adjust to match your SMS provider\'s field names.' });
    }

    const normalizedPhone = from.replace(/\D/g, '').slice(-10); // last 10 digits, ignore country code
    const [[reporter]] = await db.query(
      "SELECT id, purok_id FROM users WHERE phone LIKE ? AND role = 'resident' AND is_active = 1 LIMIT 1",
      [`%${normalizedPhone}`]
    );

    if (!reporter) {
      return res.status(404).json({ message: 'No registered resident found for this phone number.' });
    }

    const reference_no = generateRefNo();
    const [result] = await db.query(
      `INSERT INTO incidents (reference_no, reporter_id, incident_type, description, purok_id, status, triage_color)
       VALUES (?, ?, 'Other', ?, ?, 'Pending', 'Yellow')`,
      [reference_no, reporter.id, `[via SMS] ${message.trim()}`, reporter.purok_id || null]
    );

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [result.insertId, reporter.id, 'Incident reported via SMS', message.trim()]
    );

    const [inc] = await db.query(`
      SELECT i.*, u.full_name AS reporter_name, p.name AS purok_name
      FROM incidents i LEFT JOIN users u ON i.reporter_id = u.id LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE i.id = ?`, [result.insertId]);

    const io = req.app.get('io');
    if (io) io.emit('incident:new', inc[0]);

    res.status(201).json({ message: 'Incident created from SMS', reference_no });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
