// Single-vessel logic:
// - Generate all permutations of selectedLocations -> evaluate each route with each vessel.
// - Compute RTD, working volume, capacity feasibility, CAPEX (tank + ORU), OPEX (fuel/port/rent/ORU).
// - Optional: shareTerminalORU splits terminal ORU by 50% when enabled.
//

// Holtrop & Mennen speed-loss model (imported from weatherService)
const { calcSpeedLoss } = require('./weatherService');
// Spatial route service: dynamic per-segment voyage hours (bathymetry-aware)
const { computeDynamicVoyageHours } = require('./spatialRouteService');

// Twin-vessel probability logic:
// - For each ratio (e.g., 50:50, 60:40...), split selectedLocations into two sets by combination count.
// - Run the single-vessel engine independently on each set.
// - Enforce same vessel pairing or fixed vessel names if provided.
// - Sum CAPEX/OPEX/Unit Cost per pairing and rank ascending by Total Cost USD/MMBTU.

/**
 * ENERGIS N-DIMENSIONAL SUPPLY CHAIN ENGINE (JS PORT)
 * ===================================================
 * Kode Python pada notebook (run_simulation, calc_mother, calc_route, dll)
 * dipetakan ke fungsi-fungsi JS berikut:
 *
 * 1) Konversi Demand (Formula 1: Dem_m3)
 * - Python:  Demm3 = DemBBTUD * 1000 / LNGec
 * - JS:      di runSupplyChainModel / runSupplyChainModelRisk
 * demand_m3_day = sum( (demandBBTUD[l] / 24.04) * 1000 )
 *
 * 2) RTD & Penjadwalan (Formula 2: Tsailing, Tport, RTD)
 * - Python:  Tsailing = Σ(D_i / Vkapal) * (1 + Risk P2_II.3)
 * Tport   = Loading + Unloading * (Risiko II.2, II.5)
 * RTD     = (Tsailing + Tport) / 24
 * - JS:
 * • runSupplyChainModel: sailingTime, totalLoadingTime → RTD (no-risk)
 * • runSupplyChainModelRisk: sailing_time_voyage, fuel_berth_start/next
 * memakai getRiskImpact(P2_Durasi, II.2 / II.3 / II.5)
 *
 * 3) Kapasitas & Utilitas Kapal (Formula 3: Buffer, Wvol, Nomcap, Util)
 * - Python:  Buffer, Wvol, Nomcap, Voyages/year, Util
 * - JS:      di kedua engine single:
 * buffer_day, working_volume_lngc, nominal_capacity,
 * days_stock, voyages_year, Utilitasi_Factor_LNGC,
 * Batas_Maksimum_Utilisasi_LNGC
 *
 * 4) CAPEX (Formula 4: Storage, CAPEXloc, CAPEXterm)
 * - Python:  Storage dibulatkan ke 100/500 m3, GF, inflasi, Risk P3
 * - JS:
 * • runSupplyChainModel: CAPEX tanpa risiko (tank + ORU)
 * • runSupplyChainModelRisk:
 * - impact_capex_start (II.6, II.7, II.8, P3_Biaya_Investasi)
 * - impact_capex_end   (II.1, P3_Biaya_Investasi)
 * → capex_loc_map, capex_terminal_risked, total_capex
 *
 * 5) OPEX (Formula 5: Cfuel, Cport, Crent, OPEXfac)
 * - Python:  fuel voyage/ballast/berth, port LTP+Delay, 5% CAPEX * Risk P1
 * - JS:
 * • No-risk: fuel_voyage, fuel_ballast, fuel_berth, lng_fuel_cost,
 * port_cost (portCostPerLocation), rent_cost, opex_oru = 5% CAPEX
 * • Risk:    risk-based time & cost:
 * - P2_Durasi → impact_sailing, impact_berth_start/next
 * - P1_BOP    → impact_port_start/next, impact_opex_start/end
 *
 * 6) System Cost (Formula 6: SystemCost USD/MMBTU)
 * - Python:  kombinasi N-kapal (partition + cross-join) → System CAPEX/OPEX/System Cost
 * - JS:
 * • Untuk 1 kapal: runSupplyChainModel / runSupplyChainModelRisk
 * langsung menghasilkan 'Total CAPEX (USD)', 'Total OPEX (USD/year)',
 * dan 'Total Cost USD/MMBTU' per skenario.
 * • Untuk 2 kapal (N=2): runTwoVesselProbabilityModel / Risk:
 * - membagi lokasi → 2 cluster (ratios 50:50, 60:40, ...)
 * - memanggil engine single-kapal untuk setiap cluster
 * - menjumlahkan CAPEX/OPEX/Cost per pairing → 'total' (system table)
 * • Untuk Hub & Spoke: runHubSpoke*Model* akan menjadi tempat porting
 * langsung dari blok "CABANG 2: HUB & SPOKE" di Python.
 *
 * 7) Risk DB (risk_df / mapping_ii_to_p)
 * - Python: risk_df + get_risk_value_from_db + build_risk_dictionary
 * - JS:     Prisma model RiskMatrix + buildRiskDB + getRiskImpact
 * (COL_MAP dan II_MAP adalah padanan kolom Python “II.x P*_...”)
 *
 * Catatan:
 * - Struktur tabel output di Postman sudah mengikuti header di notebook:
 * Milk & Run 1 kapal → 1 tabel, lengkap (Top 20).
 * Twin → 3 tabel (kapal_1, kapal_2, system) / mother+feeder+system untuk Hub & Spoke.
 */

function roundUp(x, base) {
  return Math.ceil(x / base) * base;
}
function roundUpDecimal(x, decimal = 1) {
  const factor = Math.pow(10, decimal);
  return Math.ceil(x * factor) / factor;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const res = [];
  for (let i = 0; i < arr.length; i++) {
    const head = arr[i];
    const tail = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(tail)) res.push([head, ...p]);
  }
  return res;
}

function combinations(arr, k) {
  const res = [];
  const n = arr.length;
  function backtrack(start, comb) {
    if (comb.length === k) { res.push(comb.slice()); return; }
    for (let i = start; i < n; i++) backtrack(i + 1, comb.concat(arr[i]));
  }
  backtrack(0, []);
  return res;
}

function buildDistanceMap(routes) {
  const m = new Map();
  for (const r of routes) {
    m.set(`${r.origin} - ${r.destination}`, r.nauticalMiles);
  }
  return m;
}

// NEW: haversine distance (km → nautical miles)
function haversineNm(lat1, lon1, lat2, lon2) {
  const R_km = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distKm = R_km * c;
  return distKm / 1.852; // 1 NM = 1.852 km
}

// NEW: ambil jarak NM dari DistanceRoute, atau hitung dari geoMap bila tidak ada
// spatialDistances (optional Map): "Origin|Dest" → distanceNm (from SpatialRouteCache)
function getDistanceNM(distanceMap, origin, destination, geoMap, spatialDistances) {
  // 1. Prefer spatial (bathymetry) distances when available
  if (spatialDistances) {
    const sk  = `${origin}|${destination}`;
    const sk2 = `${destination}|${origin}`;
    const sv  = spatialDistances.get(sk) ?? spatialDistances.get(sk2);
    if (typeof sv === 'number') return sv;
  }
  // 2. Manual route table
  const key = `${origin} - ${destination}`;
  const v = distanceMap.get(key);
  if (typeof v === 'number') return v;
  // 3. Haversine fallback from geoMap
  if (!geoMap) return null;
  const o = geoMap[origin];
  const d = geoMap[destination];
  if (!o || !d) return null;
  return haversineNm(o.latitude, o.longitude, d.latitude, d.longitude);
}

// Tank defaults: internal constants (not user input per Python notebook)
const TANK_SIZE_M3   = 500;      // m3 (fixed unit)
const TANK_PRICE_USD = 1030000;  // USD per 500 m3 unit

// Risk column map and II-stage map (needed by buildRiskDB)
const COL_MAP = {
  P1_Biaya_Operasi: 'P1_BOP',
  P2_Durasi: 'P2_Durasi',
  P3_Biaya_Investasi: 'P3_BIV',
  P4_Panjang_Jalur: 'P4_Panjang Jalur',
  P5_Kecepatan_Kapal: 'P5_Kecepatan Kapal',
};

const II_MAP = {
  P1_Biaya_Operasi: ['II.1','II.2','II.3','II.4','II.5','II.6','II.7','II.8'],
  P2_Durasi: ['II.1','II.2','II.3','II.4','II.5'],
  P3_Biaya_Investasi: ['II.1','II.2','II.3','II.4','II.5','II.6','II.7','II.8'],
  P4_Panjang_Jalur: ['II.2','II.3','II.5'],
  P5_Kecepatan_Kapal: ['II.2','II.5'],
};

const RISK_SECTION_DETAILS = {
  'II.1': {
    code: 'II.1',
    title: 'Pemuatan LNG',
    description: 'Pemuatan LNG dari tangki penyimpanan ke kapal dan sirkulasi BOG kembali ke kilang.',
  },
  'II.2': {
    code: 'II.2',
    title: 'Aktivitas kapal sandar & lepas sandar (loading)',
    description: 'Tahapan manuver, sandar, persiapan bongkar muat, dan keberangkatan saat loading.',
  },
  'II.3': {
    code: 'II.3',
    title: 'Pengiriman LNG',
    description: 'Perjalanan LNG dari terminal asal ke terminal penerima atau terminal berikutnya.',
  },
  'II.4': {
    code: 'II.4',
    title: 'Pembongkaran LNG',
    description: 'Pembongkaran LNG dari kapal ke fasilitas darat serta pengembalian BOG.',
  },
  'II.5': {
    code: 'II.5',
    title: 'Aktivitas sandar & lepas sandar (unloading)',
    description: 'Tahapan manuver, sandar, persiapan bongkar muat, dan keberangkatan saat unloading.',
  },
  'II.6': {
    code: 'II.6',
    title: 'Penyimpanan LNG',
    description: 'Penyimpanan LNG pada tangki darat.',
  },
  'II.7': {
    code: 'II.7',
    title: 'Regasifikasi LNG',
    description: 'Proses pemompaan dan pemanasan LNG hingga kembali menjadi gas.',
  },
  'II.8': {
    code: 'II.8',
    title: 'Distribusi gas',
    description: 'Penyaluran gas ke pelanggan atau pembangkit setelah proses akhir distribusi.',
  },
};

function buildRiskDB(riskSelections, riskRows) {
  const db = {
    P1_Biaya_Operasi: {}, P2_Durasi: {}, P3_Biaya_Investasi: {}, P4_Panjang_Jalur: {}, P5_Kecepatan_Kapal: {},
  };
  if (!riskSelections || !riskRows || !Array.isArray(riskRows)) return db;

  const rowMap = new Map(riskRows.map(r => [r.riskCode, r]));
  for (const [iiCode, codes] of Object.entries((riskSelections.selections || {}))) {
    const selected = Array.isArray(codes) ? codes : [];
    for (const [pGroup, iiList] of Object.entries(II_MAP)) {
      if (!iiList.includes(iiCode)) continue;
      const colKey = `${iiCode} ${COL_MAP[pGroup]}`;
      let sum = 0.0;
      for (const rc of selected) {
        const row = rowMap.get(rc);
        if (!row) continue;
        const v = row.values[colKey];
        if (typeof v === 'number') sum += v;
      }
      if (sum > 0) db[pGroup][iiCode] = { impact: sum, codes: selected };
    }
  }
  return db;
}

function getRiskImpact(db, pGroup, iiCode) {
  const bucket = db[pGroup] || {};
  const rec = bucket[iiCode];
  return rec ? rec.impact : 0.0;
}

function buildRiskSelectionSummary(riskSelections, riskRows) {
  if (!riskSelections || !riskRows || !Array.isArray(riskRows)) return [];

  const rowMap = new Map(riskRows.map((row) => [row.riskCode, row]));
  const summary = [];

  for (const [iiCode, codes] of Object.entries(riskSelections.selections || {})) {
    const selectedCodes = Array.isArray(codes)
      ? [...new Set(codes.filter((code) => typeof code === 'string').map((code) => code.trim()).filter(Boolean))]
      : [];
    if (!selectedCodes.length) continue;

    const impacts = {};
    for (const [pGroup, iiList] of Object.entries(II_MAP)) {
      if (!iiList.includes(iiCode)) continue;

      const colKey = `${iiCode} ${COL_MAP[pGroup]}`;
      let total = 0;
      for (const code of selectedCodes) {
        const rawValue = rowMap.get(code)?.values?.[colKey];
        if (typeof rawValue === 'number') total += rawValue;
      }
      impacts[pGroup] = total;
    }

    summary.push({
      ...(RISK_SECTION_DETAILS[iiCode] || { code: iiCode, title: iiCode, description: '' }),
      selectedRisks: selectedCodes.map((code) => ({
        riskCode: code,
        variable: rowMap.get(code)?.variable || null,
      })),
      impacts,
    });
  }

  return summary;
}

function limitRows(rows, resultLimit) {
  if (!Number.isFinite(resultLimit)) return rows;
  return rows.slice(0, Math.max(0, resultLimit));
}

