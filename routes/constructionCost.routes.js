const express = require('express');
const router = express.Router();
const controller = require('../controllers/constructionCost.controller');
const { authenticate } = require('../middlewares/auth.middleware'); // Authentication middleware

// Authenticated users can view construction costs
router.get('/', controller.getAllConstructionCosts); // Ensures only authenticated users can view construction costs
router.post('/', controller.createConstructionCost); // Ensures only authenticated users can create construction costs

// Route to fetch construction costs based on filters
router.get('/filter', controller.getFilteredConstructionCosts);

// Unique infrastruktur/tipe/volume
router.get('/unique-infrastruktur', controller.getUniqueInfrastruktur);

// NEW: update construction cost + sync related UnitPrice in the same project
router.put('/:id', controller.updateConstructionCost);

// NEW: delete construction cost + recalc project totals
router.delete('/:id', controller.deleteConstructionCost);

module.exports = router;
