const express = require('express');
const router = express.Router();
const { validateSupplyChainInput } = require('../middlewares/supplychain.middleware');
const runCtrl = require('../controllers/supplychainRun.controller');
const scenCtrl = require('../controllers/supplychainScenario.controller');
const prisma = require('../config/db');

// Create/Update scenario → return runKey
router.post('/scenario', validateSupplyChainInput, scenCtrl.upsertScenario);

// Unified run: single or twin based on body.twin
router.post('/run', validateSupplyChainInput, runCtrl.runUnified);

// Get cached run by key
router.get('/run/:runKey', runCtrl.getByKey);

// Optional helpers to inspect base datasets
router.get('/vessels', async (req, res) => res.json(await prisma.vessel.findMany()));
router.get('/routes', async (req, res) => res.json(await prisma.distanceRoute.findMany()));
router.get('/oru', async (req, res) => res.json(await prisma.oruCapex.findMany()));

// REPLACED: single endpoint for terminals + locations with coordinates
router.get('/places', async (req, res) => {
  const [locRows, distRows] = await Promise.all([
    prisma.location.findMany(),
    prisma.distanceRoute.findMany(),
  ]);

  const locMap = new Map(locRows.map(l => [l.name, l]));
  const uniqueNames = new Set();
  for (const r of distRows) {
    uniqueNames.add(r.origin);
    uniqueNames.add(r.destination);
  }

  const merged = Array.from(uniqueNames).map(name => {
    const l = locMap.get(name);
    return {
      name,
      type: l?.type || (name.includes('Badak NGL') ? 'terminal' : 'plant'),
      latitude: l?.latitude ?? null,
      longitude: l?.longitude ?? null,
    };
  });

  // ensure seeded Location rows also included
  for (const l of locRows) {
    if (!uniqueNames.has(l.name)) {
      merged.push({
        name: l.name,
        type: l.type,
        latitude: l.latitude ?? null,
        longitude: l.longitude ?? null,
      });
    }
  }

  res.json(merged);
});

// NEW: RiskMatrix list (for dynamic frontend)
router.get('/risk-matrix', async (req, res) => {
  try {
    const rows = await prisma.riskMatrix.findMany({ orderBy: { riskCode: 'asc' } });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'RiskMatrix fetch error', detail: e.message });
  }
});

// NEW: RiskMatrix by code
router.get('/risk-matrix/:riskCode', async (req, res) => {
  try {
    const row = await prisma.riskMatrix.findUnique({ where: { riskCode: req.params.riskCode } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'RiskMatrix fetch error', detail: e.message });
  }
});

module.exports = router;
