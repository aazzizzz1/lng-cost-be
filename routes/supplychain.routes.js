const express = require('express');
const router = express.Router();
const { validateSupplyChainInput } = require('../middlewares/supplychain.middleware');
const runCtrl = require('../controllers/supplychainRun.controller');
const scenCtrl = require('../controllers/supplychainScenario.controller');
const prisma = require('../config/db');
const { RISK_SECTION_DETAILS } = require('../services/supplychainEngine');

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

router.get('/places/catalog', async (req, res) => {
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

  const places = Array.from(uniqueNames).map(name => {
    const l = locMap.get(name);
    return {
      name,
      type: l?.type || (name.includes('Badak NGL') ? 'terminal' : 'plant'),
      latitude: l?.latitude ?? null,
      longitude: l?.longitude ?? null,
    };
  });

  for (const l of locRows) {
    if (!uniqueNames.has(l.name)) {
      places.push({
        name: l.name,
        type: l.type,
        latitude: l.latitude ?? null,
        longitude: l.longitude ?? null,
      });
    }
  }

  res.json({
    places,
    terminals: places.filter((place) => place.type === 'terminal'),
    demands: places.filter((place) => place.type !== 'terminal'),
  });
});

// Risk section descriptions (II.1 - II.8)
router.get('/risk-sections', (req, res) => {
  res.json(Object.values(RISK_SECTION_DETAILS));
});

router.get('/risk-matrix/sections', async (req, res) => {
  try {
    const rows = await prisma.riskMatrix.findMany({ orderBy: { riskCode: 'asc' } });
    const groups = Object.values(RISK_SECTION_DETAILS).map((section) => ({
      ...section,
      risks: rows.map((row) => {
        const impacts = Object.fromEntries(
          Object.entries(row.values || {})
            .filter(([key]) => key.startsWith(`${section.code} `))
            .map(([key, value]) => [key.replace(`${section.code} `, ''), value])
        );

        return {
          riskCode: row.riskCode,
          variable: row.variable,
          impacts,
        };
      }).filter((risk) => Object.keys(risk.impacts).length > 0),
    }));

    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: 'RiskMatrix section fetch error', detail: e.message });
  }
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