// ─────────────────────────────────────────────────────────────────────────────
// Port cost: Python hitung_biaya_pelabuhan(gt, loading_hours, analysis_year, inflation_rate)
// Uses Indonesian port tariff base-year 2022 (Permenhub).
// Returns { ltp, delay } in USD per voyage.
// ─────────────────────────────────────────────────────────────────────────────
function hitungBiayaPelabuhan(gt, loadingHours, analysisYear, inflationRate) {
  const KURS = 14500; // IDR/USD
  const jasaLabuh  = (1.120 * 85.36)  / KURS;
  const jasaTambat = (1.120 * 92.84)  / KURS;
  const biayaLtp2022 =
    (gt * jasaLabuh) +
    (gt * jasaTambat) +
    ((1.120 * 67265) / KURS * 2) +
    ((1.120 * 20.64) / KURS * gt * 2);

  let tundaTetap;
  if      (gt > 18000) tundaTetap = 2860000;
  else if (gt > 8000)  tundaTetap = 1299100;
  else if (gt > 3500)  tundaTetap = 771456;
  else                 tundaTetap = 546260;

  const biayaPenundaan2022 =
    ((1.120 * tundaTetap) / KURS * loadingHours) +
    (gt * ((1.120 * 10) / KURS) * loadingHours);

  const selisihTahun  = Math.max(0, (analysisYear || 2022) - 2022);
  const faktorInflasi = Math.pow(1 + (inflationRate || 0), selisihTahun);
  return {
    ltp:   biayaLtp2022    * faktorInflasi,
    delay: biayaPenundaan2022 * faktorInflasi,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Holtrop & Mennen effective speed helper.
// Falls back to vessel.speedKnot when weather or physical dimensions are absent.
// weatherCacheByZone: { 'Laut_Banda': {wave, wind}, 'Laut_Flores': {wave, wind}, ... }
// Uses the FIRST zone as representative weather for the whole route.
// ─────────────────────────────────────────────────────────────────────────────
function getEffectiveSpeed(vessel, weatherCacheByZone) {
  if (!weatherCacheByZone || !vessel.lpp) return vessel.speedKnot;
  const zones = Object.values(weatherCacheByZone);
  if (!zones.length) return vessel.speedKnot;
  const wx = zones[0] || { wave: 0, wind: 0 };
  return calcSpeedLoss(vessel, wx.wave || 0, wx.wind || 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-compute per-leg voyage hours (WITHOUT risk multiplier) for every unique
// vessel × origin × destination triple when spatial waypoints are available.
// Returns Map: "vesselName|origin|dest" → hours
// Falls back gracefully when waypoints missing.
// ─────────────────────────────────────────────────────────────────────────────
async function buildLegHoursCache(vessels, locations, swMap, weatherCacheByZone) {
  const cache = new Map();
  if (!swMap) return cache;
  for (const vessel of vessels) {
    for (const o of locations) {
      for (const d of locations) {
        if (o === d) continue;
        const fwdKey = `${vessel.name}|${o}|${d}`;
        if (cache.has(fwdKey)) continue; // already computed (symmetric)
        const sw = swMap.get(`${o}|${d}`) || swMap.get(`${d}|${o}`);
        if (sw && Array.isArray(sw.waypoints) && sw.waypoints.length >= 2) {
          try {
            const hours = await computeDynamicVoyageHours(sw.waypoints, vessel, weatherCacheByZone);
            if (typeof hours === 'number' && hours > 0) {
              cache.set(fwdKey, hours);
              cache.set(`${vessel.name}|${d}|${o}`, hours); // symmetric: same weather zones
            }
          } catch (_) { /* fall through to dist/speed */ }
        }
      }
    }
  }
  return cache;
}

// Get sailing hours for one leg (without risk multiplier).
// Uses pre-computed spatial cache when available, otherwise dist / effective_speed.
function getLegHours(legHoursCache, vesselName, origin, dest, distNm, vessel, weatherCacheByZone) {
  const h = legHoursCache.get(`${vesselName}|${origin}|${dest}`) ??
            legHoursCache.get(`${vesselName}|${dest}|${origin}`);
  if (typeof h === 'number') return h;
  const spd = getEffectiveSpeed(vessel, weatherCacheByZone);
  return distNm / (spd > 0 ? spd : vessel.speedKnot);
}


async function runSupplyChainModel(input) {
  const {
    vessels, routes, oru,
    terminal, selectedLocations, demandBBTUD,
    params, inflationFactor,
    geoMap,
    spatialDistances, // optional Map: "Loc1|Loc2" → distanceNm from SpatialRouteCache
    weatherCacheByZone,   // optional: { 'Laut_Banda': {wave,wind}, ... } — Holtrop & Mennen
    spatialWaypointsMap,  // optional Map: "Loc1|Loc2" → { distanceNm } — spatial distance override
    numVessels = 1, // Python: cap_term divided by num_v
    isFeeder = false,
    resultLimit = 20,
  } = input;

  const tankSize  = TANK_SIZE_M3;
  const tankPrice = TANK_PRICE_USD;
  const distanceMap = buildDistanceMap(routes);
  const sdMap = spatialDistances instanceof Map ? spatialDistances : null;
  const swMap = spatialWaypointsMap instanceof Map ? spatialWaypointsMap : null;
  const CAPEX_TERM_BASE = 3678949.0; // Baseline ORF/Terminal (Badak NGL Bontang)
  const oruMap = new Map(oru.map(o => [o.plantName.trim(), o.fixCapexUSD * inflationFactor]));
  // Python: NO inflation on rent/port. Only tank CAPEX uses inflationFactor.
  const vesselAdj = vessels.slice().sort((a, b) => a.capacityM3 - b.capacityM3);

  const allRoutes = permutations(selectedLocations);
  const results = [];
  const SCF_LNG = params.scf_lng;
  const SCF_MGO = params.scf_mgo;
  const Pyears = params.Penyaluran || 20;
  const totalDemandBBTUD = Object.values(demandBBTUD).reduce((a, b) => a + b, 0);
  let globalScenarioId = 0;

  const Batas_Maksimum_Utilisasi_LNGC = ((365 - params.maintenance_days) / 365) * 100;

  // Pre-compute per-leg voyage hours using spatial waypoints when available
  const allLocations = [terminal, ...selectedLocations];
  const legHoursCache = await buildLegHoursCache(vesselAdj, allLocations, swMap, weatherCacheByZone);

  for (const vessel of vesselAdj) {
    const kapasitas_kapal = vessel.capacityM3;

    for (const route of allRoutes) {
      const fullRoute = [terminal, ...route, terminal];
      let totalDistance = 0;
      let sailingTime = 0;
      const legs = []; // each entry: { dist, hours }

      for (let i = 0; i < fullRoute.length - 1; i++) {
        const origin = fullRoute[i];
        const dest = fullRoute[i + 1];
        // Prefer spatial waypoints distance, then sdMap, then DB table, then haversine
        let dist;
        if (swMap) {
          const sw = swMap.get(`${origin}|${dest}`) || swMap.get(`${dest}|${origin}`);
          if (sw && sw.distanceNm) dist = sw.distanceNm;
        }
        if (dist == null) dist = getDistanceNM(distanceMap, origin, dest, geoMap, sdMap);
        if (!dist) { totalDistance = null; break; }
        totalDistance += dist;
        const legH = getLegHours(legHoursCache, vessel.name, origin, dest, dist, vessel, weatherCacheByZone);
        sailingTime += legH;
        legs.push({ dist, hours: legH });
      }
      if (totalDistance == null) continue;

      const totalLoadingTime = params.loading_hour * (route.length + 1);
      const totalTimeHour = sailingTime + totalLoadingTime;
      const RTD = totalTimeHour / 24;
      const demand_m3_day = route.reduce((acc, l) => acc + ((demandBBTUD[l] / 24.04) * 1000), 0);
      const buffer_day = roundUpDecimal((params.maintenance_days / 365) * RTD);
      const working_volume_lngc = demand_m3_day * RTD + demand_m3_day * buffer_day;
      const unpumpable_vol = ((1 / (1 - params.unpumpable_pct)) - 1) * working_volume_lngc;
      const bog_vol = ((1 / (1 - params.bog_pct * RTD)) - 1) * working_volume_lngc;
      const max_fill = working_volume_lngc + unpumpable_vol + bog_vol;
      const nominal_capacity = max_fill / params.filling_pct;

      // CHECK 1: nominal_capacity <= kapasitas_kapal
      if (nominal_capacity > kapasitas_kapal) continue;

      const days_stock = working_volume_lngc / demand_m3_day;
      const voyages_year = 365 / days_stock;
      const Utilitasi_Factor_LNGC = (RTD * voyages_year / 365) * 100;

      // CHECK 2: utilisasi check
      if (Utilitasi_Factor_LNGC > Batas_Maksimum_Utilisasi_LNGC) continue;

      // CAPEX (Python: cap_locs + cap_term)
      let cap_locs = 0;
      let selected_storage_total = 0;
      for (const loc of route) {
        const demL_m3 = (demandBBTUD[loc] / 24.04) * 1000;
        const s_st = roundUp((demL_m3 * RTD + buffer_day * demL_m3) * params.gross_storage_pct, tankSize);
        selected_storage_total += s_st;

        const tank_capex = (s_st / tankSize) * tankPrice * inflationFactor;
        const oru_capex = oruMap.get(loc) || 0;
        cap_locs += tank_capex + oru_capex;
      }

      // Terminal ORU (Python: capex_term_base inflated, divided by num_v for non-feeder)
      let cap_term = 0;
      if (!isFeeder && kapasitas_kapal < 20000) {
        const capex_term_inflated = CAPEX_TERM_BASE * inflationFactor;
        cap_term = capex_term_inflated / numVessels;
      }
      const total_capex = cap_locs + cap_term;

      const dem_tot_BBTUD = route.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
      const capex_usd_mmbtu = total_capex / (dem_tot_BBTUD * 1000 * 365 * Pyears);

      // OPEX (Python: no risk, no inflation on port/rent)
      const n_leg = legs.length;
      let fuel_voyage = 0;
      let fuel_ballast = 0;
      for (let i = 0; i < n_leg; i++) {
        const time_leg = legs[i].hours; // dynamic voyage hours per leg
        // Python: last leg (return) = ballast fuel only; all other legs = voyage fuel
        if (i === n_leg - 1) {
          fuel_ballast = (time_leg / 24) * vessel.ballastTonPerDay;
        } else {
          fuel_voyage += (time_leg / 24) * vessel.voyageTonPerDay;
        }
      }

      const fuel_berth = (totalLoadingTime / 24) * vessel.berthTonPerDay;

      const lng_fuel_cost = voyages_year * (fuel_voyage + fuel_ballast + fuel_berth) * (SCF_LNG / SCF_MGO) * params.harga_lng;

      // Port cost: dynamic when vessel has GT (Python hitung_biaya_pelabuhan),
      // otherwise fall back to static DB fields.
      let portLTP, portDelay;
      if (vessel.gt) {
        const pc = hitungBiayaPelabuhan(vessel.gt, params.loading_hour, params.analysis_year, params.inflation_rate);
        portLTP  = pc.ltp;
        portDelay = pc.delay;
      } else {
        portLTP  = vessel.portCostLTP;
        portDelay = vessel.portCostDelay;
      }
      // Python: (1 + N_spokes) port calls per voyage × voyages_year
      const port_cost = voyages_year * (1 + route.length) * (portLTP + portDelay);

      const rent_cost = vessel.rentPerDayUSD * 365;

      const op_locs = cap_locs * 0.05;
      const op_term = cap_term * 0.05;
      const total_opex = lng_fuel_cost + port_cost + rent_cost + op_locs + op_term;

      const opex_usd_mmbtu = total_opex / (dem_tot_BBTUD * 1000 * 365);
      const total_cost = capex_usd_mmbtu + opex_usd_mmbtu;

      globalScenarioId += 1;
      results.push({
        'No. Skenario': globalScenarioId,
        'Nama Kapal': vessel.name,
        'Rute': fullRoute.join(' - '),
        'Total Jarak (NM)': totalDistance,
        'RTD': RTD,
        'Demand LNG/day (m3)': demand_m3_day,
        'Nominal Capacity (m3)': nominal_capacity,
        'Kapasitas Kapal (m3)': kapasitas_kapal,
        'Speed (knot)': sailingTime > 0 ? totalDistance / sailingTime : vessel.speedKnot,
        'buffer day': buffer_day,
        'days_stock': days_stock,
        'voyages_year': voyages_year,
        'Utilitasi_Factor_LNGC': Utilitasi_Factor_LNGC,
        'Batas_Maksimum_Utilisasi_LNGC': Batas_Maksimum_Utilisasi_LNGC,
        'selected_storage Total': selected_storage_total,
        'fuel_voyage': fuel_voyage,
        'fuel_ballast': fuel_ballast,
        'fuel_berth': fuel_berth,
        'lng_fuel_cost': lng_fuel_cost,
        'port_cost': port_cost,
        'rent_cost': rent_cost,
        'Total CAPEX (USD)': total_capex,
        'Total CAPEX USD/MMBTU': capex_usd_mmbtu,
        'Total OPEX (USD/year)': total_opex,
        'Total OPEX (USD/MMBTU)': opex_usd_mmbtu,
        'Total Cost (USD/MMBTU)': total_cost,
        'Spokes': route.join(', '),
      });
    }
  }

  results.sort((a, b) => a['Total Cost (USD/MMBTU)'] - b['Total Cost (USD/MMBTU)']);
  return limitRows(results, resultLimit);
}

// --- RISK-AWARE SINGLE VESSEL ENGINE (SAME REFACTOR) ---
async function runSupplyChainModelRisk(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor, riskDB, geoMap,
    spatialDistances,
    weatherCacheByZone,  // optional: Holtrop & Mennen speed
    spatialWaypointsMap, // optional Map: spatial distance override
    numVessels = 1, // Python: cap_term divided by num_v
    isFeeder = false,
    resultLimit = 20,
  } = input;

  const tankSize  = TANK_SIZE_M3;
  const tankPrice = TANK_PRICE_USD;
  const distanceMap = buildDistanceMap(routes);
  const sdMap = spatialDistances instanceof Map ? spatialDistances : null;
  const swMap = spatialWaypointsMap instanceof Map ? spatialWaypointsMap : null;
  const CAPEX_TERM_BASE = 3678949.0; // Baseline ORF/Terminal (Badak NGL Bontang)
  const oruMap = new Map(oru.map(o => [o.plantName.trim(), o.fixCapexUSD * inflationFactor]));
  // Python: NO inflation on rent/port. Only tank CAPEX uses inflationFactor.
  const vesselAdj = vessels.slice().sort((a, b) => a.capacityM3 - b.capacityM3);

  const allRoutes = permutations(selectedLocations);
  const results = [];
  const SCF_LNG = params.scf_lng;
  const SCF_MGO = params.scf_mgo;
  const Pyears = params.Penyaluran || 20;
  const totalDemandBBTUD = Object.values(demandBBTUD).reduce((a, b) => a + b, 0);
  let globalScenarioId = 0;

  const Batas_Maksimum_Utilisasi_LNGC = ((365 - params.maintenance_days) / 365) * 100;

  // Risk impacts
  const im_s = getRiskImpact(riskDB, 'P2_Durasi', 'II.3');
  const impact_lt_II2 = getRiskImpact(riskDB, 'P2_Durasi', 'II.2');
  const impact_lt_II5 = getRiskImpact(riskDB, 'P2_Durasi', 'II.5');

  // Pre-compute per-leg voyage hours using spatial waypoints when available
  const allLocations_risk = [terminal, ...selectedLocations];
  const legHoursCache_risk = await buildLegHoursCache(vesselAdj, allLocations_risk, swMap, weatherCacheByZone);

  for (const vessel of vesselAdj) {
    const kapasitas_kapal = vessel.capacityM3;

    for (const route of allRoutes) {
      const fullRoute = [terminal, ...route, terminal];
      let totalDistance = 0;
      const legs = []; // each entry: { dist, hours } (hours WITHOUT risk multiplier)

      for (let i = 0; i < fullRoute.length - 1; i++) {
        const origin = fullRoute[i];
        const dest = fullRoute[i + 1];
        // Prefer spatial waypoints distance, then sdMap, then DB table, then haversine
        let dist;
        if (swMap) {
          const sw = swMap.get(`${origin}|${dest}`) || swMap.get(`${dest}|${origin}`);
          if (sw && sw.distanceNm) dist = sw.distanceNm;
        }
        if (dist == null) dist = getDistanceNM(distanceMap, origin, dest, geoMap, sdMap);
        if (!dist) { totalDistance = null; break; }
        totalDistance += dist;
        const legH = getLegHours(legHoursCache_risk, vessel.name, origin, dest, dist, vessel, weatherCacheByZone);
        legs.push({ dist, hours: legH });
      }
      if (totalDistance == null) continue;

      // Sailing time with risk
      let sailingTime = 0;
      for (const leg of legs) {
        sailingTime += leg.hours * (1 + im_s);
      }

      // Loading time with risk
      const totalLoadingTime = 
        params.loading_hour * (1 + impact_lt_II2) + 
        route.length * params.loading_hour * (1 + impact_lt_II5);
      
      const totalTimeHour = sailingTime + totalLoadingTime;
      const RTD = totalTimeHour / 24;
      const demand_m3_day = route.reduce((acc, l) => acc + ((demandBBTUD[l] / 24.04) * 1000), 0);
      const buffer_day = roundUpDecimal((params.maintenance_days / 365) * RTD);
      const working_volume_lngc = demand_m3_day * RTD + demand_m3_day * buffer_day;
      const unpumpable_vol = ((1 / (1 - params.unpumpable_pct)) - 1) * working_volume_lngc;
      const bog_vol = ((1 / (1 - params.bog_pct * RTD)) - 1) * working_volume_lngc;
      const max_fill = working_volume_lngc + unpumpable_vol + bog_vol;
      const nominal_capacity = max_fill / params.filling_pct;

      // CHECK 1: nominal_capacity <= kapasitas_kapal
      if (nominal_capacity > kapasitas_kapal) continue;

      const days_stock = working_volume_lngc / demand_m3_day;
      const voyages_year = 365 / days_stock;
      const Utilitasi_Factor_LNGC = (RTD * voyages_year / 365) * 100;

      // CHECK 2: utilisasi check
      if (Utilitasi_Factor_LNGC > Batas_Maksimum_Utilisasi_LNGC) continue;

      // CAPEX with risk
      const risk_capex_6 = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.6');
      const risk_capex_7 = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.7');
      const risk_capex_8 = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.8');
      const impact_capex_start = (risk_capex_6 + risk_capex_7 + risk_capex_8) / 3 || 0;
      const impact_capex_end = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.1') || 0;

      let total_capex = 0.0;
      let selected_storage_total = 0;

      for (const loc of route) {
        const gs_net = ((demandBBTUD[loc] / 24.04) * 1000) * RTD;
        const gs_buffer = gs_net + (buffer_day * (demandBBTUD[loc] / 24.04) * 1000);
        const net_storage = gs_buffer * params.gross_storage_pct;
        const selected_storage = roundUp(net_storage, tankSize);
        selected_storage_total += selected_storage;

        const tank_capex = (selected_storage / tankSize) * tankPrice * inflationFactor;
        const oru_capex = oruMap.get(loc) || 0;
        total_capex += tank_capex + (oru_capex * (1 + impact_capex_start));
      }

      let capex_terminal_risked = 0.0;
      if (!isFeeder && kapasitas_kapal < 20000) {
        const capex_term_inflated = CAPEX_TERM_BASE * inflationFactor;
        capex_terminal_risked = (capex_term_inflated * (1 + impact_capex_end)) / numVessels;
        total_capex += capex_terminal_risked;
      }

      const dem_tot_BBTUD = route.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
      const capex_usd_mmbtu = total_capex / (dem_tot_BBTUD * 1000 * 365 * Pyears);

      // OPEX with risk
      const risk_opex_6 = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.6');
      const risk_opex_7 = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.7');
      const risk_opex_8 = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.8');
      const impact_opex_start = (risk_opex_6 + risk_opex_7 + risk_opex_8) / 3 || 0;
      const impact_opex_end = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.1') || 0;

      let opex_oru = (total_capex - capex_terminal_risked) * 0.05 * (1 + impact_opex_start);
      opex_oru += capex_terminal_risked * 0.05 * (1 + impact_opex_end);

      // Fuel with risk
      // Python: last leg (return to terminal) = ballast fuel only; all others = voyage fuel
      const n_leg = legs.length;
      let fuel_voyage = 0;
      let fuel_ballast = 0;
      for (let i = 0; i < n_leg; i++) {
        const time_leg = legs[i].hours * (1 + im_s); // apply risk multiplier
        if (i === n_leg - 1) {
          fuel_ballast = (time_leg / 24) * vessel.ballastTonPerDay;
        } else {
          fuel_voyage += (time_leg / 24) * vessel.voyageTonPerDay;
        }
      }
      const fuel_berth = (totalLoadingTime / 24) * vessel.berthTonPerDay;
      const fuel_total = fuel_voyage + fuel_ballast + fuel_berth;
      const lng_fuel = fuel_total * (SCF_LNG / SCF_MGO);
      const lng_fuel_cost = voyages_year * lng_fuel * params.harga_lng;

      // Port cost with risk — dynamic when vessel has GT
      const impact_port_start = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.2');
      const impact_port_next = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.5');
      let port_ltp, port_delay;
      if (vessel.gt) {
        const pc = hitungBiayaPelabuhan(vessel.gt, params.loading_hour, params.analysis_year, params.inflation_rate);
        port_ltp  = pc.ltp;
        port_delay = pc.delay;
      } else {
        port_ltp  = vessel.portCostLTP;
        port_delay = vessel.portCostDelay;
      }
      // Python: risk applies to full port cost (ltp + delay), not ltp alone
      const port_start_per_voyage = (port_ltp + port_delay) * (1 + impact_port_start);
      const port_next_per_voyage = route.length * (port_ltp + port_delay) * (1 + impact_port_next);
      const port_cost = voyages_year * (port_start_per_voyage + port_next_per_voyage);

      const rent_cost = vessel.rentPerDayUSD * 365;
      const total_opex = lng_fuel_cost + port_cost + rent_cost + opex_oru;

      const opex_usd_mmbtu = total_opex / (dem_tot_BBTUD * 1000 * 365);
      const total_cost = capex_usd_mmbtu + opex_usd_mmbtu;

      globalScenarioId += 1;
      results.push({
        'No. Skenario': globalScenarioId,
        'Nama Kapal': vessel.name,
        'Rute': fullRoute.join(' - '),
        'Total Jarak (NM)': totalDistance,
        'RTD': RTD,
        'Demand LNG/day (m3)': demand_m3_day,
        'Nominal Capacity (m3)': nominal_capacity,
        'Kapasitas Kapal (m3)': kapasitas_kapal,
        'Speed (knot)': sailingTime > 0 ? totalDistance / sailingTime : vessel.speedKnot,
        'buffer day': buffer_day,
        'days_stock': days_stock,
        'voyages_year': voyages_year,
        'Utilitasi_Factor_LNGC': Utilitasi_Factor_LNGC,
        'Batas_Maksimum_Utilisasi_LNGC': Batas_Maksimum_Utilisasi_LNGC,
        'selected_storage Total': selected_storage_total,
        'fuel_voyage': fuel_voyage,
        'fuel_ballast': fuel_ballast,
        'fuel_berth': fuel_berth,
        'lng_fuel_cost': lng_fuel_cost,
        'port_cost': port_cost,
        'rent_cost': rent_cost,
        'Total CAPEX (USD)': total_capex,
        'Total CAPEX USD/MMBTU': capex_usd_mmbtu,
        'Total OPEX (USD/year)': total_opex,
        'Total OPEX (USD/MMBTU)': opex_usd_mmbtu,
        'Total Cost (USD/MMBTU)': total_cost,
        'Spokes': route.join(', '),
      });
    }
  }

  results.sort((a, b) => a['Total Cost (USD/MMBTU)'] - b['Total Cost (USD/MMBTU)']);
  return limitRows(results, resultLimit);
}

// Twin vessel probability model
async function runTwoVesselProbabilityModel(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor,
    enforceSameVessel = true,
    vesselNames,
    shareTerminalORU = true,
    geoMap,
    spatialDistances,
    weatherCacheByZone,
    spatialWaypointsMap,
  } = input;

  const total = [];
  const n = selectedLocations.length;
  if (n < 2) {
    return { kapal_1: [], kapal_2: [], total: [] };
  }

  const Pyears = params.Penyaluran || 20;
  const totalDemandBBTUD = Object.values(demandBBTUD).reduce((a, b) => a + b, 0);
  const seen = new Set();
  let globalScenarioId = 0;

  for (let n1 = 1; n1 <= n - 1; n1++) {
    for (const comb of combinations(selectedLocations, n1)) {
      const loc_k1 = comb.slice().sort();
      const loc_k2 = selectedLocations.filter(l => !loc_k1.includes(l)).sort();
      const key = JSON.stringify([loc_k1, loc_k2]);
      if (seen.has(key)) continue;
      seen.add(key);

      const demand_k1 = Object.fromEntries(loc_k1.map(k => [k, demandBBTUD[k]]));
      const demand_k2 = Object.fromEntries(loc_k2.map(k => [k, demandBBTUD[k]]));

      const df1 = await runSupplyChainModel({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k1, demandBBTUD: demand_k1,
        params, inflationFactor, geoMap,
        spatialDistances, weatherCacheByZone, spatialWaypointsMap,
        numVessels: 2,
      });
      const df2 = await runSupplyChainModel({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k2, demandBBTUD: demand_k2,
        params, inflationFactor, geoMap,
        spatialDistances, weatherCacheByZone, spatialWaypointsMap,
        numVessels: 2,
      });

      if (!df1.length || !df2.length) continue;

      const label = `${loc_k1.length}:${loc_k2.length}`;

      // Python: vol_1, vol_2 = demand volume for each partition subset
      const vol_k1 = loc_k1.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
      const vol_k2 = loc_k2.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);

      for (const k1 of df1) {
        for (const k2 of df2) {
          if (Array.isArray(vesselNames) && vesselNames.length === 2) {
            if (k1['Nama Kapal'] !== vesselNames[0] || k2['Nama Kapal'] !== vesselNames[1]) continue;
          } else if (enforceSameVessel) {
            if (k1['Nama Kapal'] !== k2['Nama Kapal'] || k1['Kapasitas Kapal (m3)'] !== k2['Kapasitas Kapal (m3)']) continue;
          }

          const c_usd = k1['Total CAPEX (USD)'] + k2['Total CAPEX (USD)'];
          const o_usd_year = k1['Total OPEX (USD/year)'] + k2['Total OPEX (USD/year)'];

          // Python Milk Run weighted system cost formula:
          // cost_numerator = sum(Total_Cost_i * vol_i * 1000 * 365 - CAPEX_i / Pyears)
          // sys_cost = (c_usd + cost_numerator * Pyears) / (tot_cluster * 1000 * 365 * Pyears)
          const cost_numerator =
            (k1['Total Cost (USD/MMBTU)'] * vol_k1 * 1000 * 365 - k1['Total CAPEX (USD)'] / Pyears) +
            (k2['Total Cost (USD/MMBTU)'] * vol_k2 * 1000 * 365 - k2['Total CAPEX (USD)'] / Pyears);
          const sys_cost = (c_usd + (cost_numerator * Pyears)) / (totalDemandBBTUD * 1000 * 365 * Pyears);

          globalScenarioId += 1;
          total.push({
            'No. Skenario': globalScenarioId,
            'Probability': label,
            'Nama Kapal': k1['Nama Kapal'],
            'Kapasitas Kapal (m3)': k1['Kapasitas Kapal (m3)'],
            // Kapal 1 details
            'Rute Kapal 1': k1['Rute'],
            'Total Jarak Kapal 1 (NM)': k1['Total Jarak (NM)'],
            'RTD Kapal 1': k1['RTD'],
            'Demand LNG/day Kapal 1 (m3)': k1['Demand LNG/day (m3)'],
            'Nominal Capacity Kapal 1 (m3)': k1['Nominal Capacity (m3)'],
            'Speed Kapal 1 (knot)': k1['Speed (knot)'],
            'buffer day Kapal 1': k1['buffer day'],
            'days_stock Kapal 1': k1['days_stock'],
            'voyages_year Kapal 1': k1['voyages_year'],
            'Utilitasi_Factor_LNGC Kapal 1': k1['Utilitasi_Factor_LNGC'],
            'Batas_Maksimum_Utilisasi_LNGC Kapal 1': k1['Batas_Maksimum_Utilisasi_LNGC'],
            'selected_storage Total Kapal 1': k1['selected_storage Total'],
            'fuel_voyage Kapal 1': k1['fuel_voyage'],
            'fuel_ballast Kapal 1': k1['fuel_ballast'],
            'fuel_berth Kapal 1': k1['fuel_berth'],
            'lng_fuel_cost Kapal 1': k1['lng_fuel_cost'],
            'port_cost Kapal 1': k1['port_cost'],
            'rent_cost Kapal 1': k1['rent_cost'],
            'CAPEX Kapal 1': k1['Total CAPEX (USD)'],
            'CAPEX USD/MMBTU Kapal 1': k1['Total CAPEX USD/MMBTU'],
            'OPEX Kapal 1': k1['Total OPEX (USD/year)'],
            'OPEX USD/MMBTU Kapal 1': k1['Total OPEX (USD/MMBTU)'],
            'Cost Kapal 1': k1['Total Cost (USD/MMBTU)'],
            'Spokes Kapal 1': k1['Spokes'],
            // Kapal 2 details
            'Rute Kapal 2': k2['Rute'],
            'Total Jarak Kapal 2 (NM)': k2['Total Jarak (NM)'],
            'RTD Kapal 2': k2['RTD'],
            'Demand LNG/day Kapal 2 (m3)': k2['Demand LNG/day (m3)'],
            'Nominal Capacity Kapal 2 (m3)': k2['Nominal Capacity (m3)'],
            'Speed Kapal 2 (knot)': k2['Speed (knot)'],
            'buffer day Kapal 2': k2['buffer day'],
            'days_stock Kapal 2': k2['days_stock'],
            'voyages_year Kapal 2': k2['voyages_year'],
            'Utilitasi_Factor_LNGC Kapal 2': k2['Utilitasi_Factor_LNGC'],
            'Batas_Maksimum_Utilisasi_LNGC Kapal 2': k2['Batas_Maksimum_Utilisasi_LNGC'],
            'selected_storage Total Kapal 2': k2['selected_storage Total'],
            'fuel_voyage Kapal 2': k2['fuel_voyage'],
            'fuel_ballast Kapal 2': k2['fuel_ballast'],
            'fuel_berth Kapal 2': k2['fuel_berth'],
            'lng_fuel_cost Kapal 2': k2['lng_fuel_cost'],
            'port_cost Kapal 2': k2['port_cost'],
            'rent_cost Kapal 2': k2['rent_cost'],
            'CAPEX Kapal 2': k2['Total CAPEX (USD)'],
            'CAPEX USD/MMBTU Kapal 2': k2['Total CAPEX USD/MMBTU'],
            'OPEX Kapal 2': k2['Total OPEX (USD/year)'],
            'OPEX USD/MMBTU Kapal 2': k2['Total OPEX (USD/MMBTU)'],
            'Cost Kapal 2': k2['Total Cost (USD/MMBTU)'],
            'Spokes Kapal 2': k2['Spokes'],
            // System totals
            'System CAPEX (USD)': c_usd,
            'System OPEX (USD/year)': o_usd_year,
            'System Cost (USD/MMBTU)': sys_cost,
          });
        }
      }
    }
  }

  total.sort((a, b) => a['System Cost (USD/MMBTU)'] - b['System Cost (USD/MMBTU)']);
  const topTotal = total.slice(0, 20);

  // Re-number scenarios sequentially after sorting
  topTotal.forEach((t, idx) => { t['No. Skenario'] = idx + 1; });

  // Build kapal_1 and kapal_2 tables with full columns
  const kapal_1 = topTotal.map(t => ({
    'No. Skenario': t['No. Skenario'],
    'Probability': t['Probability'],
    'Nama Kapal': t['Nama Kapal'],
    'Rute': t['Rute Kapal 1'],
    'Total Jarak (NM)': t['Total Jarak Kapal 1 (NM)'],
    'RTD': t['RTD Kapal 1'],
    'Demand LNG/day (m3)': t['Demand LNG/day Kapal 1 (m3)'],
    'Nominal Capacity (m3)': t['Nominal Capacity Kapal 1 (m3)'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Speed (knot)': t['Speed Kapal 1 (knot)'],
    'buffer day': t['buffer day Kapal 1'],
    'days_stock': t['days_stock Kapal 1'],
    'voyages_year': t['voyages_year Kapal 1'],
    'Utilitasi_Factor_LNGC': t['Utilitasi_Factor_LNGC Kapal 1'],
    'Batas_Maksimum_Utilisasi_LNGC': t['Batas_Maksimum_Utilisasi_LNGC Kapal 1'],
    'selected_storage Total': t['selected_storage Total Kapal 1'],
    'fuel_voyage': t['fuel_voyage Kapal 1'],
    'fuel_ballast': t['fuel_ballast Kapal 1'],
    'fuel_berth': t['fuel_berth Kapal 1'],
    'lng_fuel_cost': t['lng_fuel_cost Kapal 1'],
    'port_cost': t['port_cost Kapal 1'],
    'rent_cost': t['rent_cost Kapal 1'],
    'Total CAPEX (USD)': t['CAPEX Kapal 1'],
    'Total CAPEX USD/MMBTU': t['CAPEX USD/MMBTU Kapal 1'],
    'Total OPEX (USD/year)': t['OPEX Kapal 1'],
    'Total OPEX (USD/MMBTU)': t['Total OPEX (USD/MMBTU) Kapal 1'],
    'Total Cost (USD/MMBTU)': t['Cost Kapal 1'],
    'Spokes': t['Spokes Kapal 1'],
  }));

  const kapal_2 = topTotal.map(t => ({
    'No. Skenario': t['No. Skenario'],
    'Probability': t['Probability'],
    'Nama Kapal': t['Nama Kapal'],
    'Rute': t['Rute Kapal 2'],
    'Total Jarak (NM)': t['Total Jarak Kapal 2 (NM)'],
    'RTD': t['RTD Kapal 2'],
    'Demand LNG/day (m3)': t['Demand LNG/day Kapal 2 (m3)'],
    'Nominal Capacity (m3)': t['Nominal Capacity Kapal 2 (m3)'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Speed (knot)': t['Speed Kapal 2 (knot)'],
    'buffer day': t['buffer day Kapal 2'],
    'days_stock': t['days_stock Kapal 2'],
    'voyages_year': t['voyages_year Kapal 2'],
    'Utilitasi_Factor_LNGC': t['Utilitasi_Factor_LNGC Kapal 2'],
    'Batas_Maksimum_Utilisasi_LNGC': t['Batas_Maksimum_Utilisasi_LNGC Kapal 2'],
    'selected_storage Total': t['selected_storage Total Kapal 2'],
    'fuel_voyage': t['fuel_voyage Kapal 2'],
    'fuel_ballast': t['fuel_ballast Kapal 2'],
    'fuel_berth': t['fuel_berth Kapal 2'],
    'lng_fuel_cost': t['lng_fuel_cost Kapal 2'],
    'port_cost': t['port_cost Kapal 2'],
    'rent_cost': t['rent_cost Kapal 2'],
    'Total CAPEX (USD)': t['CAPEX Kapal 2'],
    'Total CAPEX USD/MMBTU': t['Total CAPEX USD/MMBTU Kapal 2'],
    'Total OPEX (USD/year)': t['OPEX Kapal 2'],
    'Total OPEX (USD/MMBTU)': t['Total OPEX (USD/MMBTU) Kapal 2'],
    'Total Cost (USD/MMBTU)': t['Cost Kapal 2'],
    'Spokes': t['Spokes Kapal 2'],
  }));

  // System table (simplified gabungan)
  const system = topTotal.map(t => ({
    'No. Skenario': t['No. Skenario'],
    'Probability': t['Probability'],
    'Nama Kapal': t['Nama Kapal'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Rute Kapal 1': t['Rute Kapal 1'],
    'Spokes Kapal 1': t['Spokes Kapal 1'],
    'Rute Kapal 2': t['Rute Kapal 2'],
    'Spokes Kapal 2': t['Spokes Kapal 2'],
    'System CAPEX (USD)': t['System CAPEX (USD)'],
    'System OPEX (USD/year)': t['System OPEX (USD/year)'],
    'System Cost (USD/MMBTU)': t['System Cost (USD/MMBTU)'],
  }));

  return { kapal_1, kapal_2, total: system };
}

// Twin vessel probability model (RISK)
async function runTwoVesselProbabilityModelRisk(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor, riskDB,
    enforceSameVessel = true,
    vesselNames,
    geoMap,
    spatialDistances,
    weatherCacheByZone,
    spatialWaypointsMap,
  } = input;

  const total = [];
  const n = selectedLocations.length;
  if (n < 2) {
    return { kapal_1: [], kapal_2: [], total: [] };
  }

  const Pyears = params.Penyaluran || 20;
  const totalDemandBBTUD = Object.values(demandBBTUD).reduce((a, b) => a + b, 0);
  const seen = new Set();
  let globalScenarioId = 0;

  for (let n1 = 1; n1 <= n - 1; n1++) {
    for (const comb of combinations(selectedLocations, n1)) {
      const loc_k1 = comb.slice().sort();
      const loc_k2 = selectedLocations.filter(l => !loc_k1.includes(l)).sort();
      const key = JSON.stringify([loc_k1, loc_k2]);
      if (seen.has(key)) continue;
      seen.add(key);

      const demand_k1 = Object.fromEntries(loc_k1.map(k => [k, demandBBTUD[k]]));
      const demand_k2 = Object.fromEntries(loc_k2.map(k => [k, demandBBTUD[k]]));

      const df1 = await runSupplyChainModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k1, demandBBTUD: demand_k1,
        params, inflationFactor, riskDB, geoMap,
        spatialDistances, weatherCacheByZone, spatialWaypointsMap,
        numVessels: 2,
      });
      const df2 = await runSupplyChainModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k2, demandBBTUD: demand_k2,
        params, inflationFactor, riskDB, geoMap,
        spatialDistances, weatherCacheByZone, spatialWaypointsMap,
        numVessels: 2,
      });

      if (!df1.length || !df2.length) continue;

      const label = `${loc_k1.length}:${loc_k2.length}`;

      // Python: vol_1, vol_2 = demand volume for each partition subset
      const vol_k1 = loc_k1.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
      const vol_k2 = loc_k2.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);

      for (const k1 of df1) {
        for (const k2 of df2) {
          if (Array.isArray(vesselNames) && vesselNames.length === 2) {
            if (k1['Nama Kapal'] !== vesselNames[0] || k2['Nama Kapal'] !== vesselNames[1]) continue;
          } else if (enforceSameVessel) {
            if (k1['Nama Kapal'] !== k2['Nama Kapal'] || k1['Kapasitas Kapal (m3)'] !== k2['Kapasitas Kapal (m3)']) continue;
          }

          const c_usd = k1['Total CAPEX (USD)'] + k2['Total CAPEX (USD)'];
          const o_usd_year = k1['Total OPEX (USD/year)'] + k2['Total OPEX (USD/year)'];

          // Python Milk Run weighted system cost formula:
          // cost_numerator = sum(Total_Cost_i * vol_i * 1000 * 365 - CAPEX_i / Pyears)
          // sys_cost = (c_usd + cost_numerator * Pyears) / (tot_cluster * 1000 * 365 * Pyears)
          const cost_numerator =
            (k1['Total Cost (USD/MMBTU)'] * vol_k1 * 1000 * 365 - k1['Total CAPEX (USD)'] / Pyears) +
            (k2['Total Cost (USD/MMBTU)'] * vol_k2 * 1000 * 365 - k2['Total CAPEX (USD)'] / Pyears);
          const sys_cost = (c_usd + (cost_numerator * Pyears)) / (totalDemandBBTUD * 1000 * 365 * Pyears);

          globalScenarioId += 1;
          total.push({
            'No. Skenario': globalScenarioId,
            'Probability': label,
            'Nama Kapal': k1['Nama Kapal'],
            'Kapasitas Kapal (m3)': k1['Kapasitas Kapal (m3)'],
            // Kapal 1 full details
            'Rute Kapal 1': k1['Rute'],
            'Total Jarak Kapal 1 (NM)': k1['Total Jarak (NM)'],
            'RTD Kapal 1': k1['RTD'],
            'Demand LNG/day Kapal 1 (m3)': k1['Demand LNG/day (m3)'],
            'Nominal Capacity Kapal 1 (m3)': k1['Nominal Capacity (m3)'],
            'Speed Kapal 1 (knot)': k1['Speed (knot)'],
            'buffer day Kapal 1': k1['buffer day'],
            'days_stock Kapal 1': k1['days_stock'],
            'voyages_year Kapal 1': k1['voyages_year'],
            'Utilitasi_Factor_LNGC Kapal 1': k1['Utilitasi_Factor_LNGC'],
            'Batas_Maksimum_Utilisasi_LNGC Kapal 1': k1['Batas_Maksimum_Utilisasi_LNGC'],
            'selected_storage Total Kapal 1': k1['selected_storage Total'],
            'fuel_voyage Kapal 1': k1['fuel_voyage'],
            'fuel_ballast Kapal 1': k1['fuel_ballast'],
            'fuel_berth Kapal 1': k1['fuel_berth'],
            'lng_fuel_cost Kapal 1': k1['lng_fuel_cost'],
            'port_cost Kapal 1': k1['port_cost'],
            'rent_cost Kapal 1': k1['rent_cost'],
            'CAPEX Kapal 1': k1['Total CAPEX (USD)'],
            'CAPEX USD/MMBTU Kapal 1': k1['Total CAPEX USD/MMBTU'],
            'OPEX Kapal 1': k1['Total OPEX (USD/year)'],
            'OPEX USD/MMBTU Kapal 1': k1['Total OPEX (USD/MMBTU)'],
            'Cost Kapal 1': k1['Total Cost (USD/MMBTU)'],
            'Spokes Kapal 1': k1['Spokes'],
            // Kapal 2 full details
            'Rute Kapal 2': k2['Rute'],
            'Total Jarak Kapal 2 (NM)': k2['Total Jarak (NM)'],
            'RTD Kapal 2': k2['RTD'],
            'Demand LNG/day Kapal 2 (m3)': k2['Demand LNG/day (m3)'],
            'Nominal Capacity Kapal 2 (m3)': k2['Nominal Capacity (m3)'],
            'Speed Kapal 2 (knot)': k2['Speed (knot)'],
            'buffer day Kapal 2': k2['buffer day'],
            'days_stock Kapal 2': k2['days_stock'],
            'voyages_year Kapal 2': k2['voyages_year'],
            'Utilitasi_Factor_LNGC Kapal 2': k2['Utilitasi_Factor_LNGC'],
            'Batas_Maksimum_Utilisasi_LNGC Kapal 2': k2['Batas_Maksimum_Utilisasi_LNGC'],
            'selected_storage Total Kapal 2': k2['selected_storage Total'],
            'fuel_voyage Kapal 2': k2['fuel_voyage'],
            'fuel_ballast Kapal 2': k2['fuel_ballast'],
            'fuel_berth Kapal 2': k2['fuel_berth'],
            'lng_fuel_cost Kapal 2': k2['lng_fuel_cost'],
            'port_cost Kapal 2': k2['port_cost'],
            'rent_cost Kapal 2': k2['rent_cost'],
            'CAPEX Kapal 2': k2['Total CAPEX (USD)'],
            'CAPEX USD/MMBTU Kapal 2': k2['Total CAPEX USD/MMBTU'],
            'OPEX Kapal 2': k2['Total OPEX (USD/year)'],
            'OPEX USD/MMBTU Kapal 2': k2['Total OPEX (USD/MMBTU)'],
            'Cost Kapal 2': k2['Total Cost (USD/MMBTU)'],
            'Spokes Kapal 2': k2['Spokes'],
            // System totals
            'System CAPEX (USD)': c_usd,
            'System OPEX (USD/year)': o_usd_year,
            'System Cost (USD/MMBTU)': sys_cost,
          });
        }
      }
    }
  }

  total.sort((a, b) => a['System Cost (USD/MMBTU)'] - b['System Cost (USD/MMBTU)']);
  const topTotal = total.slice(0, 20);

  // Re-number scenarios sequentially after sorting
  topTotal.forEach((t, idx) => { t['No. Skenario'] = idx + 1; });

  // Build kapal_1 and kapal_2 tables with full columns
  const kapal_1 = topTotal.map(t => ({
    'No. Skenario': t['No. Skenario'],
    'Probability': t['Probability'],
    'Nama Kapal': t['Nama Kapal'],
    'Rute': t['Rute Kapal 1'],
    'Total Jarak (NM)': t['Total Jarak Kapal 1 (NM)'],
    'RTD': t['RTD Kapal 1'],
    'Demand LNG/day (m3)': t['Demand LNG/day Kapal 1 (m3)'],
    'Nominal Capacity (m3)': t['Nominal Capacity Kapal 1 (m3)'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Speed (knot)': t['Speed Kapal 1 (knot)'],
    'buffer day': t['buffer day Kapal 1'],
    'days_stock': t['days_stock Kapal 1'],
    'voyages_year': t['voyages_year Kapal 1'],
    'Utilitasi_Factor_LNGC': t['Utilitasi_Factor_LNGC Kapal 1'],
    'Batas_Maksimum_Utilisasi_LNGC': t['Batas_Maksimum_Utilisasi_LNGC Kapal 1'],
    'selected_storage Total': t['selected_storage Total Kapal 1'],
    'fuel_voyage': t['fuel_voyage Kapal 1'],
    'fuel_ballast': t['fuel_ballast Kapal 1'],
    'fuel_berth': t['fuel_berth Kapal 1'],
    'lng_fuel_cost': t['lng_fuel_cost Kapal 1'],
    'port_cost': t['port_cost Kapal 1'],
    'rent_cost': t['rent_cost Kapal 1'],
    'Total CAPEX (USD)': t['CAPEX Kapal 1'],
    'Total CAPEX USD/MMBTU': t['CAPEX USD/MMBTU Kapal 1'],
    'Total OPEX (USD/year)': t['OPEX Kapal 1'],
    'Total OPEX (USD/MMBTU)': t['Total OPEX (USD/MMBTU) Kapal 1'],
    'Total Cost (USD/MMBTU)': t['Cost Kapal 1'],
    'Spokes': t['Spokes Kapal 1'],
  }));

  const kapal_2 = topTotal.map(t => ({
    'No. Skenario': t['No. Skenario'],
    'Probability': t['Probability'],
    'Nama Kapal': t['Nama Kapal'],
    'Rute': t['Rute Kapal 2'],
    'Total Jarak (NM)': t['Total Jarak Kapal 2 (NM)'],
    'RTD': t['RTD Kapal 2'],
    'Demand LNG/day (m3)': t['Demand LNG/day Kapal 2 (m3)'],
    'Nominal Capacity (m3)': t['Nominal Capacity Kapal 2 (m3)'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Speed (knot)': t['Speed Kapal 2 (knot)'],
    'buffer day': t['buffer day Kapal 2'],
    'days_stock': t['days_stock Kapal 2'],
    'voyages_year': t['voyages_year Kapal 2'],
    'Utilitasi_Factor_LNGC': t['Utilitasi_Factor_LNGC Kapal 2'],
    'Batas_Maksimum_Utilisasi_LNGC': t['Batas_Maksimum_Utilisasi_LNGC Kapal 2'],
    'selected_storage Total': t['selected_storage Total Kapal 2'],
    'fuel_voyage': t['fuel_voyage Kapal 2'],
    'fuel_ballast': t['fuel_ballast Kapal 2'],
    'fuel_berth': t['fuel_berth Kapal 2'],
    'lng_fuel_cost': t['lng_fuel_cost Kapal 2'],
    'port_cost': t['port_cost Kapal 2'],
    'rent_cost': t['rent_cost Kapal 2'],
    'Total CAPEX (USD)': t['CAPEX Kapal 2'],
    'Total CAPEX USD/MMBTU': t['Total CAPEX USD/MMBTU Kapal 2'],
    'Total OPEX (USD/year)': t['OPEX Kapal 2'],
    'Total OPEX (USD/MMBTU)': t['Total OPEX (USD/MMBTU) Kapal 2'],
    'Total Cost (USD/MMBTU)': t['Cost Kapal 2'],
    'Spokes': t['Spokes Kapal 2'],
  }));

  // System table (simplified gabungan)
  const system = topTotal.map(t => ({
    'No. Skenario': t['No. Skenario'],
    'Probability': t['Probability'],
    'Nama Kapal': t['Nama Kapal'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Rute Kapal 1': t['Rute Kapal 1'],
    'Spokes Kapal 1': t['Spokes Kapal 1'],
    'Rute Kapal 2': t['Rute Kapal 2'],
    'Spokes Kapal 2': t['Spokes Kapal 2'],
    'System CAPEX (USD)': t['System CAPEX (USD)'],
    'System OPEX (USD/year)': t['System OPEX (USD/year)'],
    'System Cost (USD/MMBTU)': t['System Cost (USD/MMBTU)'],
  }));

  return { kapal_1, kapal_2, total: system };
}

// NEW: partition generator (port dari Python generate_partitions)
function generatePartitions(collection, numSubsets) {
  const arr = Array.isArray(collection) ? collection.slice() : [];
  const n = arr.length;
  if (numSubsets < 1 || numSubsets > n) return [];
  const results = [];

  function helper(index, current) {
    if (index === n) {
      if (current.length === numSubsets && current.every(g => g.length > 0)) {
        results.push(current.map(g => g.slice()));
      }
      return;
    }
    const item = arr[index];
    // option 1: put item in a new group (if we still can create groups)
    if (current.length < numSubsets) {
      helper(index + 1, [...current, [item]]);
    }
    // option 2: put item into existing groups
    for (let i = 0; i < current.length; i++) {
      const copy = current.map(g => g.slice());
      copy[i].push(item);
      helper(index + 1, copy);
    }
  }

  helper(0, []);
  return results;
}

// NEW: Hub & Spoke 2-vessel RISK engine (port dari Python cabang HUB & SPOKE, num_v=2)
async function runHubSpokeTwoVesselModelRisk(input) {
  const {
    vessels,
    routes,
    oru,
    terminal,
    selectedLocations: locs,
    demandBBTUD,
    params,
    inflationFactor,
    riskDB,
    geoMap, // NEW: dipakai di perhitungan mother & feeder
    spatialDistances,
    spatialWaypointsMap,
    weatherCacheByZone,
    // twinCfg (ratios, enforceSameVessel, vesselNames, ...) diabaikan di sini, karena
    // algoritma Hub & Spoke N-dimensional tidak pakai rasio pembagian demand
  } = input;

  if (!Array.isArray(locs) || locs.length === 0) {
    return { mother: [], feeder1: [], feeder2: [], system: [] };
  }

  const tankSize  = TANK_SIZE_M3;
  const tankPrice = TANK_PRICE_USD; // internal constants, not user input
  // Merge spatialWaypointsMap distances into sdMap so all distance lookups benefit from real routes
  const sdMap = (() => {
    const base = spatialDistances instanceof Map ? new Map(spatialDistances) : new Map();
    if (spatialWaypointsMap instanceof Map) {
      for (const [k, v] of spatialWaypointsMap) {
        if (v && typeof v.distanceNm === 'number') base.set(k, v.distanceNm);
      }
    }
    return base.size ? base : null;
  })();
  const numV = 2; // saat ini: 1 mother + 2 feeder (bisa di-generalize nanti)
  const LNG_EC = 24.04;
  const BASE_YEAR = 2022;
  const Pyears = params.Penyaluran || 20;

  // distance map dua-arah
  const distMap = new Map();
  for (const r of routes) {
    distMap.set(`${r.origin} - ${r.destination}`, r.nauticalMiles);
    distMap.set(`${r.destination} - ${r.origin}`, r.nauticalMiles);
  }

  const CAPEX_TERM_BASE = 3678949.0; // Baseline ORF/Terminal (Badak NGL Bontang)
  const oruMap = new Map(oru.map(o => [o.plantName.trim(), o.fixCapexUSD * inflationFactor]));
  // Python: NO inflation on rent/port. Only tank CAPEX uses inflationFactor.
  const kSorted = vessels.slice().sort((a, b) => a.capacityM3 - b.capacityM3);

  // Pre-compute per-leg voyage hours for all vessel × location pairs
  const swMap2v = spatialWaypointsMap instanceof Map ? spatialWaypointsMap : null;
  const hs2AllLocs = [terminal, ...locs];
  const twoVesselLegHoursCache = await buildLegHoursCache(kSorted, hs2AllLocs, swMap2v, weatherCacheByZone);

  const gr = (p, ii) => getRiskImpact(riskDB, p, ii) || 0.0;
  const im_s = gr('P2_Durasi', 'II.3');

  // HELPER: mother vessel (Terminal → Hub → Terminal)
  function calcMother(hub, totDemBBTUD) {
    const rows = [];
    // CHANGED: jarak dari DB atau geoMap
    const baseDist =
      getDistanceNM(distMap, terminal, hub, geoMap, sdMap) ??
      getDistanceNM(distMap, hub, terminal, geoMap, sdMap);
    if (!baseDist) return rows;

    const dist = baseDist;
    const dem_m3 = (totDemBBTUD * 1000) / LNG_EC;
    const risk_capex_6 = gr('P3_Biaya_Investasi', 'II.6');
    const risk_capex_7 = gr('P3_Biaya_Investasi', 'II.7');
    const risk_capex_8 = gr('P3_Biaya_Investasi', 'II.8');
    const impact_capex_start = (risk_capex_6 + risk_capex_7 + risk_capex_8) / 3 || 0;
    const impact_capex_end = gr('P3_Biaya_Investasi', 'II.1');

    const risk_opex_6 = gr('P1_Biaya_Operasi', 'II.6');
    const risk_opex_7 = gr('P1_Biaya_Operasi', 'II.7');
    const risk_opex_8 = gr('P1_Biaya_Operasi', 'II.8');
    const impact_opex_start = (risk_opex_6 + risk_opex_7 + risk_opex_8) / 3 || 0;
    const impact_opex_end = gr('P1_Biaya_Operasi', 'II.1');

    const impact_lt_II2 = gr('P2_Durasi', 'II.2');
    const impact_lt_II5 = gr('P2_Durasi', 'II.5');

    for (const k of kSorted) {
      const rawH = getLegHours(twoVesselLegHoursCache, k.name, terminal, hub, dist, k, weatherCacheByZone);
      const st = rawH * 2 * (1 + im_s); // jam
      const lt =
        params.loading_hour * (1 + impact_lt_II2) +
        params.loading_hour * (1 + impact_lt_II5); // jam
      const rtd = (st + lt) / 24.0;

      const buf = roundUpDecimal((params.maintenance_days / 365.0) * rtd);
      const w_vol = dem_m3 * rtd + dem_m3 * buf;

      const nom_cap =
        (w_vol +
          (((1 / (1 - params.unpumpable_pct)) - 1) * w_vol) +
          (((1 / (1 - params.bog_pct * rtd)) - 1) * w_vol)) /
        params.filling_pct;
      if (nom_cap > k.capacityM3) continue;

      const ds = w_vol / dem_m3;
      const vy = 365.0 / ds;
      const ut = (rtd * vy / 365.0) * 100.0;
      const utMax = ((365.0 - params.maintenance_days) / 365.0) * 100.0;
      if (ut > utMax) continue;

      const sel_st = roundUp(
        (dem_m3 * rtd + buf * dem_m3) * params.gross_storage_pct,
        500
      );

      const tankCapexHub = (sel_st / tankSize) * tankPrice * inflationFactor; // FIXED
      const oruHub = oruMap.get(hub) || 0;
      const cap_hub = tankCapexHub + oruHub * (1 + impact_capex_start);

      const capex_term_inflated_hs = CAPEX_TERM_BASE * inflationFactor;
      const cap_term =
        k.capacityM3 < 20000 ? capex_term_inflated_hs * (1 + impact_capex_end) : 0;

      const t_cap = cap_hub + cap_term;

      // Python: mother forward (terminal→hub) = voyage fuel; return (hub→terminal) = ballast fuel
      const fv = rawH * (1 + im_s) / 24.0 * k.voyageTonPerDay;
      const fb = rawH * (1 + im_s) / 24.0 * k.ballastTonPerDay;
      const fbt = (lt / 24.0) * k.berthTonPerDay;

      const lng_c =
        vy *
        (fv + fb + fbt) *
        (params.scf_lng / params.scf_mgo) *
        params.harga_lng;

      // Dynamic port cost; Python: pc = vy*(ltp+delay)*(2+risk2+risk5)
      let portLTP_m, portDelay_m;
      if (k.gt) {
        const pcDyn = hitungBiayaPelabuhan(k.gt, params.loading_hour, params.analysis_year, params.inflation_rate);
        portLTP_m = pcDyn.ltp;
        portDelay_m = pcDyn.delay;
      } else {
        portLTP_m = k.portCostLTP;
        portDelay_m = k.portCostDelay;
      }
      const pc = vy * (portLTP_m + portDelay_m) *
        (2 + gr('P1_Biaya_Operasi', 'II.2') + gr('P1_Biaya_Operasi', 'II.5'));

      const rc = k.rentPerDayUSD * 365.0;

      const op_hub = cap_hub * 0.05 * (1 + impact_opex_start);
      const op_term = cap_term * 0.05 * (1 + impact_opex_end);
      const t_op = lng_c + pc + rc + op_hub + op_term;

      const c_unit =
        t_cap / (totDemBBTUD * 1000.0 * 365.0 * Pyears);
      const o_unit =
        t_op / (totDemBBTUD * 1000.0 * 365.0);

      rows.push({
        'Nama Kapal': k.name,
        'Rute': `${terminal} - ${hub} - ${terminal}`,
        'Total Jarak (NM)': dist * 2,
        'RTD (day)': rtd,
        'RTD': rtd,
        'Demand LNG/day (m3)': dem_m3,
        'Nominal Capacity (m3)': nom_cap,
        'Kapasitas Kapal (m3)': k.capacityM3,
        'Speed (knot)': rawH > 0 ? dist / rawH : k.speedKnot,
        'buffer day': buf,
        'days_stock': ds,
        'voyages_year': vy,
        'Utilitasi_Factor_LNGC': ut,
        'Batas_Maksimum_Utilisasi_LNGC': utMax,
        'selected_storage Total': sel_st,
        'fuel_voyage': fv,
        'fuel_ballast': fb,
        'fuel_berth': fbt,
        'lng_fuel_cost': lng_c,
        'port_cost': pc,
        'rent_cost': rc,
        'Total CAPEX (USD)': t_cap,
        'Total CAPEX USD/MMBTU': c_unit,
        'Total OPEX (USD/year)': t_op,
        'Total OPEX (USD/MMBTU)': o_unit,
        'Total Cost (USD/MMBTU)': c_unit + o_unit,
      });

      if (rows.length === 3) break; // maksimal 3 kandidat mother per Hub
    }
    return rows;
  }

  // HELPER: feeder routes (Hub → Spokes → Hub)
  function calcFeederRoutes(ruteLocs, hub) {
    const demTot = ruteLocs.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
    const dem_m3 = (demTot * 1000.0) / LNG_EC;
    const res = [];

    const impact_capex_6 = gr('P3_Biaya_Investasi', 'II.6');
    const impact_capex_7 = gr('P3_Biaya_Investasi', 'II.7');
    const impact_capex_8 = gr('P3_Biaya_Investasi', 'II.8');
    const impact_capex_start = (impact_capex_6 + impact_capex_7 + impact_capex_8) / 3 || 0;

    const risk_opex_6 = gr('P1_Biaya_Operasi', 'II.6');
    const risk_opex_7 = gr('P1_Biaya_Operasi', 'II.7');
    const risk_opex_8 = gr('P1_Biaya_Operasi', 'II.8');
    const impact_opex_start = (risk_opex_6 + risk_opex_7 + risk_opex_8) / 3 || 0;
    const impact_opex_end = gr('P1_Biaya_Operasi', 'II.1');

    const impact_lt_II2 = gr('P2_Durasi', 'II.2');
    const impact_lt_II5 = gr('P2_Durasi', 'II.5');

    const impact_port_start = gr('P1_Biaya_Operasi', 'II.2');
    const impact_port_next = gr('P1_Biaya_Operasi', 'II.5');

    const perms = permutations(ruteLocs);
    for (const p of perms) {
      const fr = [hub, ...p, hub];
      let tdist = 0;
      const legs = [];
      let valid = true;

      for (let i = 0; i < fr.length - 1; i++) {
        const origin = fr[i];
        const dest = fr[i + 1];
        const d = getDistanceNM(distMap, origin, dest, geoMap, sdMap);
        if (!d) {
          valid = false;
          break;
        }
        tdist += d;
        legs.push(d);
      }
      if (!valid) continue;

      for (const k of kSorted) {
        // Python: lt with risk = loading*(1+risk_II2) + nLocs*loading*(1+risk_II5)
        const lt = params.loading_hour * (1 + impact_lt_II2) +
          ruteLocs.length * params.loading_hour * (1 + impact_lt_II5);
        // Dynamic voyage hours per leg, accumulated with risk
        const legHours2v = [];
        let st = 0;
        for (let i = 0; i < legs.length; i++) {
          const h = getLegHours(twoVesselLegHoursCache, k.name, fr[i], fr[i + 1], legs[i], k, weatherCacheByZone);
          legHours2v.push(h);
          st += h * (1 + im_s);
        }
        const rtd = (st + lt) / 24.0;

        const buf = roundUpDecimal((params.maintenance_days / 365.0) * rtd);
        const w_vol = dem_m3 * rtd + dem_m3 * buf;

        const nom_cap =
          (w_vol +
            (((1 / (1 - params.unpumpable_pct)) - 1) * w_vol) +
            (((1 / (1 - params.bog_pct * rtd)) - 1) * w_vol)) /
          params.filling_pct;
        if (nom_cap > k.capacityM3) continue;

        const ds = w_vol / dem_m3;
        const vy = 365.0 / ds;
        const ut = (rtd * vy / 365.0) * 100.0;
        const utMax = ((365.0 - params.maintenance_days) / 365.0) * 100.0;
        if (ut > utMax) continue;

        let sel_tot = 0.0;
        let cap_locs = 0.0;
        for (const l of ruteLocs) {
          const demL = demandBBTUD[l] || 0;
          const s_st = roundUp(
            (((demL * 1000.0) / LNG_EC) * rtd + buf * (demL * 1000.0) / LNG_EC) * params.gross_storage_pct,
            tankSize
          );
          sel_tot += s_st;
          const tankCapex = (s_st / tankSize) * tankPrice * inflationFactor;
          const oruL = oruMap.get(l) || 0;
          cap_locs += tankCapex + oruL * (1 + impact_capex_start);
        }

        const cap_term = 0; // feeder tidak menanggung ORU terminal
        const t_cap = cap_locs + cap_term;

        let fv = 0.0;
        let fb = 0.0;
        for (let i = 0; i < legs.length; i++) {
          const t_leg = legHours2v[i] * (1 + im_s);
          // Python: last leg (return to hub) = ballast only
          if (i === legs.length - 1) {
            fb = (t_leg / 24.0) * k.ballastTonPerDay;
          } else {
            fv += (t_leg / 24.0) * k.voyageTonPerDay;
          }
        }
        const fbt = (lt / 24.0) * k.berthTonPerDay;

        const lng_c =
          vy *
          (fv + fb + fbt) *
          (params.scf_lng / params.scf_mgo) *
          params.harga_lng;

        // Dynamic port cost; Python: risk applied to full (ltp+delay)
        let portLTP_f2, portDelay_f2;
        if (k.gt) {
          const pcDyn = hitungBiayaPelabuhan(k.gt, params.loading_hour, params.analysis_year, params.inflation_rate);
          portLTP_f2 = pcDyn.ltp;
          portDelay_f2 = pcDyn.delay;
        } else {
          portLTP_f2 = k.portCostLTP;
          portDelay_f2 = k.portCostDelay;
        }
        const port_start_per_voyage =
          (portLTP_f2 + portDelay_f2) * (1 + impact_port_start);
        const port_next_per_voyage =
          ruteLocs.length * (portLTP_f2 + portDelay_f2) * (1 + impact_port_next);
        const pc = vy * (port_start_per_voyage + port_next_per_voyage);

        const rc = k.rentPerDayUSD * 365.0;

        const op_locs = cap_locs * 0.05 * (1 + impact_opex_start);
        const op_term = 0;
        const t_op = lng_c + pc + rc + op_locs + op_term;

        const c_unit =
          t_cap / (demTot * 1000.0 * 365.0 * Pyears);
        const o_unit =
          t_op / (demTot * 1000.0 * 365.0);

        res.push({
          'Nama Kapal': k.name,
          'Rute': fr.join(' - '),
          'Total Jarak (NM)': tdist,
          'RTD (day)': rtd,
          'Demand LNG/day (m3)': dem_m3,
          'Nominal Capacity (m3)': nom_cap,
          'Kapasitas Kapal (m3)': k.capacityM3,
          'Speed (knot)': (st / (1 + im_s)) > 0 ? tdist / (st / (1 + im_s)) : k.speedKnot,
          'buffer day': buf,
          'days_stock': ds,
          'voyages_year': vy,
          'Utilitasi_Factor_LNGC': ut,
          'Batas_Maksimum_Utilisasi_LNGC': utMax,
          'selected_storage Total': sel_tot,
          'fuel_voyage': fv,
          'fuel_ballast': fb,
          'fuel_berth': fbt,
          'lng_fuel_cost': lng_c,
          'port_cost': pc,
          'rent_cost': rc,
          'Total CAPEX (USD)': t_cap,
          'Total CAPEX USD/MMBTU': c_unit,
          'Total OPEX (USD/year)': t_op,
          'Total OPEX (USD/MMBTU)': o_unit,
          'Total Cost (USD/MMBTU)': c_unit + o_unit,
          'Spokes': ruteLocs.join(', '),
        });

        if (res.length >= 3) break; // max 3 feeder candidate per subset
      }
    }

    return res;
  }

  const allCombos = [];
  const totCluster = locs.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
  let it_c = 0;

  for (const hub of locs) {
    const spk_all = locs.filter(x => x !== hub);
    if (numV > spk_all.length) continue;

    const motherRows = calcMother(hub, totCluster);
    if (!motherRows.length) continue;

    // Python: for partition in generate_partitions(spk_all, num_v)
    const partitions = generatePartitions(spk_all, numV);

    for (const partition of partitions) {
      // Run feeder engine for each subset in partition
      const feederDfs = [];
      let allValid = true;

      for (let si = 0; si < numV; si++) {
        const subset = partition[si];
        const feederResult = calcFeederRoutes(subset, hub);
        if (!feederResult.length) {
          allValid = false;
          break;
        }
        // Python: limit results per subset
        const topN = numV <= 2 ? 50 : 20;
        feederDfs.push(feederResult.slice(0, topN));
      }
      if (!allValid || feederDfs.length !== numV) continue;

      // Cross-join feeder results (Python: merged_f = merge on 'k')
      // For numV=2: cross-join feederDfs[0] x feederDfs[1]
      const crossJoinFeeders = (arrays) => {
        if (arrays.length === 0) return [[]];
        const [first, ...rest] = arrays;
        const restCombos = crossJoinFeeders(rest);
        const result = [];
        for (const item of first) {
          for (const combo of restCombos) {
            result.push([item, ...combo]);
          }
        }
        return result;
      };

      const feederCombos = crossJoinFeeders(feederDfs);

      for (const feederCombo of feederCombos) {
        // Python twin constraint: if enforceSameVessel, all feeders must be same vessel
        // (In Python: merged on ['Nama Kapal', 'Kapasitas Kapal (m3)', 'k'])
        if (numV > 1) {
          const firstName = feederCombo[0]['Nama Kapal'];
          const firstCap = feederCombo[0]['Kapasitas Kapal (m3)'];
          const allSame = feederCombo.every(f =>
            f['Nama Kapal'] === firstName && f['Kapasitas Kapal (m3)'] === firstCap
          );
          if (!allSame) continue; // twin constraint for feeders
        }

        for (const rm of motherRows) {
          it_c += 1;

          let c_usd = rm['Total CAPEX (USD)'];
          let o_usd_year = rm['Total OPEX (USD/year)'];
          for (const f of feederCombo) {
            c_usd += f['Total CAPEX (USD)'];
            o_usd_year += f['Total OPEX (USD/year)'];
          }
          const sys_cost = (c_usd + (o_usd_year * Pyears)) / (totCluster * 1000.0 * 365.0 * Pyears);

          const row = {
            'No. Skenario': it_c,
            'Skenario Hub': hub,
            'Probability': numV > 1 ? 'Split' : 'Full',
            'System CAPEX (USD)': c_usd,
            'System OPEX (USD/year)': o_usd_year,
            'System Cost (USD/MMBTU)': sys_cost,
          };

          for (const [k, v] of Object.entries(rm)) row[`M_${k}`] = v;
          for (let fi = 0; fi < numV; fi++) {
            for (const [k, v] of Object.entries(feederCombo[fi])) {
              row[`F${fi + 1}_${k}`] = v;
            }
            row[`F${fi + 1}_Spokes`] = partition[fi].join(', ');
          }

          allCombos.push(row);
        }
      }
    }
  }

  if (!allCombos.length) {
    return { mother: [], feeder1: [], feeder2: [], system: [] };
  }

  // Sort & ambil Top 20 global
  const sortedAll = allCombos
    .slice()
    .sort((a, b) => a['System Cost (USD/MMBTU)'] - b['System Cost (USD/MMBTU)'])
    .slice(0, 20);

  // Mother table
  const mother = sortedAll.map(r => {
    const out = {
      'No. Skenario': r['No. Skenario'],
      'Skenario Hub': r['Skenario Hub'],
    };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('M_')) {
        out[k.substring(2)] = v;
      }
    }
    return out;
  });

  // Feeder tables (dynamic for N feeders)
  const feederTables = {};
  for (let fi = 1; fi <= numV; fi++) {
    const prefix = `F${fi}_`;
    feederTables[`feeder${fi}`] = sortedAll.map(r => {
      const out = {
        'No. Skenario': r['No. Skenario'],
        'Skenario Hub': r['Skenario Hub'],
      };
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith(prefix)) {
          out[k.substring(prefix.length)] = v;
        }
      }
      return out;
    });
  }

  // System gabungan (ringkas)
  const system = sortedAll.map(r => {
    const out = {
      'No. Skenario': r['No. Skenario'],
      'Skenario Hub': r['Skenario Hub'],
      'M_Nama Kapal': r['M_Nama Kapal'],
    };
    for (let fi = 1; fi <= numV; fi++) {
      out[`F${fi}_Nama Kapal`] = r[`F${fi}_Nama Kapal`] || null;
    }
    out['System CAPEX (USD)'] = r['System CAPEX (USD)'];
    out['System OPEX (USD/year)'] = r['System OPEX (USD/year)'];
    out['System Cost (USD/MMBTU)'] = r['System Cost (USD/MMBTU)'];
    return out;
  });

  return { rankings: sortedAll, mother, ...feederTables, system };
}

