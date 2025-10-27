const express = require('express');
const router = express.Router();
const controller = require('../controllers/cci.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

router.post('/', controller.createCCI);
router.get('/', controller.getAllCCI);
router.get('/:id', controller.getCCIById);
router.put('/:id', controller.updateCCI);
router.delete('/:id', controller.deleteCCI);

module.exports = router;
