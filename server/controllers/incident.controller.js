const db = require('../config/db');
const { sendSMS } = require('../utils/sms');

const TRIAGE_MAP = {
  Fire:    'Red',
  Rescue:  'Red',
  Crime:   'Orange',
  Fights:  'Orange',
  Flood:   'Orange',
  Missing: 'Yellow',
  Noise:   'Yellow',
  Other:   'Green',
  'Flagged as Fake': 'Green',
  Spam:    'Green',
};

const VALID_TYPES   = ['Fire', 'Rescue', 'Crime', 'Fights', 'Flood', 'Missing', 'Noise', 'Other', 'Flagged as Fake', 'Spam'];
const VALID_TRIAGE   = ['Red', 'Orange', 'Yellow', 'Green'];
const VALID_STATUSES = ['Pending', 'Assigned', 'Initiate', 'Delayed', 'Resolved', 'Archived'];

function generateRefNo() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `INC-${date}-${rand}`;
}

async function attachPhotosAndLogs(incidentId, files) {
  if (!files?.length) return;
  const rows = files.map(f => [incidentId, `/uploads/${f.filename}`]);
  await db.query('INSERT INTO incident_attachments (incident_id, file_path) VALUES ?', [rows]);
}

exports.getIncidents = async (req, res) => {
  try {
    const { status, incident_type, purok_id, search } = req.query;
    let q = `
      SELECT i.*, u.full_name AS reporter_name,
             r.full_name AS responder_name, p.name AS purok_name
      FROM incidents i
      LEFT JOIN users u  ON i.reporter_id = u.id
      LEFT JOIN users r  ON i.assigned_responder_id = r.id
      LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'resident') {
      q += ' AND i.reporter_id = ?'; params.push(req.user.id);
    }
    if (status)        { q += ' AND i.status = ?';        params.push(status); }
    if (incident_type) { q += ' AND i.incident_type = ?'; params.push(incident_type); }
    if (purok_id)      { q += ' AND i.purok_id = ?';      params.push(purok_id); }
    if (search) {
      q += ' AND (i.reference_no LIKE ? OR i.description LIKE ? OR u.full_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    q += ' ORDER BY i.reported_at DESC';

    const [rows] = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getIncidentById = async (req, res) => {
  try {
    const [[incident]] = await db.query(`
      SELECT i.*, u.full_name AS reporter_name, u.phone AS reporter_phone,
             r.full_name AS responder_name, p.name AS purok_name
      FROM incidents i
      LEFT JOIN users u  ON i.reporter_id = u.id
      LEFT JOIN users r  ON i.assigned_responder_id = r.id
      LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE i.id = ?`, [req.params.id]);

    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    if (req.user.role === 'resident' && incident.reporter_id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const [attachments] = await db.query(
      'SELECT id, file_path, uploaded_at FROM incident_attachments WHERE incident_id = ?',
      [req.params.id]
    );
    const [responders] = await db.query(`
      SELECT u.id, u.full_name, u.phone, ir.assigned_at
      FROM incident_responders ir
      JOIN users u ON ir.responder_id = u.id
      WHERE ir.incident_id = ?`, [req.params.id]);

    res.json({ ...incident, attachments, responders });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createIncident = async (req, res) => {
  try {
    const { incident_type, description, purok_id, latitude, longitude } = req.body;
    if (!incident_type || !description) {
      return res.status(400).json({ message: 'incident_type and description are required' });
    }
    if (!VALID_TYPES.includes(incident_type)) {
      return res.status(400).json({ message: 'Invalid incident type' });
    }

    const reference_no  = generateRefNo();
    const photo_path    = req.files?.[0] ? `/uploads/${req.files[0].filename}` : null;
    const triage_color  = TRIAGE_MAP[incident_type] || 'Green';

    const [result] = await db.query(
      `INSERT INTO incidents
         (reference_no, reporter_id, incident_type, description, purok_id, latitude, longitude, photo_path, status, triage_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [reference_no, req.user.id, incident_type, description,
       purok_id || null, latitude || null, longitude || null, photo_path, triage_color]
    );

    const incidentId = result.insertId;
    await attachPhotosAndLogs(incidentId, req.files);
    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action) VALUES (?, ?, ?)',
      [incidentId, req.user.id, 'Reported']
    );

    const [[created]] = await db.query(`
      SELECT i.*, u.full_name AS reporter_name, p.name AS purok_name
      FROM incidents i
      LEFT JOIN users u  ON i.reporter_id = u.id
      LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE i.id = ?`, [incidentId]);

    const io = req.app.get('io');
    if (io) io.emit('incident:new', created);

    res.status(201).json({ message: 'Incident reported successfully', incident: created });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const extra = {};
    if (status === 'Resolved') extra.resolved_at = new Date();
    if (status === 'Archived') extra.archived_at = new Date();

    const cols   = ['status = ?', ...Object.keys(extra).map(k => `${k} = ?`)];
    const values = [status, ...Object.values(extra), req.params.id];
    await db.query(`UPDATE incidents SET ${cols.join(', ')} WHERE id = ?`, values);

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, `Status changed to ${status}`, note || null]
    );

    const [[incInfo]] = await db.query(
      `SELECT i.reference_no, i.reporter_id, i.incident_type, p.name AS purok_name
       FROM incidents i
       LEFT JOIN puroks p ON i.purok_id = p.id
       WHERE i.id = ?`, [req.params.id]
    );
    const io = req.app.get('io');
    if (io) {
      io.emit('incident:status_update', {
        id: parseInt(req.params.id),
        status,
        reporter_id: incInfo.reporter_id,
        reference_no: incInfo.reference_no,
        updated_by: req.user.name,
      });
      if (status === 'Delayed') {
        io.emit('incident:delayed', {
          id: parseInt(req.params.id),
          reference_no: incInfo.reference_no,
          incident_type: incInfo.incident_type,
          purok_name: incInfo.purok_name || 'Barangay Manay',
          responder_name: req.user.name,
          note: note || '',
        });
      }
    }

    const [[reporter]] = await db.query('SELECT phone FROM users WHERE id = ?', [incInfo.reporter_id]);
    if (reporter?.phone) {
      let msg = '';
      if (status === 'Assigned') {
        msg = `[ResQTrack] Update on ${incInfo.reference_no}: A barangay responder has been assigned and is attending to your report.`;
      } else if (status === 'Initiate') {
        msg = `[ResQTrack] Update on ${incInfo.reference_no}: Responders have arrived on scene and initiated response operations.`;
      } else if (status === 'Delayed') {
        msg = `[ResQTrack] Advisory on ${incInfo.reference_no}: Responder reported a delay${note ? ` (${note})` : ''}. They are on their way.`;
      } else if (status === 'Resolved') {
        msg = `[ResQTrack] Update on ${incInfo.reference_no}: Your incident report has been resolved. Thank you for your vigilance. - Brgy. Manay`;
      }
      if (msg) {
        sendSMS(reporter.phone, msg).catch(err => console.error('[SMS status error]:', err.message));
      }
    }

    res.json({ message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.reclassify = async (req, res) => {
  try {
    const { incident_type, triage_color } = req.body;
    if (incident_type !== undefined && !VALID_TYPES.includes(incident_type)) {
      return res.status(400).json({ message: 'Invalid incident type' });
    }
    if (triage_color !== undefined && !VALID_TRIAGE.includes(triage_color)) {
      return res.status(400).json({ message: 'Invalid triage color' });
    }
    if (incident_type === undefined && triage_color === undefined) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    const cols = [], values = [];
    if (incident_type !== undefined) { cols.push('incident_type = ?'); values.push(incident_type); }
    if (triage_color  !== undefined) { cols.push('triage_color = ?');  values.push(triage_color); }
    values.push(req.params.id);
    await db.query(`UPDATE incidents SET ${cols.join(', ')} WHERE id = ?`, values);

    const noteParts = [];
    if (incident_type !== undefined) noteParts.push(`type -> ${incident_type}`);
    if (triage_color  !== undefined) noteParts.push(`triage -> ${triage_color}`);
    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, 'Reclassified by admin', noteParts.join(', ')]
    );

    res.json({ message: 'Incident reclassified' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.flagFake = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ message: 'A reason is required to flag a report as fake.' });

    const [[inc]] = await db.query('SELECT reporter_id, is_fake FROM incidents WHERE id = ?', [req.params.id]);
    if (!inc) return res.status(404).json({ message: 'Incident not found' });

    await db.query(
      `UPDATE incidents SET is_fake = 1, status = 'Archived', incident_type = 'Flagged as Fake',
       fake_reason = ?, flagged_by = ?, flagged_at = NOW(), archived_at = NOW() WHERE id = ?`,
      [reason.trim(), req.user.id, req.params.id]
    );

    if (!inc.is_fake) {
      await db.query('UPDATE users SET fake_report_count = fake_report_count + 1 WHERE id = ?', [inc.reporter_id]);
    }

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, `Flagged as fake report (Archived) by ${req.user.name}`, reason.trim()]
    );

    const io = req.app.get('io');
    if (io) io.emit('incident:status_update', { id: parseInt(req.params.id), status: 'Archived', is_fake: 1 });

    res.json({ message: 'Incident flagged as fake and archived' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.unflagFake = async (req, res) => {
  try {
    const [[inc]] = await db.query('SELECT reporter_id, is_fake FROM incidents WHERE id = ?', [req.params.id]);
    if (!inc) return res.status(404).json({ message: 'Incident not found' });
    if (!inc.is_fake) return res.status(400).json({ message: 'This incident is not flagged.' });

    await db.query(
      `UPDATE incidents SET is_fake = 0, status = 'Pending', incident_type = 'Other',
       fake_reason = NULL, flagged_by = NULL, flagged_at = NULL WHERE id = ?`,
      [req.params.id]
    );
    await db.query('UPDATE users SET fake_report_count = GREATEST(fake_report_count - 1, 0) WHERE id = ?', [inc.reporter_id]);

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, `Fake report flag removed by ${req.user.name}`, 'Status restored to Pending']
    );

    const io = req.app.get('io');
    if (io) io.emit('incident:status_update', { id: parseInt(req.params.id), status: 'Pending', is_fake: 0 });

    res.json({ message: 'Fake flag removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getDuplicates = async (req, res) => {
  try {
    const [[inc]] = await db.query(
      'SELECT id, incident_type, purok_id, latitude, longitude, reported_at FROM incidents WHERE id = ?',
      [req.params.id]
    );
    if (!inc) return res.status(404).json({ message: 'Incident not found' });

    let q = `
      SELECT i.id, i.reference_no, i.incident_type, i.status, i.triage_color,
             i.description, i.reported_at, i.is_spam, i.is_fake,
             u.full_name AS reporter_name, p.name AS purok_name
      FROM incidents i
      LEFT JOIN users u  ON i.reporter_id = u.id
      LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE i.id != ?
        AND i.is_spam = 0
        AND i.is_fake = 0
        AND (
          (i.purok_id IS NOT NULL AND i.purok_id = ?)
          OR (i.latitude IS NOT NULL AND ? IS NOT NULL AND ABS(i.latitude - ?) < 0.005 AND ABS(i.longitude - ?) < 0.005)
        )
        AND i.reported_at BETWEEN DATE_SUB(?, INTERVAL 4 HOUR) AND DATE_ADD(?, INTERVAL 4 HOUR)
      ORDER BY i.reported_at DESC LIMIT 6`;

    const [dupes] = await db.query(q, [
      inc.id,
      inc.purok_id || 0,
      inc.latitude,
      inc.latitude || 0,
      inc.longitude || 0,
      inc.reported_at,
      inc.reported_at,
    ]);

    res.json(dupes);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.flagSpam = async (req, res) => {
  try {
    const { reason, duplicate_of_id } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ message: 'A reason for marking as spam/duplicate is required.' });
    }

    const [[inc]] = await db.query('SELECT reporter_id, reference_no FROM incidents WHERE id = ?', [req.params.id]);
    if (!inc) return res.status(404).json({ message: 'Incident not found' });

    await db.query(
      `UPDATE incidents SET is_spam = 1, status = 'Archived', incident_type = 'Spam',
       spam_reason = ?, duplicate_of_id = ?, flagged_by = ?, flagged_at = NOW(), archived_at = NOW() WHERE id = ?`,
      [reason.trim(), duplicate_of_id || null, req.user.id, req.params.id]
    );

    const dupNote = duplicate_of_id ? ` (Linked as duplicate of #${duplicate_of_id})` : '';
    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, `Flagged as Spam/Duplicate (Archived) by ${req.user.name}${dupNote}`, reason.trim()]
    );

    const io = req.app.get('io');
    if (io) io.emit('incident:status_update', { id: parseInt(req.params.id), status: 'Archived', is_spam: 1, incident_type: 'Spam' });

    res.json({ message: 'Incident flagged as spam/duplicate and archived' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.assignResponder = async (req, res) => {
  try {
    const { responder_ids } = req.body;
    if (!Array.isArray(responder_ids) || !responder_ids.length) {
      return res.status(400).json({ message: 'Select at least one responder.' });
    }

    // Replace existing assignments for this incident
    await db.query('DELETE FROM incident_responders WHERE incident_id = ?', [req.params.id]);
    const rows = responder_ids.map(rid => [req.params.id, rid]);
    await db.query('INSERT INTO incident_responders (incident_id, responder_id) VALUES ?', [rows]);

    // Keep assigned_responder_id pointing to the first (lead) responder
    await db.query(
      'UPDATE incidents SET assigned_responder_id = ?, status = "Assigned" WHERE id = ?',
      [responder_ids[0], req.params.id]
    );

    // Fetch names and phone numbers for the log and SMS
    const [responders] = await db.query(
      `SELECT id, full_name, phone FROM users WHERE id IN (${responder_ids.map(() => '?').join(',')})`,
      responder_ids
    );
    const nameList = responders.map(n => n.full_name).join(', ');

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, `Responder(s) assigned: ${nameList}`]
    );

    const [[incData]] = await db.query(`
      SELECT i.reference_no, i.reporter_id, i.incident_type, i.triage_color,
             i.description, p.name AS purok_name
      FROM incidents i
      LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE i.id = ?`, [req.params.id]);

    const io = req.app.get('io');
    if (io) io.emit('incident:status_update', {
      id: parseInt(req.params.id),
      status: 'Assigned',
      reporter_id: incData.reporter_id,
      reference_no: incData.reference_no,
      responder_name: nameList,
    });

    // Notify assigned responders via SMS
    const purokStr = incData.purok_name ? `Purok ${incData.purok_name}` : 'Brgy. Manay';
    for (const r of responders) {
      if (r.phone) {
        const smsMsg = `[ResQTrack] DISPATCH ALERT: You have been assigned to Incident ${incData.reference_no} (${incData.incident_type} - ${incData.triage_color}) at ${purokStr}. Please check your responder dashboard immediately.`;
        sendSMS(r.phone, smsMsg).catch(err => console.error(`[SMS dispatch error]:`, err.message));
      }
    }

    // Notify reporter via SMS
    const [[reporter]] = await db.query('SELECT phone FROM users WHERE id = ?', [incData.reporter_id]);
    if (reporter?.phone) {
      sendSMS(reporter.phone, `[ResQTrack] Update for report ${incData.reference_no}: Responder(s) ${nameList} have been dispatched to assist you.`);
    }

    res.json({ message: 'Responder(s) assigned and notified' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getIncidentLogs = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT l.*, u.full_name AS actor_name
      FROM incident_logs l
      LEFT JOIN users u ON l.actor_id = u.id
      WHERE l.incident_id = ?
      ORDER BY l.logged_at ASC`, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.askUpdate = async (req, res) => {
  try {
    const [[inc]] = await db.query(`
      SELECT i.*, p.name AS purok_name
      FROM incidents i
      LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE i.id = ?`, [req.params.id]);
    if (!inc) return res.status(404).json({ message: 'Incident not found' });

    if (!['Initiate', 'Delayed'].includes(inc.status)) {
      return res.status(400).json({ message: 'Status update can only be requested for Initiate or Delayed incidents.' });
    }

    const [responders] = await db.query(`
      SELECT u.id, u.full_name, u.phone
      FROM incident_responders ir
      JOIN users u ON ir.responder_id = u.id
      WHERE ir.incident_id = ? AND u.phone IS NOT NULL`, [req.params.id]);

    if (!responders.length && inc.assigned_responder_id) {
      const [single] = await db.query(`SELECT id, full_name, phone FROM users WHERE id = ? AND phone IS NOT NULL`, [inc.assigned_responder_id]);
      if (single.length) responders.push(single[0]);
    }

    if (!responders.length) {
      return res.status(400).json({ message: 'No assigned responder with a valid phone number found.' });
    }

    const customNote = req.body.note?.trim();
    const smsBody = `ResQTrack Alert: Admin is requesting an immediate update on Incident ${inc.reference_no} (${inc.incident_type}, Purok: ${inc.purok_name || 'N/A'}). ${customNote ? `Note: ${customNote} ` : ''}Please update status or report in immediately. - Brgy. Manay`;

    for (const r of responders) {
      sendSMS(r.phone, smsBody).catch(err => console.error(`[SMS ask-update Error]:`, err.message));
    }

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, `Status update requested via SMS from ${responders.map(r => r.full_name).join(', ')}`, customNote || null]
    );

    res.json({ message: `Update request sent via SMS to ${responders.length} responder(s).` });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
