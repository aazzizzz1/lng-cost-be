const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/mooring.controller');
const { createOrUpdateRules, handleValidation } = require('../middlewares/mooring.middleware');

// Get the single settings (create defaults if missing)
router.get('/settings', ctrl.getSetting);

// Update the single settings
router.patch('/settings', createOrUpdateRules, handleValidation, ctrl.updateSetting);

module.exports = router;
