const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validateRegister = require('../middlewares/validateRegister');
const { authenticate, isAdmin } = require('../middlewares/auth.middleware');

router.post('/register', validateRegister, authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
// Get user by ID (only admin can access)
// router.get('/user/:id', authenticate, isAdmin, authController.getUserById);

// Get user by ID → bisa diakses oleh user itu sendiri atau admin
router.get('/user/:id', authenticate, authController.getUserById);

module.exports = router;
