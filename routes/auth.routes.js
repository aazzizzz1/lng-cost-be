const express = require('express');
const rateLimit = require('express-rate-limit'); // Rate limiting middleware
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validateRegister = require('../middlewares/validateRegister'); // Input validation middleware
const { authenticate, isAdmin } = require('../middlewares/auth.middleware'); // Authentication and role-based access control

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per windowMs
  message: { error: 'Too many login attempts, please try again later' },
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 register attempts per windowMs
  message: { error: 'Too many registration attempts, please try again later' },
});

router.post('/register', registerLimiter, validateRegister, authController.register); // Apply rate limiting to register
router.post('/login', loginLimiter, authController.login); // Apply rate limiting to login
router.post('/refresh-token', authController.refreshToken); // Refreshes tokens securely
router.post('/logout', authController.logout); // Handles secure logout
// Get user by ID → bisa diakses oleh user itu sendiri atau admin
router.get('/user/:id', authenticate, authController.getUserById); // Ensures only authenticated users can access user details
router.get('/validate-token', authController.validateToken); // Validates accessToken

module.exports = router;
