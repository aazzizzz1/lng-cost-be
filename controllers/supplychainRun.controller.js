const prisma = require('../config/db');
const {
  runSupplyChainModel,
  runTwoVesselProbabilityModel,
  buildRiskDB,
  runSupplyChainModelRisk,
  runTwoVesselProbabilityModelRisk, // NEW
  runHubSpokeSingleModel,          // NEW
  runHubSpokeSingleModelRisk,      // NEW
  runHubSpokeTwoVesselModel,       // NEW
  runHubSpokeTwoVesselModelRisk,   // NEW
} = require('../services/supplychainEngine');

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
    const { terminal, locations, params, demand, twin, risk } = req.body;
    const method = req.body.method || 'milk-run'; // 'milk-run' | 'hub-spoke'

    // cache
    const cached = await prisma.supplyChainRun.findUnique({ where: { runKey } });
    if (cached) {
      await prisma.supplyChainRun.update({ where: { runKey }, data: { reuseCount: cached.reuseCount + 1 } });
      const cachedMethod = cached.params?.method || method || 'milk-run';
      const mode = cached.results?.kapal_1
        ? ((twin && risk && risk.selections) ? 'twin-risk' : 'twin')
        : (risk && risk.selections ? 'single-risk' : 'single');
      return res.json({
        runKey,
        cached: true,
        method: cachedMethod,
        twin: !!cached.results?.kapal_1,
        mode,
        results: cached.results,
        topResult: cached.topResult,
      });
    }

    const [vessels, routes, oru] = await Promise.all([
      prisma.vessel.findMany(),
      prisma.distanceRoute.findMany(),
      prisma.oruCapex.findMany(),
    ]);

    const baseYear = req.body.base_year ?? 2022;
    const inflationFactor = Math.pow(1 + params.inflation_rate, params.analysis_year - baseYear);
    const paramsWithMethod = { ...params, method }; // simpan method di params JSON

    // ==========================
    // METHOD: HUB & SPOKE
    // ==========================
    if (method === 'hub-spoke') {
      // Twin RISK (2 kapal, dengan risiko)
      if (twin && risk && risk.selections) {
        const riskRows = await prisma.riskMatrix.findMany();
        const riskDB = buildRiskDB(risk, riskRows);

        const twinCfg = {
          ratios: (twin && Array.isArray(twin.ratios)) ? twin.ratios : ['50:50','60:40','70:30','80:20','90:10'],
          enforceSameVessel: twin ? !!twin.enforceSameVessel : true,
          vesselNames: twin && Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
        };

        const { kapal_1, kapal_2, total } = await runHubSpokeTwoVesselModelRisk({
          vessels, routes, oru, terminal,
          selectedLocations: locations, demandBBTUD: demand,
          params, inflationFactor, riskDB,
          ...twinCfg,
        });
        const topResult = total[0] || null;

        await prisma.supplyChainRun.create({
          data: {
            runKey,
            terminal,
            locations,
            params: paramsWithMethod,
            demand,
            results: { kapal_1, kapal_2, total },
            topResult,
          },
        });

        return res.json({
          runKey,
          cached: false,
          method,
          twin: true,
          mode: 'twin-risk',
          results: { kapal_1, kapal_2, total },
          topResult,
        });
      }

      // Twin NO-RISK (2 kapal, tanpa risiko)
      if (twin) {
        const twinCfg = {
          ratios: (twin && Array.isArray(twin.ratios)) ? twin.ratios : ['50:50','60:40','70:30','80:20','90:10'],
          enforceSameVessel: twin ? !!twin.enforceSameVessel : true,
          vesselNames: twin && Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
          shareTerminalORU: twin ? !!twin.shareTerminalORU : true,
        };

        const { kapal_1, kapal_2, total } = await runHubSpokeTwoVesselModel({
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
            params: paramsWithMethod,
            demand,
            results: { kapal_1, kapal_2, total },
            topResult,
          },
        });

        return res.json({
          runKey,
          cached: false,
          method,
          twin: true,
          mode: 'twin',
          results: { kapal_1, kapal_2, total },
          topResult,
        });
      }

      // Single-vessel RISK (1 kapal, dengan risiko)
      if (risk && risk.selections) {
        const riskRows = await prisma.riskMatrix.findMany();
        const riskDB = buildRiskDB(risk, riskRows);

        const results = await runHubSpokeSingleModelRisk({
          vessels, routes, oru, terminal,
          selectedLocations: locations, demandBBTUD: demand,
          params, inflationFactor, riskDB,
        });
        const topResult = results[0] || null;

        await prisma.supplyChainRun.create({
          data: {
            runKey,
            terminal,
            locations,
            params: paramsWithMethod,
            demand,
            results,
            topResult,
          },
        });

        return res.json({
          runKey,
          cached: false,
          method,
          twin: false,
          mode: 'single-risk',
          results,
          topResult,
        });
      }

      // Single-vessel NO-RISK (1 kapal, tanpa risiko)
      const resultsHS = await runHubSpokeSingleModel({
        vessels, routes, oru, terminal,
        selectedLocations: locations, demandBBTUD: demand,
        params, inflationFactor,
      });
      const topResultHS = resultsHS[0] || null;

      await prisma.supplyChainRun.create({
        data: {
          runKey,
          terminal,
          locations,
          params: paramsWithMethod,
          demand,
          results: resultsHS,
          topResult: topResultHS,
        },
      });

      return res.json({
        runKey,
        cached: false,
        method,
        twin: false,
        mode: 'single',
        results: resultsHS,
        topResult: topResultHS,
      });
    }

    // ==========================
    // METHOD: MILK-RUN (DEFAULT)
    // ==========================

    // Twin RISK mode (NEW)
    if (twin && risk && risk.selections) {
      const riskRows = await prisma.riskMatrix.findMany();
      const riskDB = buildRiskDB(risk, riskRows);

      const twinCfg = {
        ratios: (twin && Array.isArray(twin.ratios)) ? twin.ratios : ['50:50','60:40','70:30','80:20','90:10'],
        enforceSameVessel: twin ? !!twin.enforceSameVessel : true,
        vesselNames: twin && Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
      };

      const { kapal_1, kapal_2, total } = await runTwoVesselProbabilityModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: locations, demandBBTUD: demand,
        params, inflationFactor, riskDB,
        ...twinCfg,
      });
      const topResult = total[0] || null;

      await prisma.supplyChainRun.create({
        data: {
          runKey,
          terminal,
          locations,
          params: paramsWithMethod,
          demand,
          results: { kapal_1, kapal_2, total },
          topResult,
        },
      });
      return res.json({ runKey, cached: false, method, twin: true, mode: 'twin-risk', results: { kapal_1, kapal_2, total }, topResult });
    }

    // Twin NO-RISK mode
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
        data: {
          runKey,
          terminal,
          locations,
          params: paramsWithMethod,
          demand,
          results: { kapal_1, kapal_2, total },
          topResult,
        },
      });
      return res.json({ runKey, cached: false, method, twin: true, mode: 'twin', results: { kapal_1, kapal_2, total }, topResult });
    }

    // Single-vessel RISK mode
    if (risk && risk.selections) {
      const riskRows = await prisma.riskMatrix.findMany();
      const riskDB = buildRiskDB(risk, riskRows);

      const results = await runSupplyChainModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: locations, demandBBTUD: demand,
        params, inflationFactor, riskDB,
      });
      const topResult = results[0] || null;

      await prisma.supplyChainRun.create({
        data: {
          runKey,
          terminal,
          locations,
          params: paramsWithMethod,
          demand,
          results,
          topResult,
        },
      });
      return res.json({ runKey, cached: false, method, twin: false, mode: 'single-risk', results, topResult });
    }

    // Single-vessel NO-RISK mode
    const results = await runSupplyChainModel({
      vessels, routes, oru, terminal,
      selectedLocations: locations, demandBBTUD: demand,
      params, inflationFactor,
    });
    const topResult = results[0] || null;

    await prisma.supplyChainRun.create({
      data: {
        runKey,
        terminal,
        locations,
        params: paramsWithMethod,
        demand,
        results,
        topResult,
      },
    });
    return res.json({ runKey, cached: false, method, twin: false, mode: 'single', results, topResult });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Engine run error', detail: e.message });
  }
}

module.exports = { run, getByKey, runTwin, runUnified };
