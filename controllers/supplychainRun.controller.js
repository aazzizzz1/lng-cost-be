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
  const addScenarioIndex = (rows) =>
    (Array.isArray(rows) ? rows : []).map((r, i) =>
      Object.prototype.hasOwnProperty.call(r, 'No. Skenario')
        ? r
        : { 'No. Skenario': i + 1, ...r }
    );

  // === CASE 1: Hub & Spoke 3-kapal (Mother + Feeder 1 + Feeder 2 + System) ===
  if (
    twin &&
    method === 'hub-spoke' &&
    results &&
    Array.isArray(results.mother) &&
    Array.isArray(results.feeder1) &&
    Array.isArray(results.feeder2) &&
    Array.isArray(results.system)
  ) {
    return {
      tables: {
        mother: addScenarioIndex(results.mother),
        feeder1: addScenarioIndex(results.feeder1),
        feeder2: addScenarioIndex(results.feeder2),
        system: addScenarioIndex(results.system),
      },
    };
  }

  // === CASE 2: Hub & Spoke 1-kapal (Mother + Feeder 1 + System) - NO TWIN ===
  if (
    !twin &&
    method === 'hub-spoke' &&
    results &&
    Array.isArray(results.mother) &&
    Array.isArray(results.feeder1) &&
    Array.isArray(results.system)
  ) {
    return {
      tables: {
        mother: addScenarioIndex(results.mother),
        feeder1: addScenarioIndex(results.feeder1),
        system: addScenarioIndex(results.system),
      },
    };
  }

  // === CASE 3: Twin mode generic (bentuk lama { kapal_1, kapal_2, total }) ===
  if (
    twin &&
    results &&
    Array.isArray(results.kapal_1) &&
    Array.isArray(results.kapal_2) &&
    Array.isArray(results.total)
  ) {
    const k1 = addScenarioIndex(results.kapal_1);
    const k2 = addScenarioIndex(results.kapal_2);
    const sys = addScenarioIndex(results.total);

    if (method === 'hub-spoke') {
      return { tables: { mother: k1, feeder: k2, system: sys } };
    }
    return { tables: { kapal_1: k1, kapal_2: k2, system: sys } };
  }

  // === CASE 4: Single-vessel (array of rows penuh) ===
  const rows = Array.isArray(results) ? results : [];
  const indexed = addScenarioIndex(rows);

  if (method === 'hub-spoke') {
    return { tables: { hubSpoke: indexed } };
  }
  return { tables: { milkRun: indexed } };
}

