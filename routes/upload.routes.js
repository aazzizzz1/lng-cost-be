const express = require('express');
const uploadMiddleware = require('../middlewares/upload.middleware');
const { uploadExcel } = require('../controllers/upload.controller');

const router = express.Router();

router.post('/excel', uploadMiddleware.single('file'), uploadExcel);

module.exports = router;
