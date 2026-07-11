const db = require('../config/db');

exports.getPuroks = async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM puroks ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createPurok = async (req, res) => {
  try {
    const { name, barangay } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Purok name is required' });

    const [[{ next_id }]] = await db.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM puroks');
    await db.query(
      'INSERT INTO puroks (id, name, barangay) VALUES (?, ?, ?)',
      [next_id, name.trim(), barangay?.trim() || 'Barangay Manay']
    );
    res.status(201).json({ message: 'Purok added', id: next_id });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updatePurok = async (req, res) => {
  try {
    const { name, barangay } = req.body;
    const updates = [], params = [];
    if (name !== undefined)     { updates.push('name = ?');     params.push(name.trim()); }
    if (barangay !== undefined) { updates.push('barangay = ?'); params.push(barangay.trim()); }
    if (!updates.length) return res.status(400).json({ message: 'No fields to update' });
    params.push(req.params.id);
    await db.query(`UPDATE puroks SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Purok updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.deletePurok = async (req, res) => {
  try {
    const id = req.params.id;
    const [[{ userCount }]]     = await db.query('SELECT COUNT(*) AS userCount FROM users WHERE purok_id = ?', [id]);
    const [[{ incidentCount }]] = await db.query('SELECT COUNT(*) AS incidentCount FROM incidents WHERE purok_id = ?', [id]);
    const [[{ blotterCount }]]  = await db.query('SELECT COUNT(*) AS blotterCount FROM blotter_entries WHERE purok_id = ?', [id]);
    if (userCount > 0 || incidentCount > 0 || blotterCount > 0) {
      return res.status(409).json({
        message: `Cannot delete — ${userCount} resident(s), ${incidentCount} incident(s), and ${blotterCount} blotter entry(ies) still reference this purok. Reassign them first.`,
      });
    }
    await db.query('DELETE FROM puroks WHERE id = ?', [id]);
    res.json({ message: 'Purok deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
