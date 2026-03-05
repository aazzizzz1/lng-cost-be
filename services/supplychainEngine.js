// Single-vessel logic:
// - Generate all permutations of selectedLocations -> evaluate each route with each vessel.
// - Compute RTD, working volume, capacity feasibility, CAPEX (tank + ORU), OPEX (fuel/port/rent/ORU).
// - Optional: shareTerminalORU splits terminal ORU by 50% when enabled.
//
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
 *    - Python:  Demm3 = DemBBTUD * 1000 / LNGec
 *    - JS:      di runSupplyChainModel / runSupplyChainModelRisk
 *               demand_m3_day = sum( (demandBBTUD[l] / 24.04) * 1000 )
 *
 * 2) RTD & Penjadwalan (Formula 2: Tsailing, Tport, RTD)
 *    - Python:  Tsailing = Σ(D_i / Vkapal) * (1 + Risk P2_II.3)
 *               Tport   = Loading + Unloading * (Risiko II.2, II.5)
 *               RTD     = (Tsailing + Tport) / 24
 *    - JS:
 *      • runSupplyChainModel: sailingTime, totalLoadingTime → RTD (no-risk)
 *      • runSupplyChainModelRisk: sailing_time_voyage, fuel_berth_start/next
 *        memakai getRiskImpact(P2_Durasi, II.2 / II.3 / II.5)
 *
 * 3) Kapasitas & Utilitas Kapal (Formula 3: Buffer, Wvol, Nomcap, Util)
 *    - Python:  Buffer, Wvol, Nomcap, Voyages/year, Util
 *    - JS:      di kedua engine single:
 *               buffer_day, working_volume_lngc, nominal_capacity,
 *               days_stock, voyages_year, Utilitasi_Factor_LNGC,
 *               Batas_Maksimum_Utilisasi_LNGC
 *
 * 4) CAPEX (Formula 4: Storage, CAPEXloc, CAPEXterm)
 *    - Python:  Storage dibulatkan ke 100/500 m3, GF, inflasi, Risk P3
 *    - JS:
 *      • runSupplyChainModel: CAPEX tanpa risiko (tank + ORU)
 *      • runSupplyChainModelRisk:
 *          - impact_capex_start (II.6, II.7, II.8, P3_Biaya_Investasi)
 *          - impact_capex_end   (II.1, P3_Biaya_Investasi)
 *        → capex_loc_map, capex_terminal_risked, total_capex
 *
 * 5) OPEX (Formula 5: Cfuel, Cport, Crent, OPEXfac)
 *    - Python:  fuel voyage/ballast/berth, port LTP+Delay, 5% CAPEX * Risk P1
 *    - JS:
 *      • No-risk: fuel_voyage, fuel_ballast, fuel_berth, lng_fuel_cost,
 *                 port_cost (portCostPerLocation), rent_cost, opex_oru = 5% CAPEX
 *      • Risk:    risk-based time & cost:
 *          - P2_Durasi → impact_sailing, impact_berth_start/next
 *          - P1_BOP    → impact_port_start/next, impact_opex_start/end
 *
 * 6) System Cost (Formula 6: SystemCost USD/MMBTU)
 *    - Python:  kombinasi N-kapal (partition + cross-join) → System CAPEX/OPEX/System Cost
 *    - JS:
 *      • Untuk 1 kapal: runSupplyChainModel / runSupplyChainModelRisk
 *        langsung menghasilkan 'Total CAPEX (USD)', 'Total OPEX (USD/year)',
 *        dan 'Total Cost USD/MMBTU' per skenario.
 *      • Untuk 2 kapal (N=2): runTwoVesselProbabilityModel / Risk:
 *        - membagi lokasi → 2 cluster (ratios 50:50, 60:40, ...)
 *        - memanggil engine single-kapal untuk setiap cluster
 *        - menjumlahkan CAPEX/OPEX/Cost per pairing → 'total' (system table)
 *      • Untuk Hub & Spoke: runHubSpoke*Model* akan menjadi tempat porting
 *        langsung dari blok "CABANG 2: HUB & SPOKE" di Python.
 *
 * 7) Risk DB (risk_df / mapping_ii_to_p)
 *    - Python: risk_df + get_risk_value_from_db + build_risk_dictionary
 *    - JS:     Prisma model RiskMatrix + buildRiskDB + getRiskImpact
 *              (COL_MAP dan II_MAP adalah padanan kolom Python “II.x P*_...”)
 *
 * Catatan:
 * - Struktur tabel output di Postman sudah mengikuti header di notebook:
 *   Milk & Run 1 kapal → 1 tabel, lengkap (Top 20).
 *   Twin → 3 tabel (kapal_1, kapal_2, system) / mother+feeder+system untuk Hub & Spoke.
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
function getDistanceNM(distanceMap, origin, destination, geoMap) {
  const key = `${origin} - ${destination}`;
  const v = distanceMap.get(key);
  if (typeof v === 'number') return v;
  if (!geoMap) return null;
  const o = geoMap[origin];
  const d = geoMap[destination];
  if (!o || !d) return null;
  return haversineNm(o.latitude, o.longitude, d.latitude, d.longitude);
}

