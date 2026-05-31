const db = require('../config/db');

exports.getMonthlyReport = async (req, res) => {
  try {
    const { year, month } = req.query;
    const [rows] = await db.query(`
      SELECT DAY(reported_at) AS day, incident_type, COUNT(*) AS count
      FROM incidents
      WHERE YEAR(reported_at) = ? AND MONTH(reported_at) = ?
      GROUP BY DAY(reported_at), incident_type
      ORDER BY day`, [year, month]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getAnnualReport = async (req, res) => {
  try {
    const { year } = req.query;
    const [rows] = await db.query(`
      SELECT MONTH(reported_at) AS month, COUNT(*) AS count
      FROM incidents
      WHERE YEAR(reported_at) = ?
      GROUP BY MONTH(reported_at)
      ORDER BY month`, [year]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getByPurok = async (req, res) => {
  try {
    const { year, month } = req.query;
    const params = [];
    let dateCondition = '';
    if (year && month) {
      dateCondition = ' AND YEAR(i.reported_at) = ? AND MONTH(i.reported_at) = ?';
      params.push(year, month);
    } else if (year) {
      dateCondition = ' AND YEAR(i.reported_at) = ?';
      params.push(year);
    }
    const [rows] = await db.query(`
      SELECT p.name AS purok, COUNT(i.id) AS count
      FROM puroks p
      LEFT JOIN incidents i ON i.purok_id = p.id${dateCondition}
      GROUP BY p.id, p.name
      ORDER BY count DESC`, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getByType = async (req, res) => {
  try {
    const { year, month } = req.query;
    const params = [];
    let whereClause = '';
    if (year && month) {
      whereClause = ' WHERE YEAR(reported_at) = ? AND MONTH(reported_at) = ?';
      params.push(year, month);
    } else if (year) {
      whereClause = ' WHERE YEAR(reported_at) = ?';
      params.push(year);
    }
    const [rows] = await db.query(`
      SELECT incident_type, COUNT(*) AS count
      FROM incidents${whereClause}
      GROUP BY incident_type
      ORDER BY count DESC`, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getResponderPerformance = async (req, res) => {
  try {
    const { period, year, month, week } = req.query;

    let dateCondition = '';
    const params = [];

    if (period === 'monthly' && year && month) {
      dateCondition = ' AND YEAR(i.reported_at) = ? AND MONTH(i.reported_at) = ?';
      params.push(year, month);
    } else if (period === 'weekly' && week) {
      // week is an ISO date string (Monday of the target week)
      dateCondition = ' AND YEARWEEK(i.reported_at, 1) = YEARWEEK(?, 1)';
      params.push(week);
    }

    const [rows] = await db.query(`
      SELECT u.id, u.full_name,
        COUNT(i.id) AS total_assigned,
        SUM(CASE WHEN i.status = 'Resolved' THEN 1 ELSE 0 END) AS resolved,
        ROUND(AVG(CASE WHEN dl.dispatched_at IS NOT NULL
          THEN TIMESTAMPDIFF(MINUTE, i.reported_at, dl.dispatched_at) END), 1) AS avg_response_time_minutes,
        ROUND(AVG(CASE WHEN i.resolved_at IS NOT NULL
          THEN TIMESTAMPDIFF(MINUTE, i.reported_at, i.resolved_at) END), 1) AS avg_resolution_minutes
      FROM users u
      LEFT JOIN incident_responders ir ON ir.responder_id = u.id
      LEFT JOIN incidents i ON i.id = ir.incident_id${dateCondition}
      LEFT JOIN (
        SELECT incident_id, MIN(logged_at) AS dispatched_at
        FROM incident_logs
        WHERE action LIKE 'Responder assigned%'
        GROUP BY incident_id
      ) dl ON dl.incident_id = i.id
      WHERE u.role = 'responder' AND u.is_active = 1
      GROUP BY u.id, u.full_name
      ORDER BY resolved DESC`, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