/**
 * Unified Supply Chain Runner (API /api/supplychain/run)
 * ======================================================
 * Body (ringkasan):
 *
 * {
 *   // Terminal bisa 1 atau lebih dari 1
 *   "terminal": "Badak NGL Bontang" | ["Badak NGL Bontang","Terminal X"],   // string ATAU array
 *
 *   // Arsitektur perhitungan
 *   "method": "milk-run" | "hub-spoke",
 *
 *   // Daftar lokasi demand (plant)
 *   "locations": ["MPP Jeranjang (Lombok Peaker)", "PLTMG Alor", ...],
 *
 *   // Parameter teknis & ekonomi (disamakan dengan notebook / Colab)
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
 *     "analysis_year": 2024,
 *     "inflation_rate": 0.05,
 *     "Penyaluran": 20,
 *     // OPTIONAL: setting tambahan untuk CAPEX storage
 *     "harga_tangki_500m3": 1030000,
 *     "ukuran_tangki_500m3": 500
 *   },
 *
 *   // Demand gas (BBTUD) per lokasi
 *   "demand": { "MPP Jeranjang (Lombok Peaker)": 1.5, "PLTMG Alor": 2.0, ... },
 *
 *   // Tahun basis inflasi (sama dengan BASE_YEAR di Colab)
 *   "base_year": 2022,
 *
 *   // OPTIONAL: pilih kapal yang boleh dipakai engine (multi-select dari library Vessel)
 *   // Jika tidak diisi → semua kapal di master Vessel akan dipakai sebagai kandidat.
 *   "vessels": ["Shinju Maru","WSD59 3K","WSD59 5K"],
 *
 *   // OPTIONAL: konfigurasi multi-kapal (N ≥ 2) – konsepnya sama dengan "Twin Constraint" di Colab.
 *   //   - Backend yang mengerjakan semua kombinasi pembagian lokasi (generate_partitions),
 *   //     jadi TIDAK perlu dan TIDAK ada lagi input "ratio" dari frontend.
 *   //   - Untuk saat ini implementasi penuh di backend masih fokus ke:
 *   //       • Milk Run 1 kapal (NO-RISK / RISK)
 *   //       • Milk Run 2 kapal (N=2, NO-RISK / RISK) → pakai engine twin-*VesselProbabilityModel*
 *   //       • Hub & Spoke 2 kapal (Mother + 2 Feeder, RISK) → runHubSpokeTwoVesselModelRisk
 *   //
 *   // Field "twin" di sini dibaca sebagai opsi/constraint untuk kasus N > 1
 *   // (misalnya N=2 sekarang, nanti bisa diperluas untuk N-kapal) – bukan berarti
 *   // sistem cuma boleh 2 kapal saja.
 *   "twin": {
 *     // Jika true → semua kapal pemecah rute wajib tipe yang sama (twin_constraint di Colab).
 *     "enforceSameVessel": true,
 *
 *     // Jika diisi → backend hanya membentuk kombinasi nama kapal sesuai daftar ini
 *     // (misalnya ["Shinju Maru","WSD59 3K"]) dan mengabaikan kapal lain.
 *     "vesselNames": ["Kapal1","Kapal2"],
 *
 *     // Jika true → CAPEX ORU di terminal dibagi antara kapal-kapal pemecah rute
 *     // (untuk N=2 sekarang, artinya ORU terminal / 2).
 *     "shareTerminalORU": true
 *   },
 *
 *   // OPTIONAL: Risk (II.1–II.8, pilih kode R1..R32 – sama persis dengan wizard di Colab)
 *   // Frontend cukup menampilkan 8 section (II.1 s/d II.8) dengan penjelasan teks,
 *   // lalu user memilih beberapa kode risiko (R1..R32) per section.
 *   "risk": {
 *     "selections": {
 *       "II.1": ["R7"],              // contoh: risiko untuk pemuatan LNG
 *       "II.2": ["R1","R2"],         // aktivitas sandar & lepas sandar (loading)
 *       "II.3": ["R22"],             // pengiriman LNG
 *       "II.4": ["R7"],              // pembongkaran LNG
 *       "II.5": ["R7"],              // aktivitas sandar & lepas sandar (unloading)
 *       "II.6": ["R7"],              // penyimpanan LNG darat
 *       "II.7": ["R7"],              // regasifikasi
 *       "II.8": ["R7"]               // distribusi gas ke pelanggan
 *     }
 *   }
 * }
 *
 * Catatan penting:
 * - Backend sudah menghitung sendiri seluruh kombinasi pembagian lokasi ke beberapa kapal
 *   (menggunakan generatePartitions di sisi JS, mirip fungsi run_simulation di Colab),
 *   sehingga TIDAK ada lagi input "rasio" (% atau 50:50, 60:40, dst.) dari frontend.
 * - Jumlah kapal pemecah rute (N) dikontrol oleh engine berdasarkan konfigurasi yang
 *   disepakati (saat ini: 1 kapal & 2 kapal yang sudah siap pakai di backend JS).
 * - Field "twin.enforceSameVessel" bersifat generik untuk N-kapal (bukan hanya 2 kapal),
 *   sama seperti "Twin Constraint (y/n)" pada STEP 6 di Colab.
 */
