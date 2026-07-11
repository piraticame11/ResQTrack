const db = require('../config/db');
const { sendSMS } = require('../utils/sms');

const TRIAGE_MAP = {
  Fire:    'Red',
  Rescue:  'Red',
  Crime:   'Orange',
  Noise:   'Yellow',
  Garbage: 'Green',
  Other:   'Yellow',
};

const VALID_TYPES   = ['Fire', 'Rescue', 'Crime', 'Noise', 'Garbage', 'Other'];
const VALID_TRIAGE   = ['Red', 'Orange', 'Yellow', 'Green'];
const VALID_STATUSES = ['Pending', 'Dispatched', 'Initiate', 'Delayed', 'Resolved', 'Archived'];

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
    const [rows] = await db.query(`
      SELECT i.*, u.full_name AS reporter_name, u.phone AS reporter_phone,
             r.full_name AS responder_name, r.phone AS responder_phone, p.name AS purok_name,
             fu.full_name AS flagged_by_name,
             GROUP_CONCAT(DISTINCT ir_u.full_name ORDER BY ir.assigned_at SEPARATOR ', ') AS all_responder_names,
             GROUP_CONCAT(DISTINCT ir.responder_id ORDER BY ir.assigned_at SEPARATOR ',')  AS all_responder_ids
      FROM incidents i
      LEFT JOIN users u   ON i.reporter_id = u.id
      LEFT JOIN users r   ON i.assigned_responder_id = r.id
      LEFT JOIN users fu  ON i.flagged_by = fu.id
      LEFT JOIN puroks p  ON i.purok_id = p.id
      LEFT JOIN incident_responders ir   ON ir.incident_id = i.id
      LEFT JOIN users ir_u ON ir.responder_id = ir_u.id
      WHERE i.id = ?
      GROUP BY i.id, u.full_name, u.phone, r.full_name, r.phone, p.name, fu.full_name`,
      [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Incident not found' });

    const [attachments] = await db.query(
      'SELECT id, file_path, uploaded_at FROM incident_attachments WHERE incident_id = ? ORDER BY id',
      [req.params.id]
    );

    res.json({ ...rows[0], attachments });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createIncident = async (req, res) => {
  try {
    const { incident_type, description, purok_id, latitude, longitude } = req.body;
    const reporter_id  = req.user.id;
    const files         = req.files || [];
    const photo_path    = files[0] ? `/uploads/${files[0].filename}` : null;
    const reference_no  = generateRefNo();
    const triage_color  = TRIAGE_MAP[incident_type] || 'Yellow';

    const [result] = await db.query(
      `INSERT INTO incidents
         (reference_no, reporter_id, incident_type, description, purok_id, latitude, longitude, photo_path, status, triage_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [reference_no, reporter_id, incident_type, description,
       purok_id || null, latitude || null, longitude || null, photo_path, triage_color]
    );

    await attachPhotosAndLogs(result.insertId, files);

    const [inc] = await db.query(`
      SELECT i.*, u.full_name AS reporter_name, p.name AS purok_name
      FROM incidents i
      LEFT JOIN users u  ON i.reporter_id = u.id
      LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE i.id = ?`, [result.insertId]);

    const io = req.app.get('io');
    if (io) io.emit('incident:new', inc[0]);

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [result.insertId, reporter_id, 'Incident reported', `New ${incident_type} incident created`]
    );

    res.status(201).json({ message: 'Incident reported successfully', incident: inc[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    if (status === 'Initiate' || status === 'Delayed') {
      const [[inc]] = await db.query(
        'SELECT assigned_responder_id FROM incidents WHERE id = ?', [req.params.id]
      );
      if (!inc?.assigned_responder_id) {
        return res.status(400).json({ message: `Assign at least one responder before marking as ${status}.` });
      }
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
      'SELECT reference_no, reporter_id FROM incidents WHERE id = ?', [req.params.id]
    );
    const io = req.app.get('io');
    if (io) io.emit('incident:status_update', {
      id: parseInt(req.params.id),
      status,
      reporter_id: incInfo.reporter_id,
      reference_no: incInfo.reference_no,
      updated_by: req.user.name,
    });

    if (status === 'Dispatched' || status === 'Resolved') {
      const [[reporter]] = await db.query('SELECT phone FROM users WHERE id = ?', [incInfo.reporter_id]);
      if (reporter?.phone) {
        const msg = status === 'Dispatched'
          ? `ResQTrack: A responder has been dispatched for your report ${incInfo.reference_no}.`
          : `ResQTrack: Your report ${incInfo.reference_no} has been marked resolved.`;
        sendSMS(reporter.phone, msg);
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
      'UPDATE incidents SET is_fake = 1, fake_reason = ?, flagged_by = ?, flagged_at = NOW() WHERE id = ?',
      [reason.trim(), req.user.id, req.params.id]
    );

    if (!inc.is_fake) {
      await db.query('UPDATE users SET fake_report_count = fake_report_count + 1 WHERE id = ?', [inc.reporter_id]);
    }

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, `Flagged as fake report by ${req.user.name}`, reason.trim()]
    );

    res.json({ message: 'Incident flagged as fake' });
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
      'UPDATE incidents SET is_fake = 0, fake_reason = NULL, flagged_by = NULL, flagged_at = NULL WHERE id = ?',
      [req.params.id]
    );
    await db.query('UPDATE users SET fake_report_count = GREATEST(fake_report_count - 1, 0) WHERE id = ?', [inc.reporter_id]);

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, `Fake-report flag removed by ${req.user.name}`]
    );

    res.json({ message: 'Flag removed' });
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
      'UPDATE incidents SET assigned_responder_id = ?, status = "Dispatched" WHERE id = ?',
      [responder_ids[0], req.params.id]
    );

    // Fetch names for the log
    const [names] = await db.query(
      `SELECT full_name FROM users WHERE id IN (${responder_ids.map(() => '?').join(',')})`,
      responder_ids
    );
    const nameList = names.map(n => n.full_name).join(', ');

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, `Responder(s) assigned: ${nameList}`]
    );

    const [[incData]] = await db.query(
      'SELECT reference_no, reporter_id FROM incidents WHERE id = ?', [req.params.id]
    );
    const io = req.app.get('io');
    if (io) io.emit('incident:status_update', {
      id: parseInt(req.params.id),
      status: 'Dispatched',
      reporter_id: incData.reporter_id,
      reference_no: incData.reference_no,
      responder_name: nameList,
    });

    const [[reporter]] = await db.query('SELECT phone FROM users WHERE id = ?', [incData.reporter_id]);
    if (reporter?.phone) {
      sendSMS(reporter.phone, `ResQTrack: A responder has been dispatched for your report ${incData.reference_no}.`);
    }

    res.json({ message: 'Responder(s) assigned' });
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