/**
 * Hub & Spoke, 1 feeder, NO-RISK
 * Delegates to risk version with empty riskDB
 */
async function runHubSpokeSingleModel(input) {
  const emptyRiskDB = {
    P1_Biaya_Operasi: {}, P2_Durasi: {}, P3_Biaya_Investasi: {},
    P4_Panjang_Jalur: {}, P5_Kecepatan_Kapal: {},
  };
  return runHubSpokeSingleModelRisk({ ...input, riskDB: emptyRiskDB });
}

/**
 * Hub & Spoke, 1 feeder, WITH RISK
 * Python CABANG 2: HUB & SPOKE with num_v=1
 * For each hub (each demand location):
 * - Mother: terminal -> hub -> terminal
 * - Feeder: hub -> all remaining spokes -> hub
 */
async function runHubSpokeSingleModelRisk(input) {
  const {
    vessels, routes, oru, terminal,
    selectedLocations: locs, demandBBTUD,
    params, inflationFactor, riskDB, geoMap,
    spatialDistances,
    spatialWaypointsMap,
    weatherCacheByZone,
  } = input;

  if (!Array.isArray(locs) || locs.length === 0) {
    return { mother: [], feeder1: [], system: [] };
  }

  const tankSize  = TANK_SIZE_M3;
  const tankPrice = TANK_PRICE_USD; // internal constants, not user input
  // Merge spatialWaypointsMap distances into sdMap so all distance lookups benefit from real routes
  const sdMap = (() => {
    const base = spatialDistances instanceof Map ? new Map(spatialDistances) : new Map();
    if (spatialWaypointsMap instanceof Map) {
      for (const [k, v] of spatialWaypointsMap) {
        if (v && typeof v.distanceNm === 'number') base.set(k, v.distanceNm);
      }
    }
    return base.size ? base : null;
  })();
  const LNG_EC = 24.04;
  const BASE_YEAR = 2022;
  const Pyears = params.Penyaluran || 20;
  const numV = 1; // 1 feeder

  const distMap = new Map();
  for (const r of routes) {
    distMap.set(`${r.origin} - ${r.destination}`, r.nauticalMiles);
    distMap.set(`${r.destination} - ${r.origin}`, r.nauticalMiles);
  }

  const CAPEX_TERM_BASE = 3678949.0; // Baseline ORF/Terminal (Badak NGL Bontang)
  const oruMap = new Map(oru.map(o => [o.plantName.trim(), o.fixCapexUSD * inflationFactor]));
  const kSorted = vessels.slice().sort((a, b) => a.capacityM3 - b.capacityM3);

  // Pre-compute per-leg voyage hours for all vessel × location pairs
  const swMap = spatialWaypointsMap instanceof Map ? spatialWaypointsMap : null;
  const hsAllLocs = [terminal, ...locs];
  const hubLegHoursCache = await buildLegHoursCache(kSorted, hsAllLocs, swMap, weatherCacheByZone);

  const gr = (p, ii) => getRiskImpact(riskDB, p, ii) || 0.0;
  const im_s = gr('P2_Durasi', 'II.3');
  const impact_lt_II2 = gr('P2_Durasi', 'II.2');
  const impact_lt_II5 = gr('P2_Durasi', 'II.5');

  const risk_capex_6 = gr('P3_Biaya_Investasi', 'II.6');
  const risk_capex_7 = gr('P3_Biaya_Investasi', 'II.7');
  const risk_capex_8 = gr('P3_Biaya_Investasi', 'II.8');
  const impact_capex_start = (risk_capex_6 + risk_capex_7 + risk_capex_8) / 3;
  const impact_capex_end = gr('P3_Biaya_Investasi', 'II.1');

  const risk_opex_6 = gr('P1_Biaya_Operasi', 'II.6');
  const risk_opex_7 = gr('P1_Biaya_Operasi', 'II.7');
  const risk_opex_8 = gr('P1_Biaya_Operasi', 'II.8');
  const impact_opex_start = (risk_opex_6 + risk_opex_7 + risk_opex_8) / 3;
  const impact_opex_end = gr('P1_Biaya_Operasi', 'II.1');

  // HELPER: mother vessel (Terminal -> Hub -> Terminal)
  function calcMother(hub, totDemBBTUD) {
    const rows = [];
    const baseDist =
      getDistanceNM(distMap, terminal, hub, geoMap, sdMap) ??
      getDistanceNM(distMap, hub, terminal, geoMap, sdMap);
    if (!baseDist) return rows;

    const dist = baseDist;
    const dem_m3 = (totDemBBTUD * 1000) / LNG_EC;
    let countShips = 0;

    for (const k of kSorted) {
      const rawH = getLegHours(hubLegHoursCache, k.name, terminal, hub, dist, k, weatherCacheByZone);
      const st = rawH * 2 * (1 + im_s); // round trip sailing time (hours)
      const lt = params.loading_hour * (1 + impact_lt_II2) +
        params.loading_hour * (1 + impact_lt_II5);
      const rtd = (st + lt) / 24.0;

      const buf = roundUpDecimal((params.maintenance_days / 365.0) * rtd);
      const w_vol = dem_m3 * rtd + dem_m3 * buf;

      const nom_cap =
        (w_vol +
          (((1 / (1 - params.unpumpable_pct)) - 1) * w_vol) +
          (((1 / (1 - params.bog_pct * rtd)) - 1) * w_vol)) /
        params.filling_pct;
      if (nom_cap > k.capacityM3) continue;

      const ds = w_vol / dem_m3;
      const vy = 365.0 / ds;
      const ut = (rtd * vy / 365.0) * 100.0;
      const utMax = ((365.0 - params.maintenance_days) / 365.0) * 100.0;
      if (ut > utMax) continue;

      const sel_st = roundUp(
        (dem_m3 * rtd + buf * dem_m3) * params.gross_storage_pct,
        500
      );

      const tankCapexHub = (sel_st / tankSize) * tankPrice * inflationFactor;
      const oruHub = oruMap.get(hub) || 0;
      const cap_hub = tankCapexHub + oruHub * (1 + impact_capex_start);

      const capex_term_inflated_rhs = CAPEX_TERM_BASE * inflationFactor;
      const cap_term = k.capacityM3 < 20000 ? capex_term_inflated_rhs * (1 + impact_capex_end) : 0;
      const t_cap = cap_hub + cap_term;

      // Python: mother forward (terminal→hub) = voyage fuel; return (hub→terminal) = ballast fuel
      const fv = rawH * (1 + im_s) / 24.0 * k.voyageTonPerDay;
      const fb = rawH * (1 + im_s) / 24.0 * k.ballastTonPerDay;
      const fbt = (lt / 24.0) * k.berthTonPerDay;
      const lng_c = vy * (fv + fb + fbt) * (params.scf_lng / params.scf_mgo) * params.harga_lng;

      // Dynamic port cost (same as milk-run); Python: pc = vy*(ltp+delay)*(2+risk2+risk5)
      let portLTP_m, portDelay_m;
      if (k.gt) {
        const pcDyn = hitungBiayaPelabuhan(k.gt, params.loading_hour, params.analysis_year, params.inflation_rate);
        portLTP_m = pcDyn.ltp;
        portDelay_m = pcDyn.delay;
      } else {
        portLTP_m = k.portCostLTP;
        portDelay_m = k.portCostDelay;
      }
      const pc = vy * (portLTP_m + portDelay_m) *
        (2 + gr('P1_Biaya_Operasi', 'II.2') + gr('P1_Biaya_Operasi', 'II.5'));
      const rc = k.rentPerDayUSD * 365.0;

      const op_hub = cap_hub * 0.05 * (1 + impact_opex_start);
      const op_term = cap_term * 0.05 * (1 + impact_opex_end);
      const t_op = lng_c + pc + rc + op_hub + op_term;

      const c_unit = t_cap / (totDemBBTUD * 1000.0 * 365.0 * Pyears);
      const o_unit = t_op / (totDemBBTUD * 1000.0 * 365.0);

      rows.push({
        'Nama Kapal': k.name,
        'Rute': `${terminal} - ${hub} - ${terminal}`,
        'Total Jarak (NM)': dist * 2,
        'RTD': rtd,
        'Demand LNG/day (m3)': dem_m3,
        'Nominal Capacity (m3)': nom_cap,
        'Kapasitas Kapal (m3)': k.capacityM3,
        'Speed (knot)': rawH > 0 ? dist / rawH : k.speedKnot,
        'buffer day': buf,
        'days_stock': ds,
        'voyages_year': vy,
        'Utilitasi_Factor_LNGC': ut,
        'Batas_Maksimum_Utilisasi_LNGC': utMax,
        'selected_storage Total': sel_st,
        'fuel_voyage': fv, 'fuel_ballast': fb, 'fuel_berth': fbt,
        'lng_fuel_cost': lng_c, 'port_cost': pc, 'rent_cost': rc,
        'Total CAPEX (USD)': t_cap,
        'Total CAPEX USD/MMBTU': c_unit,
        'Total OPEX (USD/year)': t_op,
        'Total OPEX (USD/MMBTU)': o_unit,
        'Total Cost (USD/MMBTU)': c_unit + o_unit,
      });

      countShips++;
      if (countShips === 3) break;
    }
    return rows;
  }

  // HELPER: feeder routes (Hub -> Spokes -> Hub)
  function calcFeederRoutes(ruteLocs, hub) {
    const demTot = ruteLocs.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
    const dem_m3 = (demTot * 1000.0) / LNG_EC;
    const res = [];

    const impact_port_start = gr('P1_Biaya_Operasi', 'II.2');
    const impact_port_next = gr('P1_Biaya_Operasi', 'II.5');

    const perms = permutations(ruteLocs);
    for (const p of perms) {
      const fr = [hub, ...p, hub];
      let tdist = 0;
      const legs = [];
      let valid = true;

      for (let i = 0; i < fr.length - 1; i++) {
        const d = getDistanceNM(distMap, fr[i], fr[i + 1], geoMap, sdMap);
        if (!d) { valid = false; break; }
        tdist += d;
        legs.push(d);
      }
      if (!valid) continue;

      let countShips = 0;
      for (const k of kSorted) {
        const lt = params.loading_hour * (1 + impact_lt_II2) +
          ruteLocs.length * params.loading_hour * (1 + impact_lt_II5);
        const legHours = [];
        let stTotal = 0;
        for (let i = 0; i < legs.length; i++) {
          const h = getLegHours(hubLegHoursCache, k.name, fr[i], fr[i + 1], legs[i], k, weatherCacheByZone);
          legHours.push(h);
          stTotal += h * (1 + im_s);
        }
        const rtd = (stTotal + lt) / 24.0;

        const buf = roundUpDecimal((params.maintenance_days / 365.0) * rtd);
        const w_vol = dem_m3 * rtd + dem_m3 * buf;

        const nom_cap =
          (w_vol +
            (((1 / (1 - params.unpumpable_pct)) - 1) * w_vol) +
            (((1 / (1 - params.bog_pct * rtd)) - 1) * w_vol)) /
          params.filling_pct;
        if (nom_cap > k.capacityM3) continue;

        const ds = w_vol / dem_m3;
        const vy = 365.0 / ds;
        const ut = (rtd * vy / 365.0) * 100.0;
        const utMax = ((365.0 - params.maintenance_days) / 365.0) * 100.0;
        if (ut > utMax) continue;

        let sel_tot = 0.0;
        let cap_locs = 0.0;
        for (const l of ruteLocs) {
          const demL = demandBBTUD[l] || 0;
          const s_st = roundUp(
            (((demL * 1000.0) / LNG_EC) * rtd + buf * (demL * 1000.0) / LNG_EC) * params.gross_storage_pct,
            tankSize
          );
          sel_tot += s_st;
          const tankCapex = (s_st / tankSize) * tankPrice * inflationFactor;
          const oruL = oruMap.get(l) || 0;
          cap_locs += tankCapex + oruL * (1 + impact_capex_start);
        }

        const cap_term = 0; // feeder: no terminal ORU
        const t_cap = cap_locs + cap_term;

        let fv = 0.0;
        let fb = 0.0;
        for (let i = 0; i < legs.length; i++) {
          const t_leg = legHours[i] * (1 + im_s);
          // Python: last leg (return to hub) = ballast only
          if (i === legs.length - 1) {
            fb = (t_leg / 24.0) * k.ballastTonPerDay;
          } else {
            fv += (t_leg / 24.0) * k.voyageTonPerDay;
          }
        }
        const fbt = (lt / 24.0) * k.berthTonPerDay;

        const lng_c = vy * (fv + fb + fbt) * (params.scf_lng / params.scf_mgo) * params.harga_lng;

        // Dynamic port cost; Python: risk applied to full (ltp+delay)
        let portLTP_f, portDelay_f;
        if (k.gt) {
          const pcDyn = hitungBiayaPelabuhan(k.gt, params.loading_hour, params.analysis_year, params.inflation_rate);
          portLTP_f = pcDyn.ltp;
          portDelay_f = pcDyn.delay;
        } else {
          portLTP_f = k.portCostLTP;
          portDelay_f = k.portCostDelay;
        }
        const port_start_per_voyage = (portLTP_f + portDelay_f) * (1 + impact_port_start);
        const port_next_per_voyage = ruteLocs.length * (portLTP_f + portDelay_f) * (1 + impact_port_next);
        const pc = vy * (port_start_per_voyage + port_next_per_voyage);
        const rc = k.rentPerDayUSD * 365.0;

        const op_locs = cap_locs * 0.05 * (1 + impact_opex_start);
        const t_op = lng_c + pc + rc + op_locs;

        const c_unit = t_cap / (demTot * 1000.0 * 365.0 * Pyears);
        const o_unit = t_op / (demTot * 1000.0 * 365.0);

        res.push({
          'Nama Kapal': k.name,
          'Rute': fr.join(' - '),
          'Total Jarak (NM)': tdist,
          'RTD': rtd,
          'Demand LNG/day (m3)': dem_m3,
          'Nominal Capacity (m3)': nom_cap,
          'Kapasitas Kapal (m3)': k.capacityM3,
          'Speed (knot)': (stTotal / (1 + im_s)) > 0 ? tdist / (stTotal / (1 + im_s)) : k.speedKnot,
          'buffer day': buf,
          'days_stock': ds,
          'voyages_year': vy,
          'Utilitasi_Factor_LNGC': ut,
          'Batas_Maksimum_Utilisasi_LNGC': utMax,
          'selected_storage Total': sel_tot,
          'fuel_voyage': fv, 'fuel_ballast': fb, 'fuel_berth': fbt,
          'lng_fuel_cost': lng_c, 'port_cost': pc, 'rent_cost': rc,
          'Total CAPEX (USD)': t_cap,
          'Total CAPEX USD/MMBTU': c_unit,
          'Total OPEX (USD/year)': t_op,
          'Total OPEX (USD/MMBTU)': o_unit,
          'Total Cost (USD/MMBTU)': c_unit + o_unit,
          'Spokes': ruteLocs.join(', '),
        });

        countShips++;
        if (countShips === 3) break;
      }
    }
    return res;
  }

  // Main loop: iterate over all possible hubs
  const allCombos = [];
  const totCluster = locs.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
  let it_c = 0;

  for (const hub of locs) {
    const spk_all = locs.filter(x => x !== hub);
    if (spk_all.length === 0) continue;

    const motherRows = calcMother(hub, totCluster);
    if (!motherRows.length) continue;

    // For numV=1: all spokes go to one feeder
    const feederRows = calcFeederRoutes(spk_all, hub);
    if (!feederRows.length) continue;

    for (const rm of motherRows) {
      for (const f1 of feederRows) {
        it_c += 1;

        const c_usd = rm['Total CAPEX (USD)'] + f1['Total CAPEX (USD)'];
        const o_usd_year = rm['Total OPEX (USD/year)'] + f1['Total OPEX (USD/year)'];
        const sys_cost = (c_usd + (o_usd_year * Pyears)) / (totCluster * 1000.0 * 365.0 * Pyears);

        const row = {
          'No. Skenario': it_c,
          'Skenario Hub': hub,
          'System CAPEX (USD)': c_usd,
          'System OPEX (USD/year)': o_usd_year,
          'System Cost (USD/MMBTU)': sys_cost,
        };

        for (const [k, v] of Object.entries(rm)) row[`M_${k}`] = v;
        for (const [k, v] of Object.entries(f1)) row[`F1_${k}`] = v;

        allCombos.push(row);
      }
    }
  }

  if (!allCombos.length) {
    return { mother: [], feeder1: [], system: [] };
  }

  const sortedAll = allCombos
    .slice()
    .sort((a, b) => a['System Cost (USD/MMBTU)'] - b['System Cost (USD/MMBTU)'])
    .slice(0, 20);

  const mother = sortedAll.map(r => {
    const out = { 'No. Skenario': r['No. Skenario'], 'Skenario Hub': r['Skenario Hub'] };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('M_')) out[k.substring(2)] = v;
    }
    return out;
  });

  const feeder1 = sortedAll.map(r => {
    const out = { 'No. Skenario': r['No. Skenario'], 'Skenario Hub': r['Skenario Hub'] };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('F1_')) out[k.substring(3)] = v;
    }
    return out;
  });

  const system = sortedAll.map(r => ({
    'No. Skenario': r['No. Skenario'],
    'Skenario Hub': r['Skenario Hub'],
    'M_Nama Kapal (Mother)': r['M_Nama Kapal'],
    'F1_Nama Kapal (Feeder)': r['F1_Nama Kapal'],
    'System CAPEX (USD)': r['System CAPEX (USD)'],
    'System OPEX (USD/year)': r['System OPEX (USD/year)'],
    'System Cost (USD/MMBTU)': r['System Cost (USD/MMBTU)'],
  }));

  return { rankings: sortedAll, mother, feeder1, system };
}