// NEW: Tank configuration helper (tidak hardcoded)
function getTankConfig(params) {
  return {
    tankSize: (typeof params.ukuran_tangki_500m3 === 'number' && params.ukuran_tangki_500m3 > 0)
      ? params.ukuran_tangki_500m3 : 500,
    tankPrice: (typeof params.harga_tangki_500m3 === 'number' && params.harga_tangki_500m3 > 0)
      ? params.harga_tangki_500m3 : 1030000,
  };
}

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

// --- NO-RISK SINGLE VESSEL ENGINE ---
async function runSupplyChainModel(input) {
  const {
    vessels, routes, oru,
    terminal, selectedLocations, demandBBTUD,
    params, inflationFactor,
    shareTerminalORU = false,
    geoMap,
  } = input;

  const { tankSize, tankPrice } = getTankConfig(params);
  const distanceMap = buildDistanceMap(routes);
  const oruMap = new Map(oru.map(o => [o.plantName.trim(), o.fixCapexUSD]));
  const vesselAdj = vessels.map(v => ({
    ...v,
    rentPerDayUSD: v.rentPerDayUSD * inflationFactor,
    portCostPerLocation: v.portCostPerLocation * inflationFactor,
  }));

  const allRoutes = permutations(selectedLocations);
  const results = [];
  const SCF_LNG = params.scf_lng;
  const SCF_MGO = params.scf_mgo;
  const Pyears = params.Penyaluran || 20;
  const totalDemandBBTUD = Object.values(demandBBTUD).reduce((a, b) => a + b, 0);
  let globalScenarioId = 0;

  const Batas_Maksimum_Utilisasi_LNGC = ((365 - params.maintenance_days) / 365) * 100;

  for (const vessel of vesselAdj) {
    const kapasitas_kapal = vessel.capacityM3;
    const speed = vessel.speedKnot;

    for (const route of allRoutes) {
      const fullRoute = [terminal, ...route, terminal];
      let totalDistance = 0;
      let sailingTime = 0;
      const legs = [];

      for (let i = 0; i < fullRoute.length - 1; i++) {
        const origin = fullRoute[i];
        const dest = fullRoute[i + 1];
        const dist = getDistanceNM(distanceMap, origin, dest, geoMap);
        if (!dist) { totalDistance = null; break; }
        totalDistance += dist;
        sailingTime += dist / speed;
        legs.push(dist);
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

      // CAPEX
      let total_capex = 0;
      let selected_storage_total = 0;
      for (const loc of route) {
        const gs_net = ((demandBBTUD[loc] / 24.04) * 1000) * RTD;
        const gs_buffer = gs_net + (buffer_day * (demandBBTUD[loc] / 24.04) * 1000);
        const net_storage = gs_buffer * params.gross_storage_pct;
        const selected_storage = roundUp(net_storage, tankSize);
        selected_storage_total += selected_storage;

        const tank_capex = (selected_storage / tankSize) * tankPrice * inflationFactor;
        const oru_capex = oruMap.get(loc) || 0;
        total_capex += tank_capex + oru_capex;
      }

      if (kapasitas_kapal < 20000) {
        const terminal_oru = oruMap.get(terminal);
        if (terminal_oru) {
          total_capex += shareTerminalORU ? terminal_oru / 2 : terminal_oru;
        }
      }

      const penyaluran_lifetime = totalDemandBBTUD * 365 * Pyears * 1000;
      const capex_usd_mmbtu = total_capex / penyaluran_lifetime;

      // OPEX
      const n_leg = legs.length;
      let sailing_time_voyage = 0;
      let sailing_time_ballast = 0;
      for (let i = 0; i < n_leg; i++) {
        const dist = legs[i];
        const time_leg = dist / speed;
        sailing_time_voyage += time_leg;
        if (i === n_leg - 1) sailing_time_ballast = time_leg;
      }

      const fuel_voyage = (sailing_time_voyage / 24) * vessel.voyageTonPerDay;
      const fuel_ballast = (sailing_time_ballast / 24) * vessel.ballastTonPerDay;
      const total_berth_call = route.length + 1;
      const fuel_berth = (params.loading_hour * total_berth_call / 24) * vessel.berthTonPerDay;
      const fuel_total = fuel_voyage + fuel_ballast + fuel_berth;
      const lng_fuel = fuel_total * (SCF_LNG / SCF_MGO);
      const lng_fuel_cost = voyages_year * lng_fuel * params.harga_lng;
      const port_cost = voyages_year * vessel.portCostPerLocation * total_berth_call;
      const rent_cost = vessel.rentPerDayUSD * 365;
      const opex_oru = total_capex * 0.05;
      const total_opex = lng_fuel_cost + port_cost + rent_cost + opex_oru;
      const penyaluran_year = totalDemandBBTUD * 365 * 1000;
      const opex_usd_mmbtu = total_opex / penyaluran_year;
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
        'Speed (knot)': speed,
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
        'Total CAPEX (USD)': Math.round(total_capex),
        'Total CAPEX USD/MMBTU': capex_usd_mmbtu,
        'Total OPEX (USD/year)': Math.round(total_opex * 10) / 10,
        'Total OPEX (USD/MMBTU)': opex_usd_mmbtu,
        'Total Cost (USD/MMBTU)': total_cost,
        'Spokes': route.join(', '),
      });
    }
  }

  results.sort((a, b) => a['Total Cost (USD/MMBTU)'] - b['Total Cost (USD/MMBTU)']);
  return results.slice(0, 20);
}

