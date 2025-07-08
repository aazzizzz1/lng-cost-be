const express = require('express');
const router = express.Router();
const controller = require('../controllers/unitPrice.controller');

router.post('/', controller.createUnitPrice);
router.get('/', controller.getAllUnitPrices);

module.exports = router;
