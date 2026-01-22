const prisma = require('../config/db');
const { runSupplyChainModel } = require('../services/supplychainEngine');

async function run(req, res) {
  try {
    const runKey = req.runKey;
    const { terminal, locations, params, demand } = req.body;
    // check cache
    const cached = await prisma.supplyChainRun.findUnique({ where: { runKey } });
    if (cached) {
      await prisma.supplyChainRun.update({
        where: { runKey },
        data: { reuseCount: cached.reuseCount + 1 },
      });
      return res.json({ runKey, cached: true, results: cached.results, topResult: cached.topResult });
    }

    // load datasets
    const vessels = await prisma.vessel.findMany();
    const routes = await prisma.distanceRoute.findMany();
    const oru = await prisma.oruCapex.findMany();

    // compute
    const baseYear = req.body.base_year ?? 2022;
    const inflationFactor = Math.pow(1 + params.inflation_rate, params.analysis_year - baseYear);
    const results = await runSupplyChainModel({
      vessels,
      routes,
      oru,
      terminal,
      selectedLocations: locations,
      demandBBTUD: demand,
      params,
      inflationFactor,
    });

    const sorted = [...results].sort((a, b) => a['Total Cost USD/MMBTU'] - b['Total Cost USD/MMBTU']);
    const topResult = sorted[0] || null;

    await prisma.supplyChainRun.create({
      data: {
        runKey,
        terminal,
        locations,
        params,
        demand,
        results,
        topResult,
      },
    });

    return res.json({ runKey, cached: false, results, topResult });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Engine error', detail: e.message });
  }
}

async function getByKey(req, res) {
  try {
    const runKey = req.params.runKey;
    const cached = await prisma.supplyChainRun.findUnique({ where: { runKey } });
    if (!cached) return res.status(404).json({ error: 'Not found' });
    return res.json({ runKey, cached: true, results: cached.results, topResult: cached.topResult });
  } catch (e) {
    return res.status(500).json({ error: 'Fetch error', detail: e.message });
  }
}

module.exports = { run, getByKey };
