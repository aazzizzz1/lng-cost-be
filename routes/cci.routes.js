const express = require('express');
const router = express.Router();
const controller = require('../controllers/cci.controller');
const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware');

// Only admin can manage CCI data
router.post('/', authenticate, authorizeRoles('admin'), controller.createCCI);
router.get('/', authenticate, controller.getAllCCI);

module.exports = router;