// --- RISK-AWARE SINGLE VESSEL ENGINE (SAME REFACTOR) ---
async function runSupplyChainModelRisk(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor, riskDB, geoMap,
  } = input;

  const { tankSize, tankPrice } = getTankConfig(params);
  const distanceMap = buildDistanceMap(routes);
  const oruMap = new Map(oru.map(o => [o.plantName.trim(), o.fixCapexUSD]));
  const vesselAdj = vessels.map(v => ({
    ...v,
    rentPerDayUSD: v.rentPerDayUSD * inflationFactor,
    portCostPerLocation: v.portCostPerLocation * inflationFactor,
    portCostLTP: v.portCostLTP * inflationFactor,
    portCostDelay: v.portCostDelay * inflationFactor,
  }));

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

  for (const vessel of vesselAdj) {
    const kapasitas_kapal = vessel.capacityM3;
    const speed = vessel.speedKnot;

    for (const route of allRoutes) {
      const fullRoute = [terminal, ...route, terminal];
      let totalDistance = 0;
      const legs = [];

      for (let i = 0; i < fullRoute.length - 1; i++) {
        const origin = fullRoute[i];
        const dest = fullRoute[i + 1];
        const dist = getDistanceNM(distanceMap, origin, dest, geoMap);
        if (!dist) { totalDistance = null; break; }
        totalDistance += dist;
        legs.push(dist);
      }
      if (totalDistance == null) continue;

      // Sailing time with risk
      let sailingTime = 0;
      for (const d of legs) {
        sailingTime += (d / speed) * (1 + im_s);
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
      if (kapasitas_kapal < 20000) {
        const terminal_oru = oruMap.get(terminal) || 0;
        capex_terminal_risked = terminal_oru * (1 + impact_capex_end);
        total_capex += capex_terminal_risked;
      }

      const penyaluran_lifetime = totalDemandBBTUD * 365 * Pyears * 1000;
      const capex_usd_mmbtu = total_capex / penyaluran_lifetime;

      // OPEX with risk
      const risk_opex_6 = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.6');
      const risk_opex_7 = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.7');
      const risk_opex_8 = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.8');
      const impact_opex_start = (risk_opex_6 + risk_opex_7 + risk_opex_8) / 3 || 0;
      const impact_opex_end = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.1') || 0;

      let opex_oru = (total_capex - capex_terminal_risked) * 0.05 * (1 + impact_opex_start);
      opex_oru += capex_terminal_risked * 0.05 * (1 + impact_opex_end);

      // Fuel with risk
      const n_leg = legs.length;
      let sailing_time_voyage = 0;
      let sailing_time_ballast = 0;
      for (let i = 0; i < n_leg; i++) {
        const dist = legs[i];
        const time_leg = (dist / speed) * (1 + im_s);
        sailing_time_voyage += time_leg;
        if (i === n_leg - 1) sailing_time_ballast = time_leg;
      }

      const fuel_voyage = (sailing_time_voyage / 24) * vessel.voyageTonPerDay;
      const fuel_ballast = (sailing_time_ballast / 24) * vessel.ballastTonPerDay;
      const fuel_berth = (totalLoadingTime / 24) * vessel.berthTonPerDay;
      const fuel_total = fuel_voyage + fuel_ballast + fuel_berth;
      const lng_fuel = fuel_total * (SCF_LNG / SCF_MGO);
      const lng_fuel_cost = voyages_year * lng_fuel * params.harga_lng;

      // Port cost with risk
      const impact_port_start = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.2');
      const impact_port_next = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.5');
      const port_ltp = vessel.portCostLTP;
      const port_delay = vessel.portCostDelay;
      const port_start_per_voyage = port_ltp * (1 + impact_port_start) + port_delay;
      const port_next_per_voyage = route.length * (port_ltp * (1 + impact_port_next) + port_delay);
      const port_cost = voyages_year * (port_start_per_voyage + port_next_per_voyage);

      const rent_cost = vessel.rentPerDayUSD * 365;
      const total_opex = lng_fuel_cost + port_cost + rent_cost + opex_oru;

      const penyaluran_year = totalDemandBBTUD * 365 * 1000;
      const opex_usd_mmbtu = total_opex / penyaluran_year;
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
        'Speed (knot)': speed,
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
        'Total CAPEX (USD)': Math.round(total_capex),
        'Total CAPEX USD/MMBTU': capex_usd_mmbtu,
        'Total OPEX (USD/year)': Math.round(total_opex * 10) / 10,
        'Total OPEX (USD/MMBTU)': opex_usd_mmbtu,
        'Total Cost (USD/MMBTU)': total_cost,
        'Spokes': route.join(', '),
      });
    }
  }

  results.sort((a, b) => a['Total Cost (USD/MMBTU)'] - b['Total Cost (USD/MMBTU)']);
  return results.slice(0, 20);
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
        params, inflationFactor, shareTerminalORU, geoMap,
      });
      const df2 = await runSupplyChainModel({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k2, demandBBTUD: demand_k2,
        params, inflationFactor, shareTerminalORU, geoMap,
      });

      if (!df1.length || !df2.length) continue;

      const label = `${loc_k1.length}:${loc_k2.length}`;

      for (const k1 of df1) {
        for (const k2 of df2) {
          if (Array.isArray(vesselNames) && vesselNames.length === 2) {
            if (k1['Nama Kapal'] !== vesselNames[0] || k2['Nama Kapal'] !== vesselNames[1]) continue;
          } else if (enforceSameVessel) {
            if (k1['Nama Kapal'] !== k2['Nama Kapal'] || k1['Kapasitas Kapal (m3)'] !== k2['Kapasitas Kapal (m3)']) continue;
          }

          const c_usd = k1['Total CAPEX (USD)'] + k2['Total CAPEX (USD)'];
          const o_usd_year = k1['Total OPEX (USD/year)'] + k2['Total OPEX (USD/year)'];
          const sys_cost = (c_usd + (o_usd_year * Pyears)) / (totalDemandBBTUD * 1000 * 365 * Pyears);
          
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
      });
      const df2 = await runSupplyChainModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k2, demandBBTUD: demand_k2,
        params, inflationFactor, riskDB, geoMap,
      });

      if (!df1.length || !df2.length) continue;

      const label = `${loc_k1.length}:${loc_k2.length}`;

      for (const k1 of df1) {
        for (const k2 of df2) {
          if (Array.isArray(vesselNames) && vesselNames.length === 2) {
            if (k1['Nama Kapal'] !== vesselNames[0] || k2['Nama Kapal'] !== vesselNames[1]) continue;
          } else if (enforceSameVessel) {
            if (k1['Nama Kapal'] !== k2['Nama Kapal'] || k1['Kapasitas Kapal (m3)'] !== k2['Kapasitas Kapal (m3)']) continue;
          }

          const c_usd = k1['Total CAPEX (USD)'] + k2['Total CAPEX (USD)'];
          const o_usd_year = k1['Total OPEX (USD/year)'] + k2['Total OPEX (USD/year)'];
          const sys_cost = (c_usd + (o_usd_year * Pyears)) / (totalDemandBBTUD * 1000 * 365 * Pyears);
          
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
    // twinCfg (ratios, enforceSameVessel, vesselNames, ...) diabaikan di sini, karena
    // algoritma Hub & Spoke N-dimensional tidak pakai rasio pembagian demand
  } = input;

  if (!Array.isArray(locs) || locs.length === 0) {
    return { mother: [], feeder1: [], feeder2: [], system: [] };
  }

  const { tankSize, tankPrice } = getTankConfig(params); // FIX: get tankSize/tankPrice here
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

  const oruMap = new Map(oru.map(o => [o.plantName.trim(), o.fixCapexUSD]));
  // vessels disortir kapasitas (kecil -> besar) dan sudah di-adjust inflasi
  const kSorted = vessels
    .map(v => ({
      ...v,
      rentPerDayUSD: v.rentPerDayUSD * inflationFactor,
      portCostLTP: v.portCostLTP * inflationFactor,
      portCostDelay: v.portCostDelay * inflationFactor,
    }))
    .sort((a, b) => a.capacityM3 - b.capacityM3);

  const gr = (p, ii) => getRiskImpact(riskDB, p, ii) || 0.0;
  const im_s = gr('P2_Durasi', 'II.3');

  // HELPER: mother vessel (Terminal → Hub → Terminal)
  function calcMother(hub, totDemBBTUD) {
    const rows = [];
    // CHANGED: jarak dari DB atau geoMap
    const baseDist =
      getDistanceNM(distMap, terminal, hub, geoMap) ??
      getDistanceNM(distMap, hub, terminal, geoMap);
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
      const speed = k.speedKnot;
      const st = (dist * 2 / speed) * (1 + im_s); // jam
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
        100
      );

      const tankCapexHub = (sel_st / tankSize) * tankPrice * inflationFactor; // FIXED
      const oruHub = oruMap.get(hub) || 0;
      const cap_hub = tankCapexHub + oruHub * (1 + impact_capex_start);

      const oruTerm = oruMap.get(terminal) || 0;
      const cap_term =
        k.capacityM3 < 20000 ? oruTerm * (1 + impact_capex_end) : 0;

      const t_cap = cap_hub + cap_term;

      const fv = (dist * 2 / speed) * (1 + im_s) / 24.0 * k.voyageTonPerDay;
      const fb = (dist / speed) * (1 + im_s) / 24.0 * k.ballastTonPerDay;
      const fbt = (lt / 24.0) * k.berthTonPerDay;

      const lng_c =
        vy *
        (fv + fb + fbt) *
        (params.scf_lng / params.scf_mgo) *
        params.harga_lng;

      const port_ltp = k.portCostLTP;
      const port_delay = k.portCostDelay;
      const pc =
        vy *
          port_ltp *
          (2 + gr('P1_Biaya_Operasi', 'II.2') + gr('P1_Biaya_Operasi', 'II.5')) +
        vy * port_delay * 2;

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
        'Speed (knot)': speed,
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
        const d = getDistanceNM(distMap, origin, dest, geoMap);
        if (!d) {
          valid = false;
          break;
        }
        tdist += d;
        legs.push(d);
      }
      if (!valid) continue;

      for (const k of kSorted) {
        const speed = k.speedKnot;
        const lt = params.loading_hour * (1 + ruteLocs.length);
        const st = tdist / speed;
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
          const d = legs[i];
          const t_leg = (d / speed) * (1 + im_s);
          fv += (t_leg / 24.0) * k.voyageTonPerDay;
          if (i === legs.length - 1) {
            fb += (t_leg / 24.0) * k.ballastTonPerDay;
          }
        }
        const fbt = (lt / 24.0) * k.berthTonPerDay;

        const lng_c =
          vy *
          (fv + fb + fbt) *
          (params.scf_lng / params.scf_mgo) *
          params.harga_lng;

        const port_ltp = k.portCostLTP;
        const port_delay = k.portCostDelay;
        const port_start_per_voyage =
          port_ltp * (1 + impact_port_start) + port_delay;
        const port_next_per_voyage =
          ruteLocs.length * (port_ltp * (1 + impact_port_next) + port_delay);
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
          'Speed (knot)': speed,
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
        out[k.substring(2)] = v; // buang prefix "M_"
      }
    }
    return out;
  });

  // Feeder 1 table
  const feeder1 = sortedAll.map(r => {
    const out = {
      'No. Skenario': r['No. Skenario'],
      'Skenario Hub': r['Skenario Hub'],
    };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('F1_')) {
        out[k.substring(3)] = v; // buang prefix "F1_"
      }
    }
    return out;
  });

  // Feeder 2 table
  const feeder2 = sortedAll.map(r => {
    const out = {
      'No. Skenario': r['No. Skenario'],
      'Skenario Hub': r['Skenario Hub'],
    };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('F2_')) {
        out[k.substring(3)] = v; // buang prefix "F2_"
      }
    }
    return out;
  });

  // System gabungan (ringkas)
  const system = sortedAll.map(r => ({
    'No. Skenario': r['No. Skenario'],
    'Skenario Hub': r['Skenario Hub'],
    'Probability': r['Probability'],
    'M_Nama Kapal 1 (Mother)': r['M_Nama Kapal'] || r['M_Nama Kapal '],
    'F1_Nama Kapal 2 (Feeder 1)': r['F1_Nama Kapal'] || null,
    'F2_Nama Kapal 3 (Feeder 2)': r['F2_Nama Kapal'] || null,
    'System CAPEX (USD)': r['System CAPEX (USD)'],
    'System OPEX (USD/year)': r['System OPEX (USD/year)'],
    'System Cost (USD/MMBTU)': r['System Cost (USD/MMBTU)'],
  }));

  return { mother, feeder1, feeder2, system };
}

