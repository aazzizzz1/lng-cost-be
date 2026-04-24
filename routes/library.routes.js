const express = require('express');
const router = express.Router();

const { authenticate, isAdmin } = require('../middlewares/auth.middleware');
const libraryUpload = require('../middlewares/library.middleware');
const ctrl = require('../controllers/library.controller');

// ============================
// READ — public
// ============================

// GET /api/library/catalog               — all items grouped by code
router.get('/catalog', ctrl.getCatalog);

// GET /api/library/:code/:variantKey      — e.g. /LNGBV/5k
router.get('/:code/:variantKey', ctrl.getByCodeVariant);

// GET /api/library/:id                    — by numeric id
router.get('/:id', ctrl.getOne);

// GET /api/library?code=LNGBV             — flat list, optional code filter
router.get('/', ctrl.list);

// ============================
// CRUD — admin only
// ============================

// POST /api/library
router.post('/', authenticate, isAdmin, ctrl.create);

// PUT /api/library/:id
router.put('/:id', authenticate, isAdmin, ctrl.update);

// DELETE /api/library/:id
router.delete('/:id', authenticate, isAdmin, ctrl.remove);

// ============================
// DRAWINGS (within each row) — admin only
// ============================

// GET  /api/library/:id/drawings              — list drawings (public)
router.get('/:id/drawings', ctrl.listDrawings);

// GET  /api/library/:id/drawings/:drawKey     — single drawing (public)
router.get('/:id/drawings/:drawKey', ctrl.getDrawing);

// DELETE before POST so /drawings/:drawKey/image isn't swallowed by /drawings
router.delete('/:id/drawings/:drawKey/image', authenticate, isAdmin, ctrl.removeDrawingImage);
router.delete('/:id/drawings/:drawKey', authenticate, isAdmin, ctrl.removeDrawing);

// POST /api/library/:id/drawings              — add/replace drawing (admin, optional upload)
router.post(
  '/:id/drawings',
  authenticate,
  isAdmin,
  libraryUpload.single('image'),
  ctrl.upsertDrawing,
);

module.exports = router;
