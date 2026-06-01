const express = require('express');
const router  = express.Router();
const { login, register, refreshToken, logout } = require('../controllers/auth.controller');
const upload  = require('../middleware/upload');

router.post('/login',         login);
router.post('/register',      upload.single('id_image'), register);
router.post('/refresh-token', refreshToken);
router.post('/logout',        logout);

module.exports = router;
