const prisma = require('../config/db');
const { runSupplyChainModel, runTwoVesselProbabilityModel } = require('../services/supplychainEngine');

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

// NEW: twin vessels probability run
async function runTwin(req, res) {
  try {
    const runKey = req.runKey;
    const { terminal, locations, params, demand, twin } = req.body;

    // check cache
    const cached = await prisma.supplyChainRun.findUnique({ where: { runKey } });
    if (cached) {
      await prisma.supplyChainRun.update({
        where: { runKey },
        data: { reuseCount: cached.reuseCount + 1 },
      });
      return res.json({ runKey, cached: true, twin: true, results: cached.results, topResult: cached.topResult });
    }

    // load datasets
    const [vessels, routes, oru] = await Promise.all([
      prisma.vessel.findMany(),
      prisma.distanceRoute.findMany(),
      prisma.oruCapex.findMany(),
    ]);

    const baseYear = req.body.base_year ?? 2022;
    const inflationFactor = Math.pow(1 + params.inflation_rate, params.analysis_year - baseYear);

    const twinCfg = {
      ratios: (twin && Array.isArray(twin.ratios)) ? twin.ratios : ['50:50','60:40','70:30','80:20','90:10'],
      enforceSameVessel: twin ? !!twin.enforceSameVessel : true,
      vesselNames: twin && Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
      shareTerminalORU: twin ? !!twin.shareTerminalORU : true,
    };

    const { kapal_1, kapal_2, total } = await runTwoVesselProbabilityModel({
      vessels, routes, oru, terminal,
      selectedLocations: locations, demandBBTUD: demand,
      params, inflationFactor,
      ...twinCfg,
    });

    const topResult = total[0] || null;

    await prisma.supplyChainRun.create({
      data: {
        runKey,
        terminal,
        locations,
        params,
        demand,
        results: { kapal_1, kapal_2, total },
        topResult,
      },
    });

    return res.json({ runKey, cached: false, twin: true, results: { kapal_1, kapal_2, total }, topResult });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Engine twin error', detail: e.message });
  }
}

async function runUnified(req, res) {
  try {
    const runKey = req.runKey;
    const { terminal, locations, params, demand, twin } = req.body;

    // cache
    const cached = await prisma.supplyChainRun.findUnique({ where: { runKey } });
    if (cached) {
      await prisma.supplyChainRun.update({ where: { runKey }, data: { reuseCount: cached.reuseCount + 1 } });
      return res.json({ runKey, cached: true, twin: !!twin, mode: twin ? 'twin' : 'single', results: cached.results, topResult: cached.topResult });
    }

    const [vessels, routes, oru] = await Promise.all([
      prisma.vessel.findMany(),
      prisma.distanceRoute.findMany(),
      prisma.oruCapex.findMany(),
    ]);

    const baseYear = req.body.base_year ?? 2022;
    const inflationFactor = Math.pow(1 + params.inflation_rate, params.analysis_year - baseYear);

    if (twin) {
      const twinCfg = {
        ratios: (twin && Array.isArray(twin.ratios)) ? twin.ratios : ['50:50','60:40','70:30','80:20','90:10'],
        enforceSameVessel: twin ? !!twin.enforceSameVessel : true,
        vesselNames: twin && Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
        shareTerminalORU: twin ? !!twin.shareTerminalORU : true,
      };

      const { kapal_1, kapal_2, total } = await runTwoVesselProbabilityModel({
        vessels, routes, oru, terminal,
        selectedLocations: locations, demandBBTUD: demand,
        params, inflationFactor,
        ...twinCfg,
      });
      const topResult = total[0] || null;

      await prisma.supplyChainRun.create({
        data: { runKey, terminal, locations, params, demand, results: { kapal_1, kapal_2, total }, topResult },
      });
      return res.json({ runKey, cached: false, twin: true, mode: 'twin', results: { kapal_1, kapal_2, total }, topResult });
    }

    // single-vessel logic
    const results = await runSupplyChainModel({
      vessels, routes, oru, terminal,
      selectedLocations: locations, demandBBTUD: demand,
      params, inflationFactor,
    });
    const sorted = [...results].sort((a, b) => a['Total Cost USD/MMBTU'] - b['Total Cost USD/MMBTU']);
    const topResult = sorted[0] || null;

    await prisma.supplyChainRun.create({
      data: { runKey, terminal, locations, params, demand, results, topResult },
    });
    return res.json({ runKey, cached: false, twin: false, mode: 'single', results, topResult });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Engine run error', detail: e.message });
  }
}

module.exports = { run, getByKey, runTwin, runUnified };
