const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const {
  getUsers, getUserById, createUser, updateUser, deleteUser, verifyUser, rejectUser,
} = require('../controllers/admin.controller');

router.use(auth, requireRole('admin'));

router.get('/users',             getUsers);
router.get('/users/:id',         getUserById);
router.post('/users',            createUser);
router.patch('/users/:id',       updateUser);
router.delete('/users/:id',      deleteUser);
router.patch('/users/:id/verify', verifyUser);
router.patch('/users/:id/reject', rejectUser);

module.exports = router;
