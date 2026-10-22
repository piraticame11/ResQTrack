const db = require('../config/db');
const { sendSMS } = require('../utils/sms');

function generateRefNo() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `INC-${date}-${rand}`;
}

// Smart keyword classifier for incoming SMS emergency reports
function classifyIncident(text) {
  const lower = text.toLowerCase();

  // Fire (Red triage)
  if (/\b(fire|sunog|apoy|burning|blaze|usok)\b/i.test(lower)) {
    return { type: 'Fire', triage: 'Red' };
  }
  // Rescue / Medical / Vehicular Accident (Red triage)
  if (/\b(rescue|saklolo|aksidente|accident|crash|collision|nabangga|banggaan|tulong|trapped|naipit|nahulog|heart attack|stroke|drowning|nalunod|emergency)\b/i.test(lower)) {
    return { type: 'Rescue', triage: 'Red' };
  }
  // Flood / Natural disaster (Orange triage)
  if (/\b(flood|baha|lumalaki ang tubig|landslide|bagyo)\b/i.test(lower)) {
    return { type: 'Flood', triage: 'Orange' };
  }
  // Fights / Violence / Disturbance with weapons (Orange triage)
  if (/\b(fight|fights|away|rambol|suntukan|riot|saksak|stab|stabbing|baril|gunshot|gulpi|gulo)\b/i.test(lower)) {
    return { type: 'Fights', triage: 'Orange' };
  }
  // Crime / Robbery / Theft / Illegal drugs (Orange triage)
  if (/\b(crime|krimen|nakaw|holdap|snatcher|theft|robbery|magnanakaw|nanakawan|drugs|shabu)\b/i.test(lower)) {
    return { type: 'Crime', triage: 'Orange' };
  }
  // Noise disturbance (Yellow triage)
  if (/\b(noise|ingay|maingay|videoke|karaoke|party|loud)\b/i.test(lower)) {
    return { type: 'Noise', triage: 'Yellow' };
  }
  // Missing person / pet (Yellow triage)
  if (/\b(missing|nawawala|nawala)\b/i.test(lower)) {
    return { type: 'Missing', triage: 'Yellow' };
  }

  return { type: 'Other', triage: 'Yellow' };
}

// Cache to prevent duplicate submissions within 15 seconds
const recentSMSCache = new Map();

