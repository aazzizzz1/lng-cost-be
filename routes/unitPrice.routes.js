const express = require('express');
const router = express.Router();
const controller = require('../controllers/unitPrice.controller');
const { authenticate } = require('../middlewares/auth.middleware'); // Authentication middleware

// Authenticated users can view unit prices
router.get('/', authenticate, controller.getAllUnitPrices); // Ensures only authenticated users can view unit prices
router.post('/', authenticate, controller.createUnitPrice); // Ensures only authenticated users can create unit prices

// Only admin can create unit price
// router.post('/', authenticate, authorizeRoles('admin'), controller.createUnitPrice);

module.exports = router;
