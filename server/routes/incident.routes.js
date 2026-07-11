const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const upload  = require('../middleware/upload');
const {
  getIncidents, getIncidentById, createIncident,
  updateStatus, reclassify, flagFake, unflagFake, assignResponder, getIncidentLogs,
} = require('../controllers/incident.controller');

router.use(auth);

router.get('/',              getIncidents);
router.get('/:id',           getIncidentById);
router.post('/',             upload.array('photos', 5), createIncident);
router.patch('/:id/status',  requireRole('admin', 'responder'), updateStatus);
router.patch('/:id/reclassify', requireRole('admin'), reclassify);
router.patch('/:id/flag-fake',   requireRole('admin', 'responder'), flagFake);
router.patch('/:id/unflag-fake', requireRole('admin'), unflagFake);
router.patch('/:id/assign',  requireRole('admin'), assignResponder);
router.get('/:id/logs',      getIncidentLogs);

module.exports = router;
