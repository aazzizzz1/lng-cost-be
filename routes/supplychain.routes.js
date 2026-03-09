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

// Risk section descriptions (II.1 - II.8)
router.get('/risk-sections', (req, res) => {
  res.json([
    {
      code: 'II.1',
      title: 'Pemuatan LNG',
      description: '1. LNG yang disimpan dalam tangki penyimpanan dipompa ke dermaga produk. 2. Di dermaga, LNG dimuat ke kapal LNG untuk diekspor. 3. BOG yang terbentuk dikapal dikirim kembali ke Kilang LNG.',
    },
    {
      code: 'II.2',
      title: 'Aktivitas kapal sandar & lepas sandar (loading)',
      description: 'Aktifitas kapal meliputi kegiatan (a) sandar ke dermaga dan (b) lepas sandar dengan tahapan mengubah cekungan (turning basins), berlabuh, persiapan untuk bongkar muat, dan keberangkatan.',
    },
    {
      code: 'II.3',
      title: 'Pengiriman LNG',
      description: '1. Kapal bermuatan LNG berlayar dari LNG Plant ke terminal penerima LNG. 2. Kapal/truk mengangkut LNG dari terminal LNG pertama ke terminal LNG berikutnya.',
    },
    {
      code: 'II.4',
      title: 'Pembongkaran LNG',
      description: '1. Mengeluarkan LNG dari kapal menggunakan pompa kapal dan loading arm (lengan bongkar) di dermaga. 2. Mengembalikan Boil of Gas (BOG) kembali ke tanki kapal menjaga tekanan tanki 8 - 10 Kpa.',
    },
    {
      code: 'II.5',
      title: 'Pembongkaran LNG (sandar & lepas sandar)',
      description: 'Aktifitas kapal meliputi kegiatan (a) sandar ke dermaga dan (b) lepas sandar dengan tahapan mengubah cekungan (turning basins), berlabuh, persiapan untuk bongkar muat, dan keberangkatan.',
    },
    {
      code: 'II.6',
      title: 'Penyimpanan LNG',
      description: 'Menyimpan LNG dalam tanki penyimpan darat LNG.',
    },
    {
      code: 'II.7',
      title: 'Regasifikasi LNG',
      description: 'LNG dinaikan tekanan menggunakan pompa dalam tanki, kemudian dirubah menjadi gas dengan dipanaskan menggunakan media pemanas seperti air laut, air panas, udara.',
    },
    {
      code: 'II.8',
      title: 'Distribusi gas',
      description: '1. Penambahan pembau (odorant) pada gas. 2. Pengiriman gas menuju ke pelanggan/pembangkit listrik melalui pipa.',
    },
  ]);
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
