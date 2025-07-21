const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const limiter = (max) =>
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max,
    message: { error: 'Too many requests, please try again later' },
  });

router.post('/register', limiter(5), authController.register);
router.post('/login', limiter(10), authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.get('/user/:id', authenticate, authController.getUserById);
router.get('/validate-token', authenticate, (req, res, next) => {
  res.set('Cache-Control', 'no-store'); // Prevent caching of token validation responses
  next();
}, authController.validateToken);

module.exports = router;
router.post('/refresh-token', authController.refreshToken); // Refreshes tokens securely
router.post('/logout', authController.logout); // Handles secure logout
// Get user by ID → bisa diakses oleh user itu sendiri atau admin
router.get('/user/:id', authenticate, authController.getUserById); // Ensures only authenticated users can access user details
router.get('/validate-token', authController.validateToken); // Validates accessToken

module.exports = router;
