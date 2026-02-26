const prisma = require('../config/db');
const {
  runSupplyChainModel,
  runTwoVesselProbabilityModel,
  buildRiskDB,
  runSupplyChainModelRisk,
  runTwoVesselProbabilityModelRisk,
  runHubSpokeSingleModel,
  runHubSpokeSingleModelRisk,
  runHubSpokeTwoVesselModel,
  runHubSpokeTwoVesselModelRisk,
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

// NEW: normalisasi hasil menjadi tabel-tabel untuk response
function normalizeResultsForResponse({ method, twin, results }) {
  // === CASE 1: Hub & Spoke 3-kapal (Mother + Feeder 1 + Feeder 2 + System) ===
  // Bentuk yang diharapkan dari engine:
  // {
  //   mother:   [ { Skenario Hub, Nama Kapal, Rute, Kapasitas Kapal, Nominal Capacity, Demand LNG/day, RTD, days_stock, voyages_year, Utilitasi_Factor_LNGC, Batas_Maksimum_Utilisasi_LNGC, selected_storage Total, fuel_voyage, fuel_ballast, fuel_berth, lng_fuel_cost, port_cost, rent_cost, Total CAPEX (USD), Total CAPEX USD/MMBTU, Total OPEX (USD/year), Total OPEX (USD/MMBTU), Total Cost (USD/MMBTU), ... }, ... ],
  //   feeder1:  [ { ...kolom sama + Spokes }, ... ],
  //   feeder2:  [ { ...kolom sama + Spokes }, ... ],
  //   system:   [ { Skenario Hub, Probability, M_Nama Kapal 1 (Mother), F1_Nama Kapal 2 (Feeder 1), F2_Nama Kapal 3 (Feeder 2), Total CAPEX (USD), Total OPEX (USD/year), Total Cost (USD/MMBTU), ... }, ... ]
  // }
  if (
    twin &&
    method === 'hub-spoke' &&
    results &&
    Array.isArray(results.mother) &&
    Array.isArray(results.feeder1) &&
    Array.isArray(results.feeder2) &&
    Array.isArray(results.system)
  ) {
    const mother = results.mother.map((r, i) => ({ 'No. Skenario': i + 1, ...r }));
    const feeder1 = results.feeder1.map((r, i) => ({ 'No. Skenario': i + 1, ...r }));
    const feeder2 = results.feeder2.map((r, i) => ({ 'No. Skenario': i + 1, ...r }));
    const system = results.system.map((r, i) => ({ 'No. Skenario': i + 1, ...r }));
    return { tables: { mother, feeder1, feeder2, system } };
  }

  // === CASE 2: Twin mode generic (bentuk lama { kapal_1, kapal_2, total }) ===
  if (
    twin &&
    results &&
    Array.isArray(results.kapal_1) &&
    Array.isArray(results.kapal_2) &&
    Array.isArray(results.total)
  ) {
    const k1 = results.kapal_1.map((r, i) => ({ 'No. Skenario': i + 1, ...r }));
    const k2 = results.kapal_2.map((r, i) => ({ 'No. Skenario': i + 1, ...r }));
    const sys = results.total.map((r, i) => ({ 'No. Skenario': i + 1, ...r }));

    if (method === 'hub-spoke') {
      // Untuk Hub & Spoke 2-kapal (Mother + Feeder + System)
      return { tables: { mother: k1, feeder: k2, system: sys } };
    }
    // Milk & Run 2 kapal
    return { tables: { kapal_1: k1, kapal_2: k2, system: sys } };
  }

  // === CASE 3: Single-vessel (array of rows penuh) ===
  const rows = Array.isArray(results) ? results : [];
  const indexed = rows.map((r, i) => ({ 'No. Skenario': i + 1, ...r }));

  if (method === 'hub-spoke') {
    // 1 Kapal Hub & Spoke → 1 tabel lengkap
    return { tables: { hubSpoke: indexed } };
  }
  // 1 Kapal Milk & Run → 1 tabel lengkap
  return { tables: { milkRun: indexed } };
}

/**
 * Unified Supply Chain Runner (API /api/supplychain/run)
 * ======================================================
 * Cara pakai via Postman:
 *
 * POST http://localhost:5000/api/supplychain/run
 * Body (JSON):
 * {
 *   "terminal": "Badak NGL Bontang",
 *   "method": "milk-run",          // atau "hub-spoke"
 *   "locations": ["MPP Jeranjang (Lombok Peaker)", "PLTMG Alor", "PLTMG Bima", "PLTMG Kupang"],
 *   "params": {
 *     "harga_bbm": 543,
 *     "harga_lng": 350,
 *     "scf_lng": 0.13,
 *     "scf_mgo": 0.18,
 *     "loading_hour": 12,
 *     "maintenance_days": 10,
 *     "unpumpable_pct": 0.05,
 *     "bog_pct": 0.0015,
 *     "filling_pct": 0.98,
 *     "gross_storage_pct": 1.1,
 *     "analysis_year": 2022,
 *     "inflation_rate": 0.05,
 *     "Penyaluran": 20           // opsional; di JS diasumsikan 20 tahun untuk CAPEX
 *   },
 *   "demand": {
 *     "MPP Jeranjang (Lombok Peaker)": 1.2,
 *     "PLTMG Alor": 2.3,
 *     "PLTMG Bima": 3.3,
 *     "PLTMG Kupang": 4.4
 *   },
 *   "base_year": 2022,
 *
 *   // OPTIONAL: aktifkan 2 kapal (N=2) → Milk & Run / Hub & Spoke twin
 *   "twin": {
 *     "ratios": ["50:50","60:40","70:30","80:20","90:10"],
 *     "enforceSameVessel": true,
 *     "shareTerminalORU": true
 *   },
 *
 *   // OPTIONAL: aktifkan modul risiko
 *   "risk": {
 *     "selections": {
 *       "II.2": ["R1","R2"],
 *       "II.3": ["R22"],
 *       "II.6": ["R7"],
 *       "II.7": ["R7"],
 *       "II.8": ["R7"]
 *     }
 *   }
 * }
 *
 * Response:
 * {
 *   "runKey": "...",         // hash stabil berdasarkan input (middleware)
 *   "cached": false,
 *   "method": "milk-run" | "hub-spoke",
 *   "twin": false | true,
 *   "mode": "single" | "single-risk" | "twin" | "twin-risk",
 *   "input": { ...echo input... },
 *   "tables": {
 *     // Milk & Run 1 kapal: { "milkRun": [ { No. Skenario, Nama Kapal, Rute, ..., Total Cost USD/MMBTU }, ... ] }
 *     // Milk & Run 2 kapal: { kapal_1: [...], kapal_2: [...], system: [...] }
 *     // Hub & Spoke 1 kapal: { hubSpoke: [...] }
 *     // Hub & Spoke 2 kapal:
 *     //   - 2 kapal (Mother+Feeder): { mother: [...], feeder: [...], system: [...] }
 *     //   - 3 kapal (Mother+Feeder1+Feeder2): { mother: [...], feeder1: [...], feeder2: [...], system: [...] }
 *   },
 *   "topResult": { ...baris dengan cost terendah... }
 * }
 */
async function runUnified(req, res) {
  try {
    const runKey = req.runKey;
    const { terminal, locations, params, demand, twin, risk } = req.body;
    const method = req.body.method || 'milk-run'; // 'milk-run' | 'hub-spoke'
    const baseYear = req.body.base_year ?? 2022;
    const rawGeo = req.body.geo || undefined; // NEW: geo dari frontend (Leaflet)

    // ======================
    // 1. Cek CACHE
    // ======================
    const cached = await prisma.supplyChainRun.findUnique({ where: { runKey } });
    if (cached) {
      await prisma.supplyChainRun.update({
        where: { runKey },
        data: { reuseCount: cached.reuseCount + 1 },
      });

      const cachedMethod = cached.params?.method || method || 'milk-run';
      const cachedResults = cached.results;

      // UPDATED: deteksi twin juga untuk hasil Hub & Spoke 3-kapal (mother+feeder1+feeder2+system)
      const hasTwinGeneric =
        !!cachedResults &&
        Array.isArray(cachedResults.kapal_1) &&
        Array.isArray(cachedResults.kapal_2) &&
        Array.isArray(cachedResults.total);

      const hasTwinHubSpoke3 =
        !!cachedResults &&
        Array.isArray(cachedResults.mother) &&
        Array.isArray(cachedResults.feeder1) &&
        Array.isArray(cachedResults.feeder2) &&
        Array.isArray(cachedResults.system);

      const isTwin = hasTwinGeneric || hasTwinHubSpoke3;

      const { tables } = normalizeResultsForResponse({
        method: cachedMethod,
        twin: isTwin,
        results: cachedResults,
      });

      return res.json({
        runKey,
        cached: true,
        method: cachedMethod,
        twin: isTwin,
        mode: isTwin ? 'twin' : 'single',
        input: {
          terminal: cached.terminal,
          locations: cached.locations,
          params: cached.params,
          demand: cached.demand,
          base_year: baseYear,
        },
        tables,
        topResult: cached.topResult,
      });
    }

    // ======================
    // 2. Load master data
    // ======================
    const [vessels, routes, oru, locRows] = await Promise.all([
      prisma.vessel.findMany(),
      prisma.distanceRoute.findMany(),
      prisma.oruCapex.findMany(),
      prisma.location.findMany({
        where: {
          name: { in: [terminal, ...(Array.isArray(locations) ? locations : [])] },
        },
      }),
    ]);

    // NEW: bangun geoMap gabungan (DB Location + body.geo)
    const dbGeo = {};
    for (const l of locRows) {
      if (typeof l.latitude === 'number' && typeof l.longitude === 'number') {
        dbGeo[l.name] = { latitude: l.latitude, longitude: l.longitude };
      }
    }
    const geoMap = rawGeo ? { ...dbGeo, ...rawGeo } : dbGeo;

    const inflationFactor = Math.pow(1 + params.inflation_rate, params.analysis_year - baseYear);
    const paramsWithMethod = { ...params, method };

    async function saveAndRespond({ resultsObj, topResult, twinFlag, mode }) {
      await prisma.supplyChainRun.create({
        data: {
          runKey,
          terminal,
          locations,
          params: paramsWithMethod,
          demand,
          results: resultsObj,
          topResult,
        },
      });

      const { tables } = normalizeResultsForResponse({
        method,
        twin: twinFlag,
        results: resultsObj,
      });
      return res.json({
        runKey,
        cached: false,
        method,
        twin: twinFlag,
        mode,
        input: {
          terminal,
          locations,
          params: paramsWithMethod,
          demand,
          base_year: baseYear,
          geo: geoMap, // NEW: echo geo yang dipakai
        },
        tables,
        topResult,
      });
    }

    // ==========================
    // 3. METHOD: HUB & SPOKE
    // ==========================
    if (method === 'hub-spoke') {
      // 3.a Twin + RISK
      if (twin && risk && risk.selections) {
        const riskRows = await prisma.riskMatrix.findMany();
        const riskDB = buildRiskDB(risk, riskRows);

        const twinCfg = {
          ratios: twin && Array.isArray(twin.ratios)
            ? twin.ratios
            : ['50:50', '60:40', '70:30', '80:20', '90:10'],
          enforceSameVessel: twin ? !!twin.enforceSameVessel : true,
          vesselNames:
            twin && Array.isArray(twin.vesselNames)
              ? twin.vesselNames
              : undefined,
        };

        const { mother, feeder1, feeder2, system } =
          await runHubSpokeTwoVesselModelRisk({
            vessels,
            routes,
            oru,
            terminal,
            selectedLocations: locations,
            demandBBTUD: demand,
            params,
            inflationFactor,
            riskDB,
            geoMap, // NEW
            ...twinCfg,
          });

        const topResult = system && system.length > 0 ? system[0] : null;
        return saveAndRespond({
          resultsObj: { mother, feeder1, feeder2, system },
          topResult,
          twinFlag: true,
          mode: 'twin-risk',
        });
      }

      // 3.b Twin NO-RISK
      if (twin) {
        const twinCfg = {
          ratios: (twin && Array.isArray(twin.ratios))
            ? twin.ratios
            : ['50:50', '60:40', '70:30', '80:20', '90:10'],
          enforceSameVessel: twin ? !!twin.enforceSameVessel : true,
          vesselNames: twin && Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
          shareTerminalORU: twin ? !!twin.shareTerminalORU : true,
        };

        const { kapal_1, kapal_2, total } = await runHubSpokeTwoVesselModel({
          vessels,
          routes,
          oru,
          terminal,
          selectedLocations: locations,
          demandBBTUD: demand,
          params,
          inflationFactor,
          geoMap, // NEW
          ...twinCfg,
        });
        const topResult = total[0] || null;
        return saveAndRespond({
          resultsObj: { kapal_1, kapal_2, total },
          topResult,
          twinFlag: true,
          mode: 'twin',
        });
      }

      // 3.c Single + RISK
      if (risk && risk.selections) {
        const riskRows = await prisma.riskMatrix.findMany();
        const riskDB = buildRiskDB(risk, riskRows);

        const resultsHSRisk = await runHubSpokeSingleModelRisk({
          vessels,
          routes,
          oru,
          terminal,
          selectedLocations: locations,
          demandBBTUD: demand,
          params,
          inflationFactor,
          riskDB,
          geoMap, // NEW
        });
        const topResultHSRisk = resultsHSRisk[0] || null;
        return saveAndRespond({
          resultsObj: resultsHSRisk,
          topResult: topResultHSRisk,
          twinFlag: false,
          mode: 'single-risk',
        });
      }

      // 3.d Single NO-RISK
      const resultsHS = await runHubSpokeSingleModel({
        vessels,
        routes,
        oru,
        terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params,
        inflationFactor,
        geoMap, // NEW
      });
      const topResultHS = resultsHS[0] || null;
      return saveAndRespond({
        resultsObj: resultsHS,
        topResult: topResultHS,
        twinFlag: false,
        mode: 'single',
      });
    }

    // ==========================
    // 4. METHOD: MILK-RUN
    // ==========================

    // 4.a Twin + RISK
    if (twin && risk && risk.selections) {
      const riskRows = await prisma.riskMatrix.findMany();
      const riskDB = buildRiskDB(risk, riskRows);

      const twinCfg = {
        ratios: twin && Array.isArray(twin.ratios)
          ? twin.ratios
          : ['50:50', '60:40', '70:30', '80:20', '90:10'],
        enforceSameVessel: twin ? !!twin.enforceSameVessel : true,
        vesselNames: twin && Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
      };

      const { kapal_1, kapal_2, total } = await runTwoVesselProbabilityModelRisk({
        vessels,
        routes,
        oru,
        terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params,
        inflationFactor,
        riskDB,
        geoMap, // NEW
        ...twinCfg,
      });
      const topResult = total[0] || null;
      return saveAndRespond({
        resultsObj: { kapal_1, kapal_2, total },
        topResult,
        twinFlag: true,
        mode: 'twin-risk',
      });
    }

    // 4.b Twin NO-RISK
    if (twin) {
      const twinCfg = {
        ratios: twin && Array.isArray(twin.ratios)
          ? twin.ratios
          : ['50:50', '60:40', '70:30', '80:20', '90:10'],
        enforceSameVessel: twin ? !!twin.enforceSameVessel : true,
        vesselNames: twin && Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
        shareTerminalORU: twin ? !!twin.shareTerminalORU : true,
      };

      const { kapal_1, kapal_2, total } = await runTwoVesselProbabilityModel({
        vessels,
        routes,
        oru,
        terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params,
        inflationFactor,
        geoMap, // NEW
        ...twinCfg,
      });
      const topResult = total[0] || null;
      return saveAndRespond({
        resultsObj: { kapal_1, kapal_2, total },
        topResult,
        twinFlag: true,
        mode: 'twin',
      });
    }

    // 4.c Single + RISK
    if (risk && risk.selections) {
      const riskRows = await prisma.riskMatrix.findMany();
      const riskDB = buildRiskDB(risk, riskRows);

      const resultsRisk = await runSupplyChainModelRisk({
        vessels,
        routes,
        oru,
        terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params,
        inflationFactor,
        riskDB,
        geoMap, // NEW
      });
      const topResultRisk = resultsRisk[0] || null;
      return saveAndRespond({
        resultsObj: resultsRisk,
        topResult: topResultRisk,
        twinFlag: false,
        mode: 'single-risk',
      });
    }

    // 4.d Single NO-RISK
    const results = await runSupplyChainModel({
      vessels,
      routes,
      oru,
      terminal,
      selectedLocations: locations,
      demandBBTUD: demand,
      params,
      inflationFactor,
      geoMap, // NEW
    });
    const topResult = results[0] || null;
    return saveAndRespond({
      resultsObj: results,
      topResult,
      twinFlag: false,
      mode: 'single',
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Engine run error', detail: e.message });
  }
}

module.exports = { run, getByKey, runTwin, runUnified };
