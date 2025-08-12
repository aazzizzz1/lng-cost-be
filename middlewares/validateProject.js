const { body } = require('express-validator');

exports.validateProject = [
  body('name').notEmpty().withMessage('Name is required'), // Validates required fields
  body('infrastruktur').notEmpty().withMessage('Infrastruktur is required'), // Replace jenis with infrastruktur
  body('lokasi').notEmpty().withMessage('Lokasi is required'),
  body('tahun').isInt({ min: 1900 }).withMessage('Valid year required'), // Validates numeric fields
  body('levelAACE').isInt({ min: 1, max: 5 }).withMessage('AACE level must be between 1 and 5'),
  body('harga').isFloat().withMessage('Harga must be a number'),
  body('volume').isFloat({ min: 0 }).withMessage('Volume must be a positive number'),
  body('inflasi').optional().isFloat({ min: 0 }).withMessage('Inflasi must be a positive number'),
];
