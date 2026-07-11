const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const {
  getEntries, getEntryById, createEntry, updateEntry, updateStatus,
} = require('../controllers/blotter.controller');

// Blotter entries are formal barangay complaint records filed by staff —
// admin-only, and intentionally no delete route (see updateStatus's
// "Voided" status for retracting an entry without erasing its history).
router.use(auth, requireRole('admin'));

router.get('/',             getEntries);
router.get('/:id',          getEntryById);
router.post('/',            createEntry);
router.patch('/:id',        updateEntry);
router.patch('/:id/status', updateStatus);

module.exports = router;
