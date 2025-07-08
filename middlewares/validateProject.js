const { body } = require('express-validator');

exports.validateProject = [
  body('name').notEmpty().withMessage('Name is required'),
  body('jenis').notEmpty().withMessage('Jenis is required'),
  body('kategori').notEmpty().withMessage('Kategori is required'),
  body('lokasi').notEmpty().withMessage('Lokasi is required'),
  body('tahun').isInt({ min: 1900 }).withMessage('Valid year required'),
  body('levelAACE').isInt({ min: 1, max: 5 }).withMessage('AACE level must be between 1 and 5'),
  body('harga').isFloat().withMessage('Harga must be a number'),
];