/**
 * Hub & Spoke, 2 kapal, NO-RISK
 */
async function runHubSpokeTwoVesselModel(input) {
  // Sama seperti runHubSpokeTwoVesselModelRisk tapi tanpa risk
  // Untuk sementara gunakan versi risk dengan riskDB kosong
  const emptyRiskDB = {
    P1_Biaya_Operasi: {}, P2_Durasi: {}, P3_Biaya_Investasi: {},
    P4_Panjang_Jalur: {}, P5_Kecepatan_Kapal: {},
  };
  return runHubSpokeTwoVesselModelRisk({ ...input, riskDB: emptyRiskDB });
}

/**
 * N-Vessel Probability Model (Milk-Run, NO-RISK)
 * Membagi lokasi menjadi N subset dan menjalankan engine single untuk setiap subset
 */
async function runNVesselProbabilityModel(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor,
    numVessels = 2,
    enforceSameVessel = true,
    vesselNames,
    shareTerminalORU = true,
    geoMap,
    spatialDistances,
    spatialWaypointsMap,
    weatherCacheByZone,
  } = input;

  const n = selectedLocations.length;
  if (n < numVessels) {
    const emptyResult = { system: [] };
    for (let i = 1; i <= numVessels; i++) emptyResult[`kapal_${i}`] = [];
    return emptyResult;
  }

  const Pyears = params.Penyaluran || 20;
  const totalDemandBBTUD = Object.values(demandBBTUD).reduce((a, b) => a + b, 0);
  const allCombos = [];
  let globalScenarioId = 0;

  // Generate all partitions of locations into numVessels subsets
  const partitions = generatePartitions(selectedLocations, numVessels);

  for (const partition of partitions) {
    // Skip jika ada subset kosong
    if (partition.some(subset => subset.length === 0)) continue;

    // Run engine untuk setiap subset
    const subResults = [];
    let allValid = true;

    for (let i = 0; i < numVessels; i++) {
      const subset = partition[i];
      const subsetDemand = Object.fromEntries(subset.map(k => [k, demandBBTUD[k]]));
      const topN = numVessels <= 2 ? 50 : (numVessels <= 3 ? 20 : 10);
      
      const df = await runSupplyChainModel({
        vessels, routes, oru, terminal,
        selectedLocations: subset,
        demandBBTUD: subsetDemand,
        params, inflationFactor,
        geoMap, spatialDistances, spatialWaypointsMap, weatherCacheByZone,
        numVessels, // pass numVessels to divide terminal ORU properly
        resultLimit: topN,
      });

      if (!df.length) {
        allValid = false;
        break;
      }
      subResults.push(df);
    }

    if (!allValid) continue;

    // Cross-join semua kombinasi kapal
    const crossJoin = (arrays) => {
      if (arrays.length === 0) return [[]];
      const [first, ...rest] = arrays;
      const restCombos = crossJoin(rest);
      const result = [];
      for (const item of first) {
        for (const combo of restCombos) {
          result.push([item, ...combo]);
        }
      }
      return result;
    };

    const allKapalCombos = crossJoin(subResults);

    for (const kapalCombo of allKapalCombos) {
      // Check twin constraint
      if (enforceSameVessel) {
        const firstVessel = kapalCombo[0]['Nama Kapal'];
        const firstCapacity = kapalCombo[0]['Kapasitas Kapal (m3)'];
        const allSame = kapalCombo.every(k => 
          k['Nama Kapal'] === firstVessel && k['Kapasitas Kapal (m3)'] === firstCapacity
        );
        if (!allSame) continue;
      }

      // Check vesselNames constraint
      if (Array.isArray(vesselNames) && vesselNames.length === numVessels) {
        let match = true;
        for (let i = 0; i < numVessels; i++) {
          if (kapalCombo[i]['Nama Kapal'] !== vesselNames[i]) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }

      // Calculate system cost using Python's weighted formula
      const c_usd = kapalCombo.reduce((sum, k) => sum + k['Total CAPEX (USD)'], 0);
      const o_usd_year = kapalCombo.reduce((sum, k) => sum + k['Total OPEX (USD/year)'], 0);

      // Python Milk Run weighted system cost:
      // cost_numerator = sum(Total_Cost_i * vol_i * 1000 * 365 - CAPEX_i / Pyears)
      let cost_numerator = 0;
      for (let i = 0; i < numVessels; i++) {
        const vol_i = partition[i].reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
        cost_numerator += (kapalCombo[i]['Total Cost (USD/MMBTU)'] * vol_i * 1000 * 365 - kapalCombo[i]['Total CAPEX (USD)'] / Pyears);
      }
      const sys_cost = (c_usd + (cost_numerator * Pyears)) / (totalDemandBBTUD * 1000 * 365 * Pyears);

      globalScenarioId += 1;

      const row = {
        'No. Skenario': globalScenarioId,
        'Probability': partition.map(p => p.length).join(':'),
        'Nama Kapal': kapalCombo[0]['Nama Kapal'],
        'Kapasitas Kapal (m3)': kapalCombo[0]['Kapasitas Kapal (m3)'],
        'System CAPEX (USD)': c_usd,
        'System OPEX (USD/year)': o_usd_year,
        'System Cost (USD/MMBTU)': sys_cost,
      };

      for (let i = 0; i < numVessels; i++) {
        const k = kapalCombo[i];
        for (const [col, value] of Object.entries(k)) {
          row[`V${i + 1}_${col}`] = value;
        }
        row[`V${i + 1}_Spokes`] = partition[i].join(', ');
      }

      allCombos.push({ row, kapalCombo, partition });
    }
  }

  // Sort and get top 20
  allCombos.sort((a, b) => a.row['System Cost (USD/MMBTU)'] - b.row['System Cost (USD/MMBTU)']);
  const top20 = allCombos.slice(0, 20);

  // Build output tables
  const result = { rankings: [], system: [] };
  for (let i = 1; i <= numVessels; i++) {
    result[`kapal_${i}`] = [];
  }

  for (const { row, kapalCombo } of top20) {
    result.rankings.push(row);
    result.system.push({
      'No. Skenario': row['No. Skenario'],
      'Probability': row['Probability'],
      'Nama Kapal': row['Nama Kapal'],
      'Kapasitas Kapal (m3)': row['Kapasitas Kapal (m3)'],
      'System CAPEX (USD)': row['System CAPEX (USD)'],
      'System OPEX (USD/year)': row['System OPEX (USD/year)'],
      'System Cost (USD/MMBTU)': row['System Cost (USD/MMBTU)'],
    });

    for (let i = 0; i < numVessels; i++) {
      const k = kapalCombo[i];
      result[`kapal_${i + 1}`].push({
        'No. Skenario': row['No. Skenario'],
        'Probability': row['Probability'],
        ...k,
      });
    }
  }

  return result;
}