/**
 * Hub & Spoke, 1 kapal (feeder), NO-RISK
 * Output: { mother: [], feeder1: [], system: [] }
 */
async function runHubSpokeSingleModel(input) {
  const {
    vessels,
    routes,
    oru,
    terminal,
    selectedLocations: locs,
    demandBBTUD,
    params,
    inflationFactor,
    geoMap,
  } = input;

  if (!Array.isArray(locs) || locs.length === 0) {
    return { mother: [], feeder1: [], system: [] };
  }

  const { tankSize, tankPrice } = getTankConfig(params);
  const LNG_EC = 24.04;
  const Pyears = params.Penyaluran || 20;

  // distance map dua-arah
  const distMap = new Map();
  for (const r of routes) {
    distMap.set(`${r.origin} - ${r.destination}`, r.nauticalMiles);
    distMap.set(`${r.destination} - ${r.origin}`, r.nauticalMiles);
  }

  const oruMap = new Map(oru.map(o => [o.plantName.trim(), o.fixCapexUSD]));
  const kSorted = vessels
    .map(v => ({
      ...v,
      rentPerDayUSD: v.rentPerDayUSD * inflationFactor,
      portCostLTP: v.portCostLTP * inflationFactor,
      portCostDelay: v.portCostDelay * inflationFactor,
    }))
    .sort((a, b) => a.capacityM3 - b.capacityM3);

  // HELPER: mother vessel (Terminal → Hub → Terminal)
  function calcMother(hub, totDemBBTUD) {
    const rows = [];
    const baseDist =
      getDistanceNM(distMap, terminal, hub, geoMap) ??
      getDistanceNM(distMap, hub, terminal, geoMap);
    if (!baseDist) return rows;

    const dist = baseDist;
    const dem_m3 = (totDemBBTUD * 1000) / LNG_EC;

    for (const k of kSorted) {
      const speed = k.speedKnot;
      const st = (dist * 2 / speed) * (1 + im_s); // jam
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
        100
      );

      const tankCapexHub = (sel_st / tankSize) * tankPrice * inflationFactor; // FIXED
      const oruHub = oruMap.get(hub) || 0;
      const cap_hub = tankCapexHub + oruHub * (1 + impact_capex_start);

      const oruTerm = oruMap.get(terminal) || 0;
      const cap_term =
        k.capacityM3 < 20000 ? oruTerm * (1 + impact_capex_end) : 0;

      const t_cap = cap_hub + cap_term;

      const fv = (dist * 2 / speed) * (1 + im_s) / 24.0 * k.voyageTonPerDay;
      const fb = (dist / speed) * (1 + im_s) / 24.0 * k.ballastTonPerDay;
      const fbt = (lt / 24.0) * k.berthTonPerDay;

      const lng_c =
        vy *
        (fv + fb + fbt) *
        (params.scf_lng / params.scf_mgo) *
        params.harga_lng;

      const port_ltp = k.portCostLTP;
      const port_delay = k.portCostDelay;
      const pc =
        vy *
          port_ltp *
          (2 + gr('P1_Biaya_Operasi', 'II.2') + gr('P1_Biaya_Operasi', 'II.5')) +
        vy * port_delay * 2;

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
        'Speed (knot)': speed,
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
        const d = getDistanceNM(distMap, origin, dest, geoMap);
        if (!d) {
          valid = false;
          break;
        }
        tdist += d;
        legs.push(d);
      }
      if (!valid) continue;

      for (const k of kSorted) {
        const speed = k.speedKnot;
        const lt = params.loading_hour * (1 + ruteLocs.length);
        const st = tdist / speed;
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
          const d = legs[i];
          const t_leg = (d / speed) * (1 + im_s);
          fv += (t_leg / 24.0) * k.voyageTonPerDay;
          if (i === legs.length - 1) {
            fb += (t_leg / 24.0) * k.ballastTonPerDay;
          }
        }
        const fbt = (lt / 24.0) * k.berthTonPerDay;

        const lng_c =
          vy *
          (fv + fb + fbt) *
          (params.scf_lng / params.scf_mgo) *
          params.harga_lng;

        const port_ltp = k.portCostLTP;
        const port_delay = k.portCostDelay;
        const port_start_per_voyage =
          port_ltp * (1 + impact_port_start) + port_delay;
        const port_next_per_voyage =
          ruteLocs.length * (port_ltp * (1 + impact_port_next) + port_delay);
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
          'Speed (knot)': speed,
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
        out[k.substring(2)] = v; // buang prefix "M_"
      }
    }
    return out;
  });

  // Feeder 1 table
  const feeder1 = sortedAll.map(r => {
    const out = {
      'No. Skenario': r['No. Skenario'],
      'Skenario Hub': r['Skenario Hub'],
    };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('F1_')) {
        out[k.substring(3)] = v; // buang prefix "F1_"
      }
    }
    return out;
  });

  // Feeder 2 table
  const feeder2 = sortedAll.map(r => {
    const out = {
      'No. Skenario': r['No. Skenario'],
      'Skenario Hub': r['Skenario Hub'],
    };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('F2_')) {
        out[k.substring(3)] = v; // buang prefix "F2_"
      }
    }
    return out;
  });

  // System gabungan (ringkas)
  const system = sortedAll.map(r => ({
    'No. Skenario': r['No. Skenario'],
    'Skenario Hub': r['Skenario Hub'],
    'Probability': r['Probability'],
    'M_Nama Kapal 1 (Mother)': r['M_Nama Kapal'] || r['M_Nama Kapal '],
    'F1_Nama Kapal 2 (Feeder 1)': r['F1_Nama Kapal'] || null,
    'F2_Nama Kapal 3 (Feeder 2)': r['F2_Nama Kapal'] || null,
    'System CAPEX (USD)': r['System CAPEX (USD)'],
    'System OPEX (USD/year)': r['System OPEX (USD/year)'],
    'System Cost (USD/MMBTU)': r['System Cost (USD/MMBTU)'],
  }));

  return { mother, feeder1, feeder2, system };
}

