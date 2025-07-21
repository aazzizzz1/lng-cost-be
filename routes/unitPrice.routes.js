const express = require('express');
const router = express.Router();
const controller = require('../controllers/unitPrice.controller');
const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware'); // Authentication and Authorization middleware

// Authenticated users can view unit prices
router.get('/', authenticate, controller.getAllUnitPrices); // Ensures only authenticated users can view unit prices
router.post('/', authenticate, controller.createUnitPrice); // Ensures only authenticated users can create unit prices
router.delete('/', authenticate,controller.deleteAllUnitPrices); // Ensures only authenticated admin users can delete all unit prices
router.get('/unique-fields', authenticate, controller.getUniqueFields); // Fetch unique values for tipe, infrastruktur, and kelompok

// Route to recommend unit prices
router.post('/recommend', authenticate, controller.recommendUnitPrices);

// Only admin can create unit price
// router.post('/', authenticate, authorizeRoles('admin'), controller.createUnitPrice);
//  authenticate, authorizeRoles('admin'),

module.exports = router; // Ensure the router is exported correctly

