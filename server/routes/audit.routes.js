const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { getAuditLogs } = require('../controllers/audit.controller');

router.get('/', auth, requireRole('admin'), getAuditLogs);

module.exports = router;
