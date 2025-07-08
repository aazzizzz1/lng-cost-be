const express = require('express');
const router = express.Router();
const controller = require('../controllers/unitPrice.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Authenticated users can view unit prices
router.get('/', authenticate, controller.getAllUnitPrices);
router.post('/', authenticate, controller.createUnitPrice);

// Only admin can create unit price
// router.post('/', authenticate, authorizeRoles('admin'), controller.createUnitPrice);

module.exports = router;
