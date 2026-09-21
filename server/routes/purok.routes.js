const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { getPuroks, createPurok, updatePurok, deletePurok } = require('../controllers/purok.controller');

// Public read — needed on the unauthenticated registration page.
router.get('/', getPuroks);

router.post('/',       auth, requireRole('admin'), createPurok);
router.patch('/:id',   auth, requireRole('admin'), updatePurok);
router.delete('/:id',  auth, requireRole('admin'), deletePurok);

module.exports = router;
