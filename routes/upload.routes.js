const express = require('express');
const uploadMiddleware = require('../middlewares/upload.middleware'); // Middleware for file type validation
const { uploadExcel } = require('../controllers/upload.controller');

const router = express.Router();

router.post('/excel', uploadMiddleware.single('file'), uploadExcel); // Ensures only valid Excel files are uploaded

module.exports = router;
