const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { getLocations, updateLocation, getHistory } = require('../controllers/responder.controller');

router.use(auth);

router.get('/locations', requireRole('admin'), getLocations);
router.post('/location',  requireRole('responder'), updateLocation);
router.get('/:id/history', getHistory);

module.exports = router;
