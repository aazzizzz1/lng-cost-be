const express = require('express');
const router = express.Router();
const controller = require('../controllers/constructionCost.controller');
const { authenticate } = require('../middlewares/auth.middleware'); // Authentication middleware

// Authenticated users can view construction costs
router.get('/', authenticate, controller.getAllConstructionCosts); // Ensures only authenticated users can view construction costs
router.post('/', authenticate, controller.createConstructionCost); // Ensures only authenticated users can create construction costs

// Only admin can create construction cost
// router.post('/', authenticate, authorizeRoles('admin'), controller.createConstructionCost);

module.exports = router;
