const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const {
  getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  getEmergencyContacts, createEmergencyContact, updateEmergencyContact,
} = require('../controllers/announcement.controller');

// Emergency contacts — specific routes must be before /:id
router.get('/emergency-contacts',      getEmergencyContacts);
router.post('/emergency-contacts',     auth, requireRole('admin'), createEmergencyContact);
router.put('/emergency-contacts/:id',  auth, requireRole('admin'), updateEmergencyContact);

// Announcements
router.get('/',      auth, getAnnouncements);
router.post('/',     auth, requireRole('admin'), createAnnouncement);
router.patch('/:id', auth, requireRole('admin'), updateAnnouncement);
router.delete('/:id',auth, requireRole('admin'), deleteAnnouncement);

module.exports = router;
