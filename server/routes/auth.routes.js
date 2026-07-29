const express = require('express');
const router  = express.Router();
const { login, register, refreshToken, logout, scanId } = require('../controllers/auth.controller');
const upload  = require('../middleware/upload');
const { softAuth } = require('../middleware/auth');

router.post('/login',         login);
router.post('/register',      upload.fields([
  { name: 'id_image', maxCount: 1 },
  { name: 'proof_of_residency', maxCount: 1 },
]), register);
router.post('/ocr-id',        upload.single('id_image'), scanId);
router.post('/refresh-token', refreshToken);
router.post('/logout',        softAuth, logout);

module.exports = router;