// Inbound webhook for "report by SMS" â€” allows residents to text a report in
// when offline, forwarded via an Android SMS Gateway app or provider webhook.
exports.inbound = async (req, res) => {
  try {
    // 1. Flexible Secret Check (query param, JSON body, or request headers)
    const expectedSecret = process.env.SMS_WEBHOOK_SECRET;
    const providedSecret = req.query.secret || req.body?.secret || req.headers['x-webhook-secret'] || req.headers['x-secret'];
    if (expectedSecret && providedSecret !== expectedSecret) {
      return res.status(401).json({ message: 'Invalid webhook secret' });
    }

    // 2. Flexible Field Extraction (supports standard gateway apps like MacroDroid, SMS Forwarder, Semaphore, etc.)
    const rawFrom = req.body?.from || req.body?.sender || req.body?.phone || req.body?.address || req.body?.number || req.query?.from;
    const rawMessage = req.body?.message || req.body?.body || req.body?.text || req.body?.content || req.body?.msg || req.body?.sms || req.query?.message;

    if (!rawFrom || !rawMessage) {
      return res.status(400).json({
        message: "Expected sender and message content in request body. Supported formats: { from, message }, { sender, body }, or { phone, text }."
      });
    }

    const from = String(rawFrom).trim();
    const message = String(rawMessage).trim();

    // 3. Loop / Feedback Echo Prevention:
    // If the phone receives an outbound system SMS from ResQTrack, ignore it so it doesn't get logged as a 2nd incident
    if (
      /^\s*\[?ResQTrack/i.test(message) ||
      /INC-\d{8}-\d+/i.test(message) ||
      /responders have been alerted/i.test(message) ||
      /needs review/i.test(message)
    ) {
      console.log(`[SMS Inbound Webhook] Ignored reflected system confirmation from ${from}: "${message.slice(0, 50)}..."`);
      return res.status(200).json({
        success: true,
        ignored: true,
        message: 'System notification ignored to prevent duplicate echo loop.'
      });
    }

    const normalizedPhone = from.replace(/\D/g, '').slice(-10); // match last 10 digits

    // 4. Debounce rapid duplicate POSTs (within 15 seconds)
    const cacheKey = `${normalizedPhone}:${message.toLowerCase()}`;
    const now = Date.now();
    if (recentSMSCache.has(cacheKey) && (now - recentSMSCache.get(cacheKey) < 15000)) {
      console.log(`[SMS Inbound Webhook] Suppressed duplicate SMS report from ${from}`);
      return res.status(200).json({
        success: true,
        ignored: true,
        message: 'Duplicate report suppressed within 15 seconds.'
      });
    }
    recentSMSCache.set(cacheKey, now);
    if (recentSMSCache.size > 100) {
      for (const [k, time] of recentSMSCache.entries()) {
        if (now - time > 60000) recentSMSCache.delete(k);
      }
    }

    // 5. Resident matching
    let [[reporter]] = await db.query(
      "SELECT id, purok_id, full_name, phone FROM users WHERE phone LIKE ? AND is_active = 1 LIMIT 1",
      [`%${normalizedPhone}`]
    );

    let isGuest = false;
    if (!reporter) {
      // Fallback: assign to primary active admin so emergency reports from unregistered numbers are not lost
      const [[adminUser]] = await db.query(
        "SELECT id, full_name FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY id ASC LIMIT 1"
      );
      if (!adminUser) {
        return res.status(404).json({ message: 'No registered resident or system admin found to receive report.' });
      }
      reporter = { id: adminUser.id, purok_id: null, full_name: `SMS Reporter (${from})` };
      isGuest = true;
    }

    // 6. Smart Purok Detection from message content (e.g., "Purok 3", "Prk 5", "P-12")
    let targetPurokId = reporter.purok_id || null;
    const purokMatch = message.match(/(?:purok|prk|p-|\bp\b)[\s#]*([0-9]{1,2})\b/i);
    if (purokMatch) {
      const pNum = parseInt(purokMatch[1], 10);
      const [[foundPurok]] = await db.query('SELECT id FROM puroks WHERE id = ? LIMIT 1', [pNum]);
      if (foundPurok) {
        targetPurokId = foundPurok.id;
      }
    }

    // 7. Smart Classification (Fire, Rescue, Flood, Crime, Fights, Noise, Missing, Other)
    const { type: incidentType, triage: triageColor } = classifyIncident(message);

    const reference_no = generateRefNo();
    const descriptionPrefix = isGuest ? `[via SMS from unregistered ${from}]` : `[via SMS]`;
    const fullDescription = `${descriptionPrefix} ${message}`;

    const [result] = await db.query(
      `INSERT INTO incidents (reference_no, reporter_id, incident_type, description, purok_id, status, triage_color)
       VALUES (?, ?, ?, ?, ?, 'Pending', ?)`,
      [reference_no, reporter.id, incidentType, fullDescription, targetPurokId, triageColor]
    );

    await db.query(
      'INSERT INTO incident_logs (incident_id, actor_id, action, note) VALUES (?, ?, ?, ?)',
      [result.insertId, reporter.id, 'Incident reported via SMS', message]
    );

    const [inc] = await db.query(`
      SELECT i.*, u.full_name AS reporter_name, p.name AS purok_name
      FROM incidents i
      LEFT JOIN users u ON i.reporter_id = u.id
      LEFT JOIN puroks p ON i.purok_id = p.id
      WHERE i.id = ?`, [result.insertId]);

    const io = req.app.get('io') || global.__resqtrack_io;
    if (io) io.emit('incident:new', inc[0]);

    // 8. Notify barangay admins and active responders by SMS (excluding the reporter)
    const [notifyTargets] = await db.query(
      "SELECT phone FROM users WHERE phone IS NOT NULL AND is_active = 1 AND (role = 'admin' OR role = 'responder')"
    );
    const purokLabel = inc[0]?.purok_name ? ` (${inc[0].purok_name})` : '';
    const alertMsg = `ResQTrack Alert [${incidentType}]: SMS report ${reference_no}${purokLabel} needs review â€” "${message.slice(0, 60)}"`;
    notifyTargets.forEach(u => {
      if (u.phone && !u.phone.endsWith(normalizedPhone)) {
        sendSMS(u.phone, alertMsg);
      }
    });

    res.status(201).json({
      success: true,
      message: 'Incident created from SMS',
      reference_no,
      incident_type: incidentType,
      triage_color: triageColor,
      purok_id: targetPurokId,
      is_guest: isGuest
    });
  } catch (err) {
    console.error('[SMS Inbound Webhook Error]:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