async function runUnified(req, res) {
  try {
    const runKey = req.runKey;
    const { locations, params, demand, twin, risk } = req.body;
    const method = req.body.method || 'milk-run';
    const baseYear = req.body.base_year ?? 2022;
    const rawGeo = req.body.geo || undefined;
    const primaryTerminal = req.body.terminal;
    const terminals = Array.isArray(req.body.terminals) && req.body.terminals.length
      ? req.body.terminals
      : (primaryTerminal ? [primaryTerminal] : []);

    if (!terminals.length) {
      return res.status(400).json({ error: 'terminal (string atau array) wajib diisi' });
    }

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
    const [rawVessels, routes, oru, locRows, riskRows] = await Promise.all([
      prisma.vessel.findMany(),
      prisma.distanceRoute.findMany(),
      prisma.oruCapex.findMany(),
      prisma.location.findMany({
        where: {
          name: { in: [...terminals, ...(Array.isArray(locations) ? locations : [])] },
        },
      }),
      prisma.riskMatrix.findMany(), // NEW: load risk matrix for buildRiskDB
    ]);

    // Filter vessels jika ada req.body.vessels
    let vessels = rawVessels;
    const bodyVessels = Array.isArray(req.body.vessels)
      ? req.body.vessels
          .filter((n) => typeof n === 'string')
          .map((n) => n.trim())
          .filter(Boolean)
      : [];
    if (bodyVessels.length) {
      const vset = new Set(bodyVessels);
      vessels = rawVessels.filter((v) => vset.has(v.name));
      if (!vessels.length) {
        return res.status(400).json({ error: 'Daftar vessels[] tidak cocok dengan data master kapal' });
      }
    }

    // build geoMap gabungan
    const dbGeo = {};
    for (const l of locRows) {
      if (typeof l.latitude === 'number' && typeof l.longitude === 'number') {
        dbGeo[l.name] = { latitude: l.latitude, longitude: l.longitude };
      }
    }
    const geoMap = rawGeo ? { ...dbGeo, ...rawGeo } : dbGeo;

    const inflationFactor = Math.pow(1 + params.inflation_rate, params.analysis_year - baseYear);
    const paramsWithMethod = { ...params, method };

    // Helper: save and respond
    async function saveAndRespond({ resultsObj, topResult, twinFlag, mode }) {
      const terminalLabel = terminals.length > 1 ? terminals.join(', ') : terminals[0];
      await prisma.supplyChainRun.create({
        data: {
          runKey,
          terminal: terminalLabel,
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
          terminal: terminalLabel,
          terminals,
          locations,
          params: paramsWithMethod,
          demand,
          base_year: baseYear,
          geo: geoMap,
        },
        tables,
        topResult,
      });
    }

    // ======================
    // 3. HUB & SPOKE
    // ======================
    if (method === 'hub-spoke') {
      if (terminals.length > 1) {
        return res.status(400).json({ error: 'Multiple terminals belum didukung untuk metode hub-spoke' });
      }
      const terminal = terminals[0];

      // 3.a Hub-Spoke Twin + Risk
      if (twin && risk && risk.selections) {
        const riskDB = buildRiskDB(risk, riskRows);
        const twinCfg = {
          enforceSameVessel: twin.enforceSameVessel !== false,
          vesselNames: Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
          shareTerminalORU: twin.shareTerminalORU !== false,
        };
        const hubResult = await runHubSpokeTwoVesselModelRisk({
          vessels, routes, oru, terminal,
          selectedLocations: locations,
          demandBBTUD: demand,
          params, inflationFactor, riskDB, geoMap,
          ...twinCfg,
        });
        const topResult = hubResult.system?.[0] || null;
        return saveAndRespond({ resultsObj: hubResult, topResult, twinFlag: true, mode: 'twin' });
      }

      // 3.b Hub-Spoke Twin NO-RISK
      if (twin) {
        const twinCfg = {
          enforceSameVessel: twin.enforceSameVessel !== false,
          vesselNames: Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
          shareTerminalORU: twin.shareTerminalORU !== false,
        };
        const hubResult = await runHubSpokeTwoVesselModel({
          vessels, routes, oru, terminal,
          selectedLocations: locations,
          demandBBTUD: demand,
          params, inflationFactor, geoMap,
          ...twinCfg,
        });
        const topResult = hubResult.total?.[0] || null;
        return saveAndRespond({ resultsObj: hubResult, topResult, twinFlag: true, mode: 'twin' });
      }

      // 3.c Hub-Spoke Single + Risk
      if (risk && risk.selections) {
        const riskDB = buildRiskDB(risk, riskRows);
        const results = await runHubSpokeSingleModelRisk({
          vessels, routes, oru, terminal,
          selectedLocations: locations,
          demandBBTUD: demand,
          params, inflationFactor, riskDB, geoMap,
        });
        const topResult = results[0] || null;
        return saveAndRespond({ resultsObj: results, topResult, twinFlag: false, mode: 'single' });
      }

      // 3.d Hub-Spoke Single NO-RISK
      const results = await runHubSpokeSingleModel({
        vessels, routes, oru, terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params, inflationFactor, geoMap,
      });
      const topResult = results[0] || null;
      return saveAndRespond({ resultsObj: results, topResult, twinFlag: false, mode: 'single' });
    }

    // ======================
    // 4. MILK-RUN
    // ======================

    // 4.a Milk-Run Twin + Risk
    if (twin && risk && risk.selections) {
      if (terminals.length > 1) {
        return res.status(400).json({ error: 'Multiple terminals belum didukung untuk mode twin/risk' });
      }
      const terminal = terminals[0];
      const riskDB = buildRiskDB(risk, riskRows);
      const twinCfg = {
        enforceSameVessel: twin.enforceSameVessel !== false,
        vesselNames: Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
        shareTerminalORU: twin.shareTerminalORU !== false,
      };
      const { kapal_1, kapal_2, total } = await runTwoVesselProbabilityModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params, inflationFactor, riskDB, geoMap,
        ...twinCfg,
      });
      const topResult = total[0] || null;
      return saveAndRespond({ resultsObj: { kapal_1, kapal_2, total }, topResult, twinFlag: true, mode: 'twin' });
    }

    // 4.b Milk-Run Twin NO-RISK
    if (twin) {
      if (terminals.length > 1) {
        return res.status(400).json({ error: 'Multiple terminals belum didukung untuk mode twin' });
      }
      const terminal = terminals[0];
      const twinCfg = {
        enforceSameVessel: twin.enforceSameVessel !== false,
        vesselNames: Array.isArray(twin.vesselNames) ? twin.vesselNames : undefined,
        shareTerminalORU: twin.shareTerminalORU !== false,
      };
      const { kapal_1, kapal_2, total } = await runTwoVesselProbabilityModel({
        vessels, routes, oru, terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params, inflationFactor, geoMap,
        ...twinCfg,
      });
      const topResult = total[0] || null;
      return saveAndRespond({ resultsObj: { kapal_1, kapal_2, total }, topResult, twinFlag: true, mode: 'twin' });
    }

    // 4.c Milk-Run Single + Risk
    if (risk && risk.selections) {
      if (terminals.length > 1) {
        return res.status(400).json({ error: 'Multiple terminals belum didukung untuk mode risk' });
      }
      const terminal = terminals[0];
      const riskDB = buildRiskDB(risk, riskRows);
      const results = await runSupplyChainModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params, inflationFactor, riskDB, geoMap,
      });
      const topResult = results[0] || null;
      return saveAndRespond({ resultsObj: results, topResult, twinFlag: false, mode: 'single' });
    }

    // 4.d Milk-Run Single NO-RISK (1 terminal)
    if (terminals.length === 1) {
      const terminal = terminals[0];
      const results = await runSupplyChainModel({
        vessels, routes, oru, terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params, inflationFactor, geoMap,
      });
      const topResult = results[0] || null;
      return saveAndRespond({ resultsObj: results, topResult, twinFlag: false, mode: 'single' });
    }

    // 4.e Milk-Run Single NO-RISK (multi-terminal)
    let combinedResults = [];
    for (const terminal of terminals) {
      const partial = await runSupplyChainModel({
        vessels, routes, oru, terminal,
        selectedLocations: locations,
        demandBBTUD: demand,
        params, inflationFactor, geoMap,
      });
      const tagged = partial.map((row) => ({
        ...row,
        'Terminal Sumber LNG': terminal,
      }));
      combinedResults = combinedResults.concat(tagged);
    }

    combinedResults.sort((a, b) => a['Total Cost USD/MMBTU'] - b['Total Cost USD/MMBTU']);
    const top20 = combinedResults.slice(0, 20);
    const topResult = top20[0] || null;

    return saveAndRespond({ resultsObj: top20, topResult, twinFlag: false, mode: 'single' });

  } catch (e) {
    console.error('runUnified error:', e);
    return res.status(500).json({ error: 'Engine run error', detail: e.message, stack: e.stack });
  }
}

module.exports = { run, getByKey, runTwin, runUnified };
