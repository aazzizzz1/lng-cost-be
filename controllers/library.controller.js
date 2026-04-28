const prisma = require('../config/db');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'library');

// ---------- helpers ----------

/** Safely delete a file from disk (ignore ENOENT). */
const deleteFile = (fileName) => {
  if (!fileName) return;
  fs.unlink(path.join(UPLOAD_DIR, fileName), (err) => {
    if (err && err.code !== 'ENOENT') console.error('[Library] deleteFile error:', err.message);
  });
};

/** Parse JSON string or return value as-is. */
const tryParseJson = (value) => {
  if (typeof value === 'string') {
    try { return { ok: true, value: JSON.parse(value) }; } catch { return { ok: false }; }
  }
  return { ok: true, value };
};

// ============================
// LIST / GET
// ============================

/**
 * GET /api/library
 * Query: ?code=LNGBV  (optional filter by category code)
 */
exports.list = async (req, res) => {
  try {
    const { code } = req.query;
    const where = code ? { code: code.toUpperCase() } : undefined;
    const items = await prisma.infraLibrary.findMany({
      where,
      orderBy: [{ code: 'asc' }, { variantKey: 'asc' }],
    });
    res.json(items);
  } catch (err) {
    console.error('[Library] list:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/library/catalog
 * Returns all items grouped by code into categories.
 */
exports.getCatalog = async (req, res) => {
  try {
    const items = await prisma.infraLibrary.findMany({
      orderBy: [{ code: 'asc' }, { variantKey: 'asc' }],
    });
    const grouped = {};
    for (const item of items) {
      if (!grouped[item.code]) {
        grouped[item.code] = {
          code: item.code,
          categoryName: item.categoryName,
          description: item.description,
          items: [],
        };
      }
      grouped[item.code].items.push(item);
    }
    res.json(Object.values(grouped));
  } catch (err) {
    console.error('[Library] getCatalog:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/library/:id
 * Get a single entry by numeric id.
 */
exports.getOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const item = await prisma.infraLibrary.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    console.error('[Library] getOne:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/library/:code/:variantKey
 * Get a single entry by category code + variant key.
 */
exports.getByCodeVariant = async (req, res) => {
  try {
    const { code, variantKey } = req.params;
    const item = await prisma.infraLibrary.findUnique({
      where: { code_variantKey: { code: code.toUpperCase(), variantKey } },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    console.error('[Library] getByCodeVariant:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ============================
// CRUD
// ============================

/**
 * POST /api/library  [admin]
 * Body: { code, categoryName, description?, variantKey, label, params, drawings? }
 */
exports.create = async (req, res) => {
  try {
    const { code, categoryName, description, variantKey, label, params } = req.body;
    if (!code || !categoryName || !variantKey || !label || params === undefined) {
      return res.status(400).json({ error: 'code, categoryName, variantKey, label, params are required' });
    }
    const parsedParams = tryParseJson(params);
    if (!parsedParams.ok) return res.status(400).json({ error: 'params must be valid JSON' });

    const item = await prisma.infraLibrary.create({
      data: {
        code: code.toUpperCase().trim(),
        categoryName: categoryName.trim(),
        description: description || null,
        variantKey: variantKey.trim(),
        label: label.trim(),
        params: parsedParams.value,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Entry with this code + variantKey already exists' });
    console.error('[Library] create:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PUT /api/library/:id  [admin]
 * Update any top-level fields. To update drawings use the /drawings endpoints.
 */
exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const { code, categoryName, description, variantKey, label, params } = req.body;
    const data = {};
    if (code !== undefined) data.code = code.toUpperCase().trim();
    if (categoryName !== undefined) data.categoryName = categoryName.trim();
    if (description !== undefined) data.description = description || null;
    if (variantKey !== undefined) data.variantKey = variantKey.trim();
    if (label !== undefined) data.label = label.trim();
    if (params !== undefined) {
      const p = tryParseJson(params);
      if (!p.ok) return res.status(400).json({ error: 'params must be valid JSON' });
      data.params = p.value;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields to update' });

    const item = await prisma.infraLibrary.update({ where: { id }, data });
    res.json(item);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'code + variantKey already exists' });
    console.error('[Library] update:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * DELETE /api/library/:id  [admin]
 * Deletes the entry and removes all associated image files.
 */
exports.remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const item = await prisma.infraLibrary.findUnique({
      where: { id },
      select: { drawings: true },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });

    const drawings = Array.isArray(item.drawings) ? item.drawings : [];
    for (const d of drawings) deleteFile(d.fileName);

    await prisma.infraLibrary.delete({ where: { id } });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    console.error('[Library] remove:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ============================
// DRAWINGS  (stored as JSONB array in InfraLibrary.drawings)
// imageUrl = "/api/uploads/library/<filename>" served as static file by Express
// ============================

/**
 * GET /api/library/:id/drawings  (public)
 */
exports.listDrawings = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const item = await prisma.infraLibrary.findUnique({ where: { id }, select: { drawings: true } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    const drawings = Array.isArray(item.drawings) ? item.drawings : [];
    res.json(drawings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  } catch (err) {
    console.error('[Library] listDrawings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/library/:id/drawings/:drawKey  (public)
 */
exports.getDrawing = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { drawKey } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const item = await prisma.infraLibrary.findUnique({ where: { id }, select: { drawings: true } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    const drawings = Array.isArray(item.drawings) ? item.drawings : [];
    const drawing = drawings.find((d) => d.drawKey === drawKey);
    if (!drawing) return res.status(404).json({ error: 'Drawing not found' });
    res.json(drawing);
  } catch (err) {
    console.error('[Library] getDrawing:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/library/:id/drawings  [admin]
 * Add or replace a drawing entry by drawKey.
 * Multipart: { drawKey, title, order? } + optional file field `image`
 * JSON:      { drawKey, title, order? }  (no image)
 */
exports.upsertDrawing = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      if (req.file) deleteFile(req.file.filename);
      return res.status(400).json({ error: 'Invalid id' });
    }
    const { drawKey, title, order } = req.body;
    if (!drawKey || !title) {
      if (req.file) deleteFile(req.file.filename);
      return res.status(400).json({ error: 'drawKey and title are required' });
    }

    const item = await prisma.infraLibrary.findUnique({ where: { id }, select: { drawings: true } });
    if (!item) {
      if (req.file) deleteFile(req.file.filename);
      return res.status(404).json({ error: 'Not found' });
    }

    const drawings = Array.isArray(item.drawings) ? [...item.drawings] : [];
    const idx = drawings.findIndex((d) => d.drawKey === drawKey);

    const entry = {
      drawKey: drawKey.trim(),
      title: title.trim(),
      order: order !== undefined ? parseInt(order) : (idx !== -1 ? drawings[idx].order : 0),
      imageUrl: idx !== -1 ? drawings[idx].imageUrl : null,
      fileName: idx !== -1 ? drawings[idx].fileName : null,
      mimeType: idx !== -1 ? drawings[idx].mimeType : null,
    };

    if (req.file) {
      if (idx !== -1 && drawings[idx].fileName) deleteFile(drawings[idx].fileName);
      // Use /api/uploads/library so the path is reachable in production behind a
      // reverse proxy (Apache) that forwards only /api/* to this Node.js process.
      entry.imageUrl = `/api/uploads/library/${req.file.filename}`;
      entry.fileName = req.file.filename;
      entry.mimeType = req.file.mimetype;
    }

    if (idx !== -1) drawings[idx] = entry; else drawings.push(entry);
    drawings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const updated = await prisma.infraLibrary.update({ where: { id }, data: { drawings } });
    res.json(updated);
  } catch (err) {
    if (req.file) deleteFile(req.file.filename);
    console.error('[Library] upsertDrawing:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * DELETE /api/library/:id/drawings/:drawKey  [admin]
 * Remove a drawing entry and its image file.
 */
exports.removeDrawing = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { drawKey } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const item = await prisma.infraLibrary.findUnique({ where: { id }, select: { drawings: true } });
    if (!item) return res.status(404).json({ error: 'Not found' });

    const drawings = Array.isArray(item.drawings) ? [...item.drawings] : [];
    const idx = drawings.findIndex((d) => d.drawKey === drawKey);
    if (idx === -1) return res.status(404).json({ error: `Drawing '${drawKey}' not found` });

    deleteFile(drawings[idx].fileName);
    drawings.splice(idx, 1);

    const updated = await prisma.infraLibrary.update({ where: { id }, data: { drawings } });
    res.json(updated);
  } catch (err) {
    console.error('[Library] removeDrawing:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * DELETE /api/library/:id/drawings/:drawKey/image  [admin]
 * Delete only the image file; keep the drawing entry.
 */
exports.removeDrawingImage = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { drawKey } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const item = await prisma.infraLibrary.findUnique({ where: { id }, select: { drawings: true } });
    if (!item) return res.status(404).json({ error: 'Not found' });

    const drawings = Array.isArray(item.drawings) ? [...item.drawings] : [];
    const idx = drawings.findIndex((d) => d.drawKey === drawKey);
    if (idx === -1) return res.status(404).json({ error: `Drawing '${drawKey}' not found` });

    deleteFile(drawings[idx].fileName);
    drawings[idx] = { ...drawings[idx], imageUrl: null, fileName: null, mimeType: null };

    const updated = await prisma.infraLibrary.update({ where: { id }, data: { drawings } });
    res.json(updated);
  } catch (err) {
    console.error('[Library] removeDrawingImage:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
