const express = require('express');
const router = express.Router();
const controller = require('../controllers/constructionCost.controller');

router.post('/', controller.createConstructionCost);
router.get('/', controller.getAllConstructionCosts);

module.exports = router;
