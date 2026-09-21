const db = require('../config/db');
const { sendBlotterStatusEmail } = require('../utils/mailer');
const { sendSMS } = require('../utils/sms');

const STATUSES = ['Open', 'Under Mediation', 'Resolved', 'Endorsed to Court', 'Voided'];
const LOCKING_STATUSES = ['Resolved', 'Endorsed to Court', 'Voided'];

function generateEntryNo() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `BLT-${date}-${rand}`;
}

exports.getEntries = async (req, res) => {
  try {
    const { status, purok_id, search } = req.query;
    let q = `
      SELECT b.*, p.name AS purok_name, u.full_name AS filed_by_name,
             cu.full_name AS complainant_user_name, ru.full_name AS respondent_user_name
      FROM blotter_entries b
      LEFT JOIN puroks p ON b.purok_id = p.id
      LEFT JOIN users u  ON b.filed_by = u.id
      LEFT JOIN users cu ON b.complainant_user_id = cu.id
      LEFT JOIN users ru ON b.respondent_user_id = ru.id
      WHERE 1=1`;
    const params = [];

    if (status)   { q += ' AND b.status = ?';   params.push(status); }
    if (purok_id) { q += ' AND b.purok_id = ?'; params.push(purok_id); }
    if (search) {
      q += ' AND (b.entry_no LIKE ? OR b.complainant_name LIKE ? OR b.respondent_name LIKE ? OR b.nature LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    q += ' ORDER BY b.filed_at DESC';

    const [rows] = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getEntryById = async (req, res) => {
  try {
    const [[entry]] = await db.query(`
      SELECT b.*, p.name AS purok_name, u.full_name AS filed_by_name,
             cu.full_name AS complainant_user_name, cu.email AS complainant_linked_email,
             ru.full_name AS respondent_user_name
      FROM blotter_entries b
      LEFT JOIN puroks p ON b.purok_id = p.id
      LEFT JOIN users u  ON b.filed_by = u.id
      LEFT JOIN users cu ON b.complainant_user_id = cu.id
      LEFT JOIN users ru ON b.respondent_user_id = ru.id
      WHERE b.id = ?`, [req.params.id]);
    if (!entry) return res.status(404).json({ message: 'Blotter entry not found' });

    const [logs] = await db.query(`
      SELECT l.*, u.full_name AS actor_name
      FROM blotter_logs l
      LEFT JOIN users u ON l.actor_id = u.id
      WHERE l.blotter_id = ?
      ORDER BY l.logged_at ASC`, [req.params.id]);

    res.json({ ...entry, logs });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createEntry = async (req, res) => {
  try {
    const {
      complainant_user_id, complainant_name, complainant_email, complainant_address, complainant_contact,
      respondent_user_id, respondent_name, respondent_address, respondent_contact,
      nature, narrative, purok_id,
    } = req.body;

    if (!complainant_name?.trim() || !complainant_address?.trim() || !complainant_contact?.trim() ||
        !respondent_name?.trim() || !nature?.trim() || !narrative?.trim()) {
      return res.status(400).json({ message: 'Complainant name, address, contact number, respondent name, nature, and narrative are required.' });
    }

    let finalComplainantEmail = complainant_email?.trim() || null;
    if (!finalComplainantEmail && complainant_user_id) {
      const [[u]] = await db.query('SELECT email FROM users WHERE id = ?', [complainant_user_id]);
      if (u) finalComplainantEmail = u.email;
    }

    const entry_no = generateEntryNo();
    const [result] = await db.query(
      `INSERT INTO blotter_entries
         (entry_no, complainant_user_id, complainant_name, complainant_email, complainant_address, complainant_contact,
          respondent_user_id, respondent_name, respondent_address, respondent_contact,
          nature, narrative, purok_id, filed_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')`,
      [
        entry_no,
        complainant_user_id || null,
        complainant_name.trim(),
        finalComplainantEmail,
        complainant_address.trim(),
        complainant_contact.trim(),
        respondent_user_id || null,
        respondent_name.trim(),
        respondent_address?.trim() || null,
        respondent_contact?.trim() || null,
        nature.trim(),
        narrative.trim(),
        purok_id || null,
        req.user.id,
      ]
    );

    await db.query(
      'INSERT INTO blotter_logs (blotter_id, actor_id, action) VALUES (?, ?, ?)',
      [result.insertId, req.user.id, `Entry filed by ${req.user.name}`]
    );

    const [[entry]] = await db.query(`
      SELECT b.*, p.name AS purok_name, u.full_name AS filed_by_name
      FROM blotter_entries b
      LEFT JOIN puroks p ON b.purok_id = p.id
      LEFT JOIN users u  ON b.filed_by = u.id
      WHERE b.id = ?`, [result.insertId]);

    res.status(201).json({ message: 'Blotter entry filed', entry });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateEntry = async (req, res) => {
  try {
    const [[existing]] = await db.query('SELECT is_locked FROM blotter_entries WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ message: 'Blotter entry not found' });
    if (existing.is_locked) {
      return res.status(403).json({ message: 'This entry is locked and can no longer be edited.' });
    }

    const editable = [
      'complainant_user_id', 'complainant_name', 'complainant_email', 'complainant_address', 'complainant_contact',
      'respondent_user_id', 'respondent_name', 'respondent_address', 'respondent_contact',
      'nature', 'narrative', 'action_taken', 'purok_id',
    ];
    const updates = [], params = [];
    for (const key of editable) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(typeof req.body[key] === 'string' ? req.body[key].trim() || null : req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ message: 'No fields to update' });

    params.push(req.params.id);
    await db.query(`UPDATE blotter_entries SET ${updates.join(', ')} WHERE id = ?`, params);

    await db.query(
      'INSERT INTO blotter_logs (blotter_id, actor_id, action) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, `Entry details updated by ${req.user.name}`]
    );

    res.json({ message: 'Entry updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const [[existing]] = await db.query(
      `SELECT b.*, cu.email AS linked_email
       FROM blotter_entries b
       LEFT JOIN users cu ON b.complainant_user_id = cu.id
       WHERE b.id = ?`,
      [req.params.id]
    );
    if (!existing) return res.status(404).json({ message: 'Blotter entry not found' });
    if (existing.is_locked) {
      return res.status(403).json({ message: 'This entry is locked and its status can no longer be changed.' });
    }

    const willLock = LOCKING_STATUSES.includes(status);
    if (willLock && !note?.trim()) {
      return res.status(400).json({ message: `A closing note is required to mark this entry as "${status}".` });
    }

    const cols   = ['status = ?', 'is_locked = ?'];
    const values = [status, willLock ? 1 : 0];
    if (status === 'Resolved' || status === 'Endorsed to Court') { cols.push('resolved_at = ?'); values.push(new Date()); }
    if (note?.trim()) { cols.push('action_taken = ?'); values.push(note.trim()); }
    values.push(req.params.id);

    await db.query(`UPDATE blotter_entries SET ${cols.join(', ')} WHERE id = ?`, values);

    await db.query(
      'INSERT INTO blotter_logs (blotter_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, `Status changed to "${status}" by ${req.user.name}`, note?.trim() || null]
    );

    // Notify Complainant via Email and SMS
    const targetEmail = existing.complainant_email || existing.linked_email;
    const targetPhone = existing.complainant_contact;

    if (targetEmail) {
      sendBlotterStatusEmail(targetEmail, existing.complainant_name, existing.entry_no, existing.nature, status, note?.trim())
        .catch(err => console.error('[Blotter Mailer Error]:', err.message));
    }

    if (targetPhone) {
      const smsMsg = `ResQTrack: Blotter Entry ${existing.entry_no} (${existing.nature}) status has been updated to "${status}". Note: ${note?.trim() || 'No remarks'}. - Brgy. Manay`;
      sendSMS(targetPhone, smsMsg)
        .catch(err => console.error('[Blotter SMS Error]:', err.message));
    }

    res.json({ message: 'Status updated and notification dispatched' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.notifyComplainant = async (req, res) => {
  try {
    const { custom_message } = req.body;
    const [[entry]] = await db.query(
      `SELECT b.*, cu.email AS linked_email
       FROM blotter_entries b
       LEFT JOIN users cu ON b.complainant_user_id = cu.id
       WHERE b.id = ?`,
      [req.params.id]
    );
    if (!entry) return res.status(404).json({ message: 'Blotter entry not found' });

    const targetEmail = entry.complainant_email || entry.linked_email;
    const targetPhone = entry.complainant_contact;
    const dispatched = [];

    const note = custom_message?.trim() || entry.action_taken || `Status: ${entry.status}`;

    if (targetEmail) {
      await sendBlotterStatusEmail(targetEmail, entry.complainant_name, entry.entry_no, entry.nature, entry.status, note)
        .then(() => dispatched.push(`Email (${targetEmail})`))
        .catch(err => console.error('[Blotter Manual Email Error]:', err.message));
    }

    if (targetPhone) {
      const smsMsg = `ResQTrack: Update on Blotter Entry ${entry.entry_no} (${entry.nature}): ${note} - Brgy. Manay`;
      await sendSMS(targetPhone, smsMsg)
        .then(result => { if (result.sent) dispatched.push(`SMS (${targetPhone})`); })
        .catch(err => console.error('[Blotter Manual SMS Error]:', err.message));
    }

    if (!dispatched.length) {
      return res.status(400).json({ message: 'No valid email or phone number found for complainant' });
    }

    await db.query(
      'INSERT INTO blotter_logs (blotter_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, `Notification sent to complainant via ${dispatched.join(', ')}`, note]
    );

    res.json({ message: `Notification sent via ${dispatched.join(' and ')}`, dispatched });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