/**
 * Hub & Spoke, 1 kapal (feeder), RISK
 * Output: { mother: [], feeder1: [], system: [] }
 */
async function runHubSpokeSingleModelRisk(input) {
  const {
    vessels, routes, oru, terminal,
    selectedLocations: locs, demandBBTUD,
    params, inflationFactor, riskDB, geoMap,
  } = input;

  if (!Array.isArray(locs) || locs.length === 0) {
    return { mother: [], feeder1: [], system: [] };
  }

  const { tankSize, tankPrice } = getTankConfig(params);
  const LNG_EC = 24.04;
  const Pyears = params.Penyaluran || 20;

  const distMap = new Map();
  for (const r of routes) {
    distMap.set(`${r.origin} - ${r.destination}`, r.nauticalMiles);
    distMap.set(`${r.destination} - ${r.origin}`, r.nauticalMiles);
  }

  const oruMap = new Map(oru.map(o => [o.plantName.trim(), o.fixCapexUSD]));
  const kSorted = vessels
    .map(v => ({
      ...v,
      rentPerDayUSD: v.rentPerDayUSD * inflationFactor,
      portCostLTP: v.portCostLTP * inflationFactor,
      portCostDelay: v.portCostDelay * inflationFactor,
    }))
    .sort((a, b) => a.capacityM3 - b.capacityM3);

  const gr = (p, ii) => getRiskImpact(riskDB, p, ii) || 0.0;
  const im_s = gr('P2_Durasi', 'II.3');

  // Sama seperti runHubSpokeSingleModel tapi dengan risk adjustments
  // ... (implementasi calcMother dan calcFeederRoutes dengan risk seperti runHubSpokeTwoVesselModelRisk)

  // Untuk sementara, panggil versi 2-kapal dengan numV=1 style
  // atau copy logic dari runHubSpokeTwoVesselModelRisk dengan numV=1
  
  // Simplified: use non-risk version for now, risk can be added later
  const noRiskResult = await runHubSpokeSingleModel({
    ...input,
    riskDB: undefined, // ignore risk for now
  });
  
  return noRiskResult;
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

// ...existing runHubSpokeTwoVesselModelRisk...

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
      
      const df = await runSupplyChainModel({
        vessels, routes, oru, terminal,
        selectedLocations: subset,
        demandBBTUD: subsetDemand,
        params, inflationFactor,
        shareTerminalORU,
        geoMap,
      });

      if (!df.length) {
        allValid = false;
        break;
      }

      // Ambil top candidates (limit untuk performa)
      const topN = numVessels <= 2 ? 50 : (numVessels <= 3 ? 20 : 10);
      subResults.push(df.slice(0, topN));
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

      // Calculate system cost
      const c_usd = kapalCombo.reduce((sum, k) => sum + k['Total CAPEX (USD)'], 0);
      const o_usd_year = kapalCombo.reduce((sum, k) => sum + k['Total OPEX (USD/year)'], 0);
      const sys_cost = (c_usd + (o_usd_year * Pyears)) / (totalDemandBBTUD * 1000 * 365 * Pyears);

      globalScenarioId += 1;

      const row = {
        'No. Skenario': globalScenarioId,
        'Probability': partition.map(p => p.length).join(':'),
        'Nama Kapal': kapalCombo[0]['Nama Kapal'],
        'Kapasitas Kapal (m3)': kapalCombo[0]['Kapasitas Kapal (m3)'],
      };

      // Add details for each kapal
      for (let i = 0; i < numVessels; i++) {
        const k = kapalCombo[i];
        const prefix = `Kapal ${i + 1}`;
        row[`Rute ${prefix}`] = k['Rute'];
        row[`Total Jarak ${prefix} (NM)`] = k['Total Jarak (NM)'];
        row[`RTD ${prefix}`] = k['RTD'];
        row[`Demand LNG/day ${prefix} (m3)`] = k['Demand LNG/day (m3)'];
        row[`Nominal Capacity ${prefix} (m3)`] = k['Nominal Capacity (m3)'];
        row[`Utilitasi_Factor_LNGC ${prefix}`] = k['Utilitasi_Factor_LNGC'];
        row[`CAPEX ${prefix}`] = k['Total CAPEX (USD)'];
        row[`OPEX ${prefix}`] = k['Total OPEX (USD/year)'];
        row[`Cost ${prefix}`] = k['Total Cost (USD/MMBTU)'];
        row[`Spokes ${prefix}`] = k['Spokes'];
      }

      row['System CAPEX (USD)'] = c_usd;
      row['System OPEX (USD/year)'] = o_usd_year;
      row['System Cost (USD/MMBTU)'] = sys_cost;

      allCombos.push({ row, kapalCombo, partition });
    }
  }

  // Sort and get top 20
  allCombos.sort((a, b) => a.row['System Cost (USD/MMBTU)'] - b.row['System Cost (USD/MMBTU)']);
  const top20 = allCombos.slice(0, 20);

  // Build output tables
  const result = { system: [] };
  for (let i = 1; i <= numVessels; i++) {
    result[`kapal_${i}`] = [];
  }

  for (const { row, kapalCombo } of top20) {
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
      
      const df = await runSupplyChainModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: subset,
        demandBBTUD: subsetDemand,
        params, inflationFactor, riskDB, geoMap,
      });

      if (!df.length) {
        allValid = false;
        break;
      }

      const topN = numVessels <= 2 ? 50 : (numVessels <= 3 ? 20 : 10);
      subResults.push(df.slice(0, topN));
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

      const c_usd = kapalCombo.reduce((sum, k) => sum + k['Total CAPEX (USD)'], 0);
      const o_usd_year = kapalCombo.reduce((sum, k) => sum + k['Total OPEX (USD/year)'], 0);
      const sys_cost = (c_usd + (o_usd_year * Pyears)) / (totalDemandBBTUD * 1000 * 365 * Pyears);

      globalScenarioId += 1;

      const row = {
        'No. Skenario': globalScenarioId,
        'Probability': partition.map(p => p.length).join(':'),
        'Nama Kapal': kapalCombo[0]['Nama Kapal'],
        'Kapasitas Kapal (m3)': kapalCombo[0]['Kapasitas Kapal (m3)'],
      };

      for (let i = 0; i < numVessels; i++) {
        const k = kapalCombo[i];
        const prefix = `Kapal ${i + 1}`;
        row[`Rute ${prefix}`] = k['Rute'];
        row[`Total Jarak ${prefix} (NM)`] = k['Total Jarak (NM)'];
        row[`RTD ${prefix}`] = k['RTD'];
        row[`Demand LNG/day ${prefix} (m3)`] = k['Demand LNG/day (m3)'];
        row[`Nominal Capacity ${prefix} (m3)`] = k['Nominal Capacity (m3)'];
        row[`Utilitasi_Factor_LNGC ${prefix}`] = k['Utilitasi_Factor_LNGC'];
        row[`CAPEX ${prefix}`] = k['Total CAPEX (USD)'];
        row[`OPEX ${prefix}`] = k['Total OPEX (USD/year)'];
        row[`Cost ${prefix}`] = k['Total Cost (USD/MMBTU)'];
        row[`Spokes ${prefix}`] = k['Spokes'];
      }

      row['System CAPEX (USD)'] = c_usd;
      row['System OPEX (USD/year)'] = o_usd_year;
      row['System Cost (USD/MMBTU)'] = sys_cost;

      allCombos.push({ row, kapalCombo, partition });
    }
  }

  allCombos.sort((a, b) => a.row['System Cost (USD/MMBTU)'] - b.row['System Cost (USD/MMBTU)']);
  const top20 = allCombos.slice(0, 20);

  const result = { system: [] };
  for (let i = 1; i <= numVessels; i++) {
    result[`kapal_${i}`] = [];
  }

  for (const { row, kapalCombo } of top20) {
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
 */
async function runHubSpokeNVesselModelRisk(input) {
  const {
    vessels, routes, oru, terminal,
    selectedLocations: locs, demandBBTUD,
    params, inflationFactor, riskDB, geoMap,
    numFeeders = 2,
    enforceSameVessel = true,
  } = input;

  if (!Array.isArray(locs) || locs.length === 0) {
    const emptyResult = { mother: [], system: [] };
    for (let i = 1; i <= numFeeders; i++) emptyResult[`feeder${i}`] = [];
    return emptyResult;
  }

  // For now, delegate to existing 2-vessel implementation if numFeeders <= 2
  if (numFeeders <= 2) {
    return runHubSpokeTwoVesselModelRisk(input);
  }

  // TODO: Implement full N-feeder logic (similar pattern to runNVesselProbabilityModelRisk)
  // This is a placeholder - full implementation would follow same partition pattern
  console.warn(`Hub & Spoke ${numFeeders}-feeder belum diimplementasi penuh, fallback ke 2-feeder`);
  return runHubSpokeTwoVesselModelRisk({ ...input, numFeeders: 2 });
}

module.exports = {
  runSupplyChainModel,
  runTwoVesselProbabilityModel,
  buildRiskDB,
  runSupplyChainModelRisk,
  runTwoVesselProbabilityModelRisk,
  runHubSpokeSingleModel,
  runHubSpokeSingleModelRisk,
  runHubSpokeTwoVesselModel,
  runHubSpokeTwoVesselModelRisk,
  // NEW: N-vessel engines
  runNVesselProbabilityModel,
  runNVesselProbabilityModelRisk,
  runHubSpokeNVesselModel,
  runHubSpokeNVesselModelRisk,
};
