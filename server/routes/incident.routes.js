const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const upload  = require('../middleware/upload');
const {
  getIncidents, getIncidentById, createIncident,
  updateStatus, reclassify, flagFake, unflagFake, flagSpam, getDuplicates,
  assignResponder, getIncidentLogs, askUpdate,
} = require('../controllers/incident.controller');

router.use(auth);

router.get('/',              getIncidents);
router.get('/:id',           getIncidentById);
router.get('/:id/duplicates', getDuplicates);
router.post('/',             upload.array('photos', 5), createIncident);
router.patch('/:id/status',     requireRole('admin', 'responder'), updateStatus);
router.patch('/:id/reclassify', requireRole('admin'), reclassify);
router.patch('/:id/flag-fake',   requireRole('admin', 'responder'), flagFake);
router.patch('/:id/unflag-fake', requireRole('admin'), unflagFake);
router.patch('/:id/flag-spam',   requireRole('admin', 'responder'), flagSpam);
router.patch('/:id/assign',      requireRole('admin'), assignResponder);
router.post('/:id/ask-update',   requireRole('admin'), askUpdate);
router.get('/:id/logs',      getIncidentLogs);

module.exports = router;
