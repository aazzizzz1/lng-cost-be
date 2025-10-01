const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const limiter = (max) =>
  rateLimit({
    windowMs: 30 * 60 * 1000, // 30 minutes
    max,
    message: { error: 'Too many requests, please try again later' },
  });

// admin guard
const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

router.post('/register', limiter(5), authController.register);
router.post('/login', limiter(10), authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.get('/user/:id', authenticate, authController.getUserById);
router.get('/me', authenticate, authController.me); // NEW: fetch current user
router.get(
  '/validate-token',
  authenticate,
  (req, res, next) => {
    res.set('Cache-Control', 'no-store'); // Prevent caching of token validation responses
    next();
  },
  authController.validateToken
);
router.get('/users', authenticate, authorizeAdmin, authController.getAllUsers);
router.patch('/users/:id', authenticate, authorizeAdmin, authController.updateUser);
// Add PUT alias so clients that use PUT won't get 404
router.put('/users/:id', authenticate, authorizeAdmin, authController.updateUser);
router.delete('/users/:id', authenticate, authorizeAdmin, authController.deleteUser);

module.exports = router;
