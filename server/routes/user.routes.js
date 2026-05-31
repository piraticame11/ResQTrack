const express    = require('express');
const router     = express.Router();
const { auth }   = require('../middleware/auth');
const upload     = require('../middleware/upload');
const ctrl       = require('../controllers/user.controller');

router.get('/profile',          auth,                          ctrl.getProfile);
router.patch('/profile',        auth,                          ctrl.updateProfile);
router.post('/profile/photo',   auth, upload.single('photo'),  ctrl.updatePhoto);

module.exports = router;
