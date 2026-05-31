const express = require('express');
const router  = express.Router();
const { login, register, refreshToken, logout } = require('../controllers/auth.controller');

router.post('/login',         login);
router.post('/register',      register);
router.post('/refresh-token', refreshToken);
router.post('/logout',        logout);

module.exports = router;
