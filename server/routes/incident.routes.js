const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const upload  = require('../middleware/upload');
const {
  getIncidents, getIncidentById, createIncident,
  updateStatus, assignResponder, getIncidentLogs,
} = require('../controllers/incident.controller');

router.use(auth);

router.get('/',              getIncidents);
router.get('/:id',           getIncidentById);
router.post('/',             upload.single('photo'), createIncident);
router.patch('/:id/status',  requireRole('admin', 'responder'), updateStatus);
router.patch('/:id/assign',  requireRole('admin'), assignResponder);
router.get('/:id/logs',      getIncidentLogs);

module.exports = router;
