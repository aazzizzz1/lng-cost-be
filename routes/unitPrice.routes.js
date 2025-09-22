const express = require('express');
const router = express.Router();
const controller = require('../controllers/unitPrice.controller');
const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware'); // Authentication and Authorization middleware

// Filtered + paginated
router.get('/', controller.getAllUnitPrices);
// Get all (no filters/pagination)
router.get('/all', controller.getAllUnitPricesAll);

router.post('/', controller.createUnitPrice); // Ensures only authenticated users can create unit prices
router.delete('/',controller.deleteAllUnitPrices); // Ensures only authenticated admin users can delete all unit prices
router.get('/unique-fields', controller.getUniqueFields); // Fetch unique values for tipe, infrastruktur, and kelompok

// Route to recommend unit prices
router.post('/recommend', controller.recommendUnitPrices);

// Endpoint untuk chart diagram unit price per infrastruktur
router.get('/chart-data', controller.getUnitPriceChartData);

// Route untuk unique infrastruktur, volume, proyek
router.get('/unique-infrastruktur-proyek', controller.getUniqueInfrastrukturAndProyek);

// New route for best price recommendation per workcode
router.get('/best-prices', controller.getBestPricesByWorkcode);

// NEW: update unit price + sync construction costs in the same project
router.put('/:id', controller.updateUnitPrice);

// Only admin can create unit price
// router.post('/', authenticate, authorizeRoles('admin'), controller.createUnitPrice);
//  authenticate, authorizeRoles('admin'),

module.exports = router; // Ensure the router is exported correctly

