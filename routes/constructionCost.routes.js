const express = require('express');
const router = express.Router();
const controller = require('../controllers/constructionCost.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Authenticated users can view construction costs
router.get('/', authenticate, controller.getAllConstructionCosts);
router.post('/', authenticate, controller.createConstructionCost);

// Only admin can create construction cost
// router.post('/', authenticate, authorizeRoles('admin'), controller.createConstructionCost);

module.exports = router;
