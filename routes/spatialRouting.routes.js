const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/spatialRouting.controller');
const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware');

// ── Public / authenticated ────────────────────────────────────────────────────

// Compute / retrieve sea routes
router.post('/route',        authenticate, ctrl.computeRoute);
router.post('/multi-route',  authenticate, ctrl.computeMultiRoute);
router.post('/jetty',        authenticate, ctrl.computeJetty);
router.get( '/route/:key',   authenticate, ctrl.getRouteByKey);

// Weather + IHO zones (read-only, lightweight)
router.get('/weather',       authenticate, ctrl.getWeather);
router.get('/iho-zones',     authenticate, ctrl.getIhoZones);
router.get('/berth-reports', authenticate, ctrl.getBerthReports);

// Dynamic ORU CAPEX
router.post('/oru-capex',    authenticate, ctrl.getOruCapex);

// ── Admin only ────────────────────────────────────────────────────────────────
router.delete('/cache', authenticate, authorizeRoles('admin'), ctrl.clearCache);

module.exports = router;
