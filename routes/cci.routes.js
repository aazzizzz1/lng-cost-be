const express = require('express');
const router = express.Router();
const controller = require('../controllers/cci.controller');
const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware');

// NEW: protect all CCI routes for admin
router.use(authenticate, authorizeRoles('admin'));

router.post('/', controller.createCCI);
router.get('/', controller.getAllCCI);
router.get('/:id', controller.getCCIById);
router.put('/:id', controller.updateCCI);
router.delete('/:id', controller.deleteCCI);

module.exports = router;
