const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validateRegister = require('../middlewares/validateRegister');

router.post('/register', validateRegister, authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

module.exports = router;
