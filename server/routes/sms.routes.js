const express = require('express');
const router  = express.Router();
const { inbound } = require('../controllers/sms.controller');

// Public — called by the SMS gateway's webhook, not the browser. Protected
// by SMS_WEBHOOK_SECRET (see sms.controller.js) instead of user auth.
router.post('/inbound', inbound);

module.exports = router;
