const express = require('express');
const router = express.Router();
const controller = require('../controllers/cci.controller');
const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware');

// Only admin can manage CCI data
router.post('/', authorizeRoles('admin'), controller.createCCI);
router.get('/', controller.getAllCCI);

module.exports = router;
