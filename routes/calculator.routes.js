const express = require('express');
const router = express.Router();
const controller = require('../controllers/calculator.controller');
const { validateTotalCostInput } = require('../middlewares/calculator.middleware');
const multer = require('multer');
const upload = multer();

// GET all total costs
router.get('/total-cost', controller.getAllTotalCosts);

// POST a new total cost
router.post('/total-cost', validateTotalCostInput, controller.createTotalCost);

// Upload Excel for calculator total cost
router.post('/total-cost/upload', upload.single('file'), controller.uploadCalculatorExcel);

// DELETE all total costs
router.delete('/total-cost', controller.deleteAllTotalCosts);

// Kalkulasi estimasi cost dengan 3 metode
router.post('/estimate', controller.estimateCost);

module.exports = router;
