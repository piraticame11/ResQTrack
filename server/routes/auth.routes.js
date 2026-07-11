const express = require('express');
const router  = express.Router();
const { login, register, refreshToken, logout } = require('../controllers/auth.controller');
const upload  = require('../middleware/upload');
const { softAuth } = require('../middleware/auth');

router.post('/login',         login);
router.post('/register',      upload.single('id_image'), register);
router.post('/refresh-token', refreshToken);
router.post('/logout',        softAuth, logout);

module.exports = router;
