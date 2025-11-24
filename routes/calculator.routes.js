const express = require('express');
const router = express.Router();
const controller = require('../controllers/calculator.controller');
const { validateTotalCostInput, validateTotalCostUpdate } = require('../middlewares/calculator.middleware');
const multer = require('multer');
const upload = multer();

// GET all total costs
router.get('/total-cost', controller.getAllTotalCosts);

// GET a specific total cost by ID
router.get('/total-cost/:id', controller.getTotalCostById);

// POST a new total cost
router.post('/total-cost', validateTotalCostInput, controller.createTotalCost);

// Upload Excel for calculator total cost
router.post('/total-cost/upload', upload.single('file'), controller.uploadCalculatorExcel);

// DELETE all total costs
router.delete('/total-cost', controller.deleteAllTotalCosts);

// DELETE a specific total cost by ID
router.delete('/total-cost/:id', controller.deleteTotalCostById);

// Kalkulasi estimasi cost dengan 3 metode
router.post('/estimate', controller.estimateCost);

// PUT a specific total cost by ID
router.put('/total-cost/:id', validateTotalCostUpdate, controller.updateTotalCostById);

module.exports = router;
