const router = require('express').Router();
const ctrl = require('../controllers/jettyDolphin.controller');
const mw = require('../middlewares/jettyDolphin.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

// ── Calculation endpoints ──────────────────────────────
router.post('/calculate', authenticate, mw.validateCalculation, ctrl.calculate);
router.get('/calculations', authenticate, ctrl.getAll);
router.get('/calculations/:id', authenticate, mw.validateIdParam, ctrl.getById);
router.delete('/calculations/:id', authenticate, mw.validateIdParam, ctrl.deleteById);
router.get('/calculations/project/:projectId', authenticate, ctrl.getByProject);

// ── Lookup / reference data ────────────────────────────
router.get('/settings', authenticate, ctrl.getSettings);
router.patch('/settings/:key', authenticate, ctrl.updateSetting);
router.get('/cb-defaults', authenticate, ctrl.getCbDefaults);
router.get('/berthing-velocities', authenticate, ctrl.getBerthingVelocities);
router.get('/fender-catalog', authenticate, ctrl.getFenderCatalog);
router.get('/pile-catalog', authenticate, ctrl.getPileCatalog);
router.get('/qrh-catalog', authenticate, ctrl.getQrhCatalog);
router.get('/unit-rates', authenticate, ctrl.getUnitRates);
router.patch('/unit-rates/:rateId', authenticate, ctrl.updateUnitRate);

module.exports = router;