/**
 * N-Vessel Probability Model (Milk-Run, WITH RISK)
 */
async function runNVesselProbabilityModelRisk(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor, riskDB,
    numVessels = 2,
    enforceSameVessel = true,
    vesselNames,
    shareTerminalORU = true,
    geoMap,
    spatialDistances,
    spatialWaypointsMap,
    weatherCacheByZone,
  } = input;

  const n = selectedLocations.length;
  if (n < numVessels) {
    const emptyResult = { system: [] };
    for (let i = 1; i <= numVessels; i++) emptyResult[`kapal_${i}`] = [];
    return emptyResult;
  }

  const Pyears = params.Penyaluran || 20;
  const totalDemandBBTUD = Object.values(demandBBTUD).reduce((a, b) => a + b, 0);
  const allCombos = [];
  let globalScenarioId = 0;

  const partitions = generatePartitions(selectedLocations, numVessels);

  for (const partition of partitions) {
    if (partition.some(subset => subset.length === 0)) continue;

    const subResults = [];
    let allValid = true;

    for (let i = 0; i < numVessels; i++) {
      const subset = partition[i];
      const subsetDemand = Object.fromEntries(subset.map(k => [k, demandBBTUD[k]]));
      const topN = numVessels <= 2 ? 50 : (numVessels <= 3 ? 20 : 10);
      
      const df = await runSupplyChainModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: subset,
        demandBBTUD: subsetDemand,
        params, inflationFactor, riskDB, geoMap,
        spatialDistances, spatialWaypointsMap, weatherCacheByZone,
        numVessels, // pass numVessels to divide terminal ORU properly
        resultLimit: topN,
      });

      if (!df.length) {
        allValid = false;
        break;
      }
      subResults.push(df);
    }

    if (!allValid) continue;

    const crossJoin = (arrays) => {
      if (arrays.length === 0) return [[]];
      const [first, ...rest] = arrays;
      const restCombos = crossJoin(rest);
      const result = [];
      for (const item of first) {
        for (const combo of restCombos) {
          result.push([item, ...combo]);
        }
      }
      return result;
    };

    const allKapalCombos = crossJoin(subResults);

    for (const kapalCombo of allKapalCombos) {
      if (enforceSameVessel) {
        const firstVessel = kapalCombo[0]['Nama Kapal'];
        const firstCapacity = kapalCombo[0]['Kapasitas Kapal (m3)'];
        const allSame = kapalCombo.every(k => 
          k['Nama Kapal'] === firstVessel && k['Kapasitas Kapal (m3)'] === firstCapacity
        );
        if (!allSame) continue;
      }

      if (Array.isArray(vesselNames) && vesselNames.length === numVessels) {
        let match = true;
        for (let i = 0; i < numVessels; i++) {
          if (kapalCombo[i]['Nama Kapal'] !== vesselNames[i]) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }

      // Calculate system cost using Python's weighted formula
      const c_usd = kapalCombo.reduce((sum, k) => sum + k['Total CAPEX (USD)'], 0);
      const o_usd_year = kapalCombo.reduce((sum, k) => sum + k['Total OPEX (USD/year)'], 0);

      // Python Milk Run weighted system cost:
      // cost_numerator = sum(Total_Cost_i * vol_i * 1000 * 365 - CAPEX_i / Pyears)
      let cost_numerator = 0;
      for (let i = 0; i < numVessels; i++) {
        const vol_i = partition[i].reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
        cost_numerator += (kapalCombo[i]['Total Cost (USD/MMBTU)'] * vol_i * 1000 * 365 - kapalCombo[i]['Total CAPEX (USD)'] / Pyears);
      }
      const sys_cost = (c_usd + (cost_numerator * Pyears)) / (totalDemandBBTUD * 1000 * 365 * Pyears);

      globalScenarioId += 1;

      const row = {
        'No. Skenario': globalScenarioId,
        'Probability': partition.map(p => p.length).join(':'),
        'Nama Kapal': kapalCombo[0]['Nama Kapal'],
        'Kapasitas Kapal (m3)': kapalCombo[0]['Kapasitas Kapal (m3)'],
        'System CAPEX (USD)': c_usd,
        'System OPEX (USD/year)': o_usd_year,
        'System Cost (USD/MMBTU)': sys_cost,
      };

      for (let i = 0; i < numVessels; i++) {
        const k = kapalCombo[i];
        for (const [col, value] of Object.entries(k)) {
          row[`V${i + 1}_${col}`] = value;
        }
        row[`V${i + 1}_Spokes`] = partition[i].join(', ');
      }

      allCombos.push({ row, kapalCombo, partition });
    }
  }

  allCombos.sort((a, b) => a.row['System Cost (USD/MMBTU)'] - b.row['System Cost (USD/MMBTU)']);
  const top20 = allCombos.slice(0, 20);

  const result = { rankings: [], system: [] };
  for (let i = 1; i <= numVessels; i++) {
    result[`kapal_${i}`] = [];
  }

  for (const { row, kapalCombo } of top20) {
    result.rankings.push(row);
    result.system.push({
      'No. Skenario': row['No. Skenario'],
      'Probability': row['Probability'],
      'Nama Kapal': row['Nama Kapal'],
      'Kapasitas Kapal (m3)': row['Kapasitas Kapal (m3)'],
      'System CAPEX (USD)': row['System CAPEX (USD)'],
      'System OPEX (USD/year)': row['System OPEX (USD/year)'],
      'System Cost (USD/MMBTU)': row['System Cost (USD/MMBTU)'],
    });

    for (let i = 0; i < numVessels; i++) {
      const k = kapalCombo[i];
      result[`kapal_${i + 1}`].push({
        'No. Skenario': row['No. Skenario'],
        'Probability': row['Probability'],
        ...k,
      });
    }
  }

  return result;
}

/**
 * Hub & Spoke N-Vessel Model (NO-RISK)
 */
async function runHubSpokeNVesselModel(input) {
  const emptyRiskDB = {
    P1_Biaya_Operasi: {}, P2_Durasi: {}, P3_Biaya_Investasi: {},
    P4_Panjang_Jalur: {}, P5_Kecepatan_Kapal: {},
  };
  return runHubSpokeNVesselModelRisk({ ...input, riskDB: emptyRiskDB });
}

/**
 * Hub & Spoke N-Vessel Model (WITH RISK)
 * PERBAIKAN 5: MENGIMPLEMENTASIKAN N-FEEDER SECARA UTUH
 */
async function runHubSpokeNVesselModelRisk(input) {
  const {
    vessels, routes, oru, terminal,
    selectedLocations: locs, demandBBTUD,
    params, inflationFactor, riskDB, geoMap,
    spatialDistances, spatialWaypointsMap, weatherCacheByZone,
    numFeeders = 2,
    enforceSameVessel = true,
    vesselNames,
  } = input;

  if (!Array.isArray(locs) || locs.length === 0) {
    const emptyResult = { mother: [], system: [] };
    for (let i = 1; i <= numFeeders; i++) emptyResult[`feeder${i}`] = [];
    return emptyResult;
  }

  // Jika cuma 1 atau 2, lempar ke fungsi yang sudah ada (efisiensi kecepatan A*)
  if (numFeeders === 1) return runHubSpokeSingleModelRisk(input);
  if (numFeeders === 2) return runHubSpokeTwoVesselModelRisk(input);

  const total = [];
  const totCluster = locs.reduce((s, l) => s + (demandBBTUD[l] || 0), 0);
  let globalScenarioId = 0;
  const Pyears = params.Penyaluran || 20;

  for (const hub of locs) {
    const spk_all = locs.filter(x => x !== hub);
    if (numFeeders > spk_all.length) continue;

    // Kalkulasi Kapal Induk (Mother Vessel)
    const motherRows = await runSupplyChainModelRisk({
      vessels, routes, oru, terminal,
      selectedLocations: [hub], demandBBTUD: { [hub]: totCluster }, // demand total
      params, inflationFactor, riskDB, geoMap,
      spatialDistances, weatherCacheByZone, spatialWaypointsMap,
      numVessels: 1, isFeeder: false
    });
    
    if (!motherRows.length) continue;

    // Partisi Spoke ke beberapa Feeder secara rekursif
    const partitions = generatePartitions(spk_all, numFeeders);

    for (const partition of partitions) {
      if (partition.some(subset => subset.length === 0)) continue;

      const subResults = [];
      let allValid = true;

      for (let i = 0; i < numFeeders; i++) {
        const subset = partition[i];
        const subsetDemand = Object.fromEntries(subset.map(k => [k, demandBBTUD[k]]));
        const topN = numFeeders <= 3 ? 20 : 10;
        
        // Kalkulasi Kapal Feeder (berangkat dari HUB)
        const df = await runSupplyChainModelRisk({
          vessels, routes, oru, terminal: hub, 
          selectedLocations: subset, demandBBTUD: subsetDemand,
          params, inflationFactor, riskDB, geoMap,
          spatialDistances, spatialWaypointsMap, weatherCacheByZone,
          numVessels: numFeeders, isFeeder: true,
          resultLimit: topN,
        });

        if (!df.length) { allValid = false; break; }
        subResults.push(df);
      }

      if (!allValid) continue;

      // Cross-join feeder
      const crossJoin = (arrays) => {
        if (arrays.length === 0) return [[]];
        const [first, ...rest] = arrays;
        const restCombos = crossJoin(rest);
        const result = [];
        for (const item of first) {
          for (const combo of restCombos) result.push([item, ...combo]);
        }
        return result;
      };

      const allFeederCombos = crossJoin(subResults);

      for (const feederCombo of allFeederCombos) {
        // Twin constraint check for feeders
        if (enforceSameVessel) {
          const firstVessel = feederCombo[0]['Nama Kapal'];
          const firstCapacity = feederCombo[0]['Kapasitas Kapal (m3)'];
          const allSame = feederCombo.every(k => k['Nama Kapal'] === firstVessel && k['Kapasitas Kapal (m3)'] === firstCapacity);
          if (!allSame) continue;
        }

        // Cek Nama Kapal jika diatur spesifik
        if (Array.isArray(vesselNames) && vesselNames.length === numFeeders) {
          let match = true;
          for (let i = 0; i < numFeeders; i++) {
            if (feederCombo[i]['Nama Kapal'] !== vesselNames[i]) {
              match = false; break;
            }
          }
          if (!match) continue;
        }

        for (const rm of motherRows) {
          globalScenarioId += 1;

          let c_usd = rm['Total CAPEX (USD)'];
          let o_usd_year = rm['Total OPEX (USD/year)'];
          for (const f of feederCombo) {
            c_usd += f['Total CAPEX (USD)'];
            o_usd_year += f['Total OPEX (USD/year)'];
          }
          
          // Formula Sistem Gabungan (Mother + Semua Feeder)
          const sys_cost = (c_usd + (o_usd_year * Pyears)) / (totCluster * 1000.0 * 365.0 * Pyears);

          const row = {
            'No. Skenario': globalScenarioId,
            'Skenario Hub': hub,
            'Probability': partition.map(p => p.length).join(':'),
            'System CAPEX (USD)': c_usd,
            'System OPEX (USD/year)': o_usd_year,
            'System Cost (USD/MMBTU)': sys_cost,
          };

          for (const [k, v] of Object.entries(rm)) row[`M_${k}`] = v;
          for (let fi = 0; fi < numFeeders; fi++) {
            for (const [k, v] of Object.entries(feederCombo[fi])) row[`F${fi + 1}_${k}`] = v;
            row[`F${fi + 1}_Spokes`] = partition[fi].join(', ');
          }
          total.push({ row, feederCombo, rm, partition });
        }
      }
    }
  }

  total.sort((a, b) => a.row['System Cost (USD/MMBTU)'] - b.row['System Cost (USD/MMBTU)']);
  const top20 = total.slice(0, 20);

  // Re-number scenarios sequentially
  top20.forEach((t, idx) => { t.row['No. Skenario'] = idx + 1; });

  const result = { mother: [], system: [] };
  for (let i = 1; i <= numFeeders; i++) result[`feeder${i}`] = [];

  for (const { row, feederCombo, rm } of top20) {
    result.system.push(row);
    
    const mRow = { 'No. Skenario': row['No. Skenario'], 'Skenario Hub': row['Skenario Hub'] };
    for (const [k, v] of Object.entries(rm)) mRow[k] = v;
    result.mother.push(mRow);

    for (let i = 0; i < numFeeders; i++) {
      const fRow = { 'No. Skenario': row['No. Skenario'], 'Skenario Hub': row['Skenario Hub'] };
      for (const [k, v] of Object.entries(feederCombo[i])) fRow[k] = v;
      fRow['Spokes'] = row[`F${i + 1}_Spokes`];
      result[`feeder${i + 1}`].push(fRow);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// SENSITIVITY ANALYSIS (Tornado Chart)
// Runs the base single-vessel engine with ±variations on each param.
// Python: run_sensitivity_analysis()
//
// @param {object} baseInput  – same as runSupplyChainModel input
// @param {string[]} testVars – param keys to vary, e.g. ['harga_lng','inflation_rate']
// @param {number[]} variations – fractional changes e.g. [-0.2,-0.1,0,0.1,0.2]
// @returns {{ baseResult, sensitivity: { varName: { pct: topCost } } }}
// ─────────────────────────────────────────────────────────────────────────────
async function runSensitivityAnalysis(baseInput, testVars, variations) {
  const _vars = Array.isArray(testVars) && testVars.length
    ? testVars
    : ['harga_lng', 'inflation_rate', 'loading_hour', 'maintenance_days'];
  const _vars2 = Array.isArray(variations) && variations.length
    ? variations
    : [-0.20, -0.10, 0, 0.10, 0.20];

  // Run base case
  const baseRows = await runSupplyChainModel(baseInput);
  const baseCost = baseRows[0] ? baseRows[0]['Total Cost (USD/MMBTU)'] : null;

  const sensitivity = {};

  for (const v of _vars) {
    sensitivity[v] = {};
    for (const pct of _vars2) {
      const variedParams = { ...baseInput.params };
      const baseVal = variedParams[v];
      if (typeof baseVal !== 'number') {
        sensitivity[v][pct] = null;
        continue;
      }
      variedParams[v] = baseVal * (1 + pct);

      let variedInflationFactor = baseInput.inflationFactor;
      if (v === 'inflation_rate') {
        const baseYear = 2022;
        variedInflationFactor = Math.pow(1 + variedParams.inflation_rate, (variedParams.analysis_year || 2030) - baseYear);
      }

      const rows = await runSupplyChainModel({ ...baseInput, params: variedParams, inflationFactor: variedInflationFactor, resultLimit: 1 });
      sensitivity[v][pct] = rows[0] ? rows[0]['Total Cost (USD/MMBTU)'] : null;
    }
  }

  return { baseCost, baseResult: baseRows[0] || null, sensitivity };
}

module.exports = {
  runSupplyChainModel,
  runTwoVesselProbabilityModel,
  buildRiskDB,
  buildRiskSelectionSummary,
  RISK_SECTION_DETAILS,
  runSupplyChainModelRisk,
  runTwoVesselProbabilityModelRisk,
  runHubSpokeSingleModel,
  runHubSpokeSingleModelRisk,
  runHubSpokeTwoVesselModel,
  runHubSpokeTwoVesselModelRisk,
  runNVesselProbabilityModel,
  runNVesselProbabilityModelRisk,
  runHubSpokeNVesselModel,
  runHubSpokeNVesselModelRisk,
  hitungBiayaPelabuhan,
  runSensitivityAnalysis,
};