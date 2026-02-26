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

// --- NO-RISK SINGLE VESSEL ENGINE ---
async function runSupplyChainModel(input) {
  const {
    vessels, routes, oru,
    terminal, selectedLocations, demandBBTUD,
    params, inflationFactor,
    shareTerminalORU = false,
    geoMap, // NEW
  } = input;

  const distanceMap = buildDistanceMap(routes);
  const oruMap = new Map(oru.map(o => [o.plantName, o.fixCapexUSD]));
  const vesselAdj = vessels.map(v => ({
    ...v,
    rentPerDayUSD: v.rentPerDayUSD * inflationFactor,
    portCostPerLocation: v.portCostPerLocation * inflationFactor,
  }));

  const allRoutes = permutations(selectedLocations);
  const results = [];
  const SCF_LNG = params.scf_lng;
  const SCF_MGO = params.scf_mgo;

  for (const vessel of vesselAdj) {
    const kapasitas_kapal = vessel.capacityM3;
    const speed = vessel.speedKnot;

    for (const route of allRoutes) {
      const fullRoute = [terminal, ...route, terminal];
      let totalDistance = 0;
      let sailingTime = 0;
      const legs = []; // NEW: simpan jarak per leg

      // gunakan getDistanceNM (DB atau koordinat)
      for (let i = 0; i < fullRoute.length - 1; i++) {
        const origin = fullRoute[i];
        const dest = fullRoute[i + 1];
        const dist = getDistanceNM(distanceMap, origin, dest, geoMap);
        if (!dist) { totalDistance = null; break; }
        totalDistance += dist;
        sailingTime += dist / speed;
        legs.push(dist); // NEW
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
      const min_volume = roundUp(nominal_capacity, 100);
      if (min_volume > kapasitas_kapal) continue;

      // NEW: statistik stok & utilisasi
      const days_stock = working_volume_lngc / demand_m3_day;
      const voyages_year = 365 / days_stock;
      const Utilitasi_Factor_LNGC = (RTD * voyages_year / 365) * 100;
      const Batas_Maksimum_Utilisasi_LNGC = ((365 - params.maintenance_days) / 365) * 100;

      // CAPEX (no-risk)
      let total_capex = 0;
      let selected_storage_total = 0; // NEW: akumulasi storage
      for (const loc of route) {
        const gs_net = ((demandBBTUD[loc] / 24.04) * 1000) * RTD;
        const gs_buffer = gs_net + (buffer_day * (demandBBTUD[loc] / 24.04) * 1000);
        const net_storage = gs_buffer * params.gross_storage_pct;
        const selected_storage = roundUp(net_storage, 500);
        selected_storage_total += selected_storage; // NEW

        const tank_capex = (selected_storage / 500) * 1030000 * inflationFactor;
        const oru_capex = oruMap.get(loc) || 0;
        total_capex += tank_capex + oru_capex;
      }

      if (kapasitas_kapal < 20000) {
        const terminal_oru = oruMap.get(terminal);
        if (terminal_oru) total_capex += shareTerminalORU ? (terminal_oru / 2) : terminal_oru;
      }

      const penyaluran_20th = Object.values(demandBBTUD).reduce((a, b) => a + b, 0) * 365 * 20 * 1000;
      const capex_usd_mmbtu = total_capex / penyaluran_20th;

      // OPEX (no-risk)
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
      const penyaluran_year = Object.values(demandBBTUD).reduce((a, b) => a + b, 0) * 365 * 1000;
      const opex_usd_mmbtu = total_opex / penyaluran_year;
      const total_cost = capex_usd_mmbtu + opex_usd_mmbtu;
      const total_cost_rd3 = Math.round(total_cost * 1000) / 1000;

      results.push({
        'Nama Kapal': vessel.name,
        'Rute': fullRoute.join(' - '),
        'Total Jarak (NM)': totalDistance,
        'RTD (day)': RTD,
        'Demand LNG/day (m3)': demand_m3_day,
        'Nominal Capacity (m3)': nominal_capacity,
        'Kapasitas Kapal (m3)': kapasitas_kapal,
        'Speed (knot)': speed,
        'buffer_day': buffer_day,
        'days_stock': days_stock,                         // NEW
        'voyages_year': voyages_year,                     // NEW
        'Utilitasi_Factor_LNGC': Utilitasi_Factor_LNGC,   // NEW
        'Batas_Maksimum_Utilisasi_LNGC': Batas_Maksimum_Utilisasi_LNGC, // NEW
        'selected_storage Total': selected_storage_total, // NEW
        'fuel_voyage': fuel_voyage,                       // NEW
        'fuel_ballast': fuel_ballast,
        'fuel_berth': fuel_berth,                         // NEW
        'lng_fuel_cost': lng_fuel_cost,                   // NEW
        'port_cost': port_cost,                           // NEW
        'rent_cost': rent_cost,                           // NEW
        'Total CAPEX (USD)': Math.round(total_capex),
        'Total CAPEX USD/MMBTU': capex_usd_mmbtu,
        'Total OPEX (USD/year)': Math.round(total_opex * 10) / 10,
        'Total OPEX USD/MMBTU': opex_usd_mmbtu,
        'Total Cost USD/MMBTU': total_cost,
        'Total Cost USD/MMBTU (Round 3)': total_cost_rd3, // NEW
      });
    }
  }

  results.sort((a, b) => a['Total Cost USD/MMBTU'] - b['Total Cost USD/MMBTU']);
  return results;
}

// Twin vessel probability logic:
// - For each ratio (e.g., 50:50, 60:40...), split selectedLocations into two sets by combination count.
// - Run the single-vessel engine independently on each set.
// - Enforce same vessel pairing or fixed vessel names if provided.
// - Sum CAPEX/OPEX/Unit Cost per pairing and rank ascending by Total Cost USD/MMBTU.

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

// --- RISK-AWARE SINGLE VESSEL ENGINE ---
async function runSupplyChainModelRisk(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor, riskDB,
    geoMap, // NEW
  } = input;

  const distanceMap = buildDistanceMap(routes);
  const oruMap = new Map(oru.map(o => [o.plantName, o.fixCapexUSD]));
  const vesselAdj = vessels.map(v => ({
    ...v,
    rentPerDayUSD: v.rentPerDayUSD * inflationFactor,
    portCostPerLocation: v.portCostPerLocation * inflationFactor,
  }));

  const allRoutes = permutations(selectedLocations);
  const results = [];
  const SCF_LNG = params.scf_lng;
  const SCF_MGO = params.scf_mgo;

  for (const vessel of vesselAdj) {
    const kapasitas_kapal = vessel.capacityM3;
    const speed = vessel.speedKnot;

    for (const route of allRoutes) {
      const fullRoute = [terminal, ...route, terminal];
      let totalDistance = 0;
      let sailingTime = 0;
      const legs = []; // NEW

      // gunakan getDistanceNM (DB atau koordinat)
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
      const min_volume = roundUp(nominal_capacity, 100);
      if (min_volume > kapasitas_kapal) continue;

      // NEW: statistik stok & utilisasi
      const days_stock = working_volume_lngc / demand_m3_day;
      const voyages_year = 365 / days_stock;
      const Utilitasi_Factor_LNGC = (RTD * voyages_year / 365) * 100;
      const Batas_Maksimum_Utilisasi_LNGC = ((365 - params.maintenance_days) / 365) * 100;

      // CAPEX with risk (P3)
      const risk_capex_6 = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.6');
      const risk_capex_7 = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.7');
      const risk_capex_8 = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.8');
      const impact_capex_start = (risk_capex_6 + risk_capex_7 + risk_capex_8) / 3 || 0;
      const impact_capex_end = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.1') || 0;

      let total_capex = 0.0;
      const capex_loc_map = new Map();
      let selected_storage_total = 0; // NEW

      for (const loc of route) {
        const gs_net = ((demandBBTUD[loc] / 24.04) * 1000) * RTD;
        const gs_buffer = gs_net + (buffer_day * (demandBBTUD[loc] / 24.04) * 1000);
        const net_storage = gs_buffer * params.gross_storage_pct;
        const selected_storage = roundUp(net_storage, 500);
        selected_storage_total += selected_storage; // NEW

        const tank_capex = (selected_storage / 500) * 1030000 * inflationFactor;
        const oru_capex = oruMap.get(loc) || 0;
        const capex_loc_risked = tank_capex + (oru_capex * (1 + impact_capex_start));
        capex_loc_map.set(loc, capex_loc_risked);
        total_capex += capex_loc_risked;
      }

      // Terminal ORU (small vessel)
      let capex_terminal_risked = 0.0;
      if (kapasitas_kapal < 20000) {
        const terminal_oru = oruMap.get(terminal) || 0;
        capex_terminal_risked = terminal_oru * (1 + impact_capex_end);
        total_capex += capex_terminal_risked;
      }

      const penyaluran_20th = Object.values(demandBBTUD).reduce((a, b) => a + b, 0) * 365 * 20 * 1000;
      const capex_usd_mmbtu = total_capex / penyaluran_20th;

      // OPEX ORU with risk (P1)
      const risk_opex_6 = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.6');
      const risk_opex_7 = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.7');
      const risk_opex_8 = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.8');
      const impact_opex_start = (risk_opex_6 + risk_opex_7 + risk_opex_8) / 3 || 0;
      const impact_opex_end = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.1') || 0;

      let opex_oru = 0.0;
      for (const capex_loc of capex_loc_map.values()) {
        opex_oru += capex_loc * 0.05 * (1 + impact_opex_start);
      }
      opex_oru += capex_terminal_risked * 0.05 * (1 + impact_opex_end);

      // Fuel OPEX with risk on times (pakai legs)
      const impact_sailing = getRiskImpact(riskDB, 'P2_Durasi', 'II.3');
      const impact_berth_start = getRiskImpact(riskDB, 'P2_Durasi', 'II.2');
      const impact_berth_next = getRiskImpact(riskDB, 'P2_Durasi', 'II.5');

      let sailing_time_voyage = 0.0;
      let sailing_time_ballast = 0.0;
      const n_leg = legs.length;

      for (let i = 0; i < n_leg; i++) {
        const dist = legs[i];
        const base_time = dist / speed;
        const time_leg = base_time * (1 + impact_sailing);
        sailing_time_voyage += time_leg;
        if (i === n_leg - 1) sailing_time_ballast = time_leg;
      }

      const fuel_voyage = (sailing_time_voyage / 24) * vessel.voyageTonPerDay;
      const fuel_ballast = (sailing_time_ballast / 24) * vessel.ballastTonPerDay;
      const fuel_berth_start = (params.loading_hour * (1 + impact_berth_start) / 24) * vessel.berthTonPerDay;
      const fuel_berth_next = (params.loading_hour * route.length * (1 + impact_berth_next) / 24) * vessel.berthTonPerDay;
      const fuel_berth = fuel_berth_start + fuel_berth_next;
      const fuel_total = fuel_voyage + fuel_ballast + fuel_berth;

      const lng_fuel = fuel_total * (SCF_LNG / SCF_MGO);
      const lng_fuel_cost = voyages_year * lng_fuel * params.harga_lng;

      // Port cost with risk (P1_BOP on II.2 start, II.5 next)
      const impact_port_start = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.2');
      const impact_port_next  = getRiskImpact(riskDB, 'P1_Biaya_Operasi', 'II.5');

      const port_ltp = vessel.portCostLTP * inflationFactor;
      const port_delay = vessel.portCostDelay * inflationFactor;

      const port_start_per_voyage = port_ltp * (1 + impact_port_start) + port_delay;
      const port_next_per_voyage = route.length * (port_ltp * (1 + impact_port_next) + port_delay);
      const port_cost = voyages_year * (port_start_per_voyage + port_next_per_voyage);

      const rent_cost = vessel.rentPerDayUSD * 365;
      const total_opex = lng_fuel_cost + port_cost + rent_cost + opex_oru;

      const penyaluran_year = Object.values(demandBBTUD).reduce((a, b) => a + b, 0) * 365 * 1000;
      const opex_usd_mmbtu = total_opex / penyaluran_year;
      const total_cost = capex_usd_mmbtu + opex_usd_mmbtu;
      const total_cost_rd3 = Math.round(total_cost * 1000) / 1000;

      results.push({
        'Nama Kapal': vessel.name,
        'Rute': fullRoute.join(' - '),
        'Total Jarak (NM)': totalDistance,
        'RTD (day)': RTD,
        'Demand LNG/day (m3)': demand_m3_day,
        'buffer_day': buffer_day,
        'Nominal Capacity (m3)': nominal_capacity,
        'Kapasitas Kapal (m3)': kapasitas_kapal,
        'Speed (knot)': speed,
        'days_stock': days_stock,                         // NEW
        'voyages_year': voyages_year,                     // NEW
        'Utilitasi_Factor_LNGC': Utilitasi_Factor_LNGC,   // NEW
        'Batas_Maksimum_Utilisasi_LNGC': Batas_Maksimum_Utilisasi_LNGC, // NEW
        'selected_storage Total': selected_storage_total, // NEW
        'fuel_voyage': fuel_voyage,                       // NEW
        'fuel_ballast': fuel_ballast,                     // NEW
        'fuel_berth': fuel_berth,                         // NEW
        'lng_fuel_cost': lng_fuel_cost,                   // NEW
        'port_cost': port_cost,                           // NEW
        'rent_cost': rent_cost,                           // NEW
        'Total CAPEX (USD)': Math.round(total_capex),
        'Total CAPEX USD/MMBTU': capex_usd_mmbtu,
        'Total OPEX (USD/year)': Math.round(total_opex * 10) / 10,
        'Total OPEX USD/MMBTU': opex_usd_mmbtu,
        'Total Cost USD/MMBTU': total_cost,
        'Total Cost USD/MMBTU (Round 3)': total_cost_rd3, // NEW
      });
    }
  }

  results.sort((a, b) => a['Total Cost USD/MMBTU'] - b['Total Cost USD/MMBTU']);
  return results;
}

// Twin vessel probability model
async function runTwoVesselProbabilityModel(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor,
    ratios = ['50:50','60:40','70:30','80:20','90:10'],
    enforceSameVessel = true,
    vesselNames, // optional: ['VesselName1','VesselName2']
    shareTerminalORU = true,
    geoMap, // NEW
  } = input;

  const ratioMap = {
    '50:50': [0.5, 0.5], '60:40': [0.6, 0.4], '70:30': [0.7, 0.3],
    '80:20': [0.8, 0.2], '90:10': [0.9, 0.1],
  };

  const total = [];
  for (const label of ratios) {
    const r = ratioMap[label];
    if (!r) continue;

    const n = selectedLocations.length;
    const n1 = Math.ceil(n * r[0]);
    const seen = new Set();

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
        params, inflationFactor, shareTerminalORU,
        geoMap, // NEW
      });
      const df2 = await runSupplyChainModel({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k2, demandBBTUD: demand_k2,
        params, inflationFactor, shareTerminalORU,
        geoMap, // NEW
      });

      if (!df1.length || !df2.length) continue;

      for (const k1 of df1) {
        for (const k2 of df2) {
          if (Array.isArray(vesselNames) && vesselNames.length === 2) {
            if (k1['Nama Kapal'] !== vesselNames[0] || k2['Nama Kapal'] !== vesselNames[1]) continue;
          } else if (enforceSameVessel) {
            if (k1['Nama Kapal'] !== k2['Nama Kapal'] || k1['Kapasitas Kapal (m3)'] !== k2['Kapasitas Kapal (m3)']) continue;
          }
          total.push({
            'Probability': label,
            'split_id': total.length,
            'Nama Kapal': k1['Nama Kapal'],
            'Kapasitas Kapal (m3)': k1['Kapasitas Kapal (m3)'],
            'Rute Kapal 1': k1['Rute'],
            'CAPEX Kapal 1': k1['Total CAPEX (USD)'],
            'OPEX Kapal 1': k1['Total OPEX (USD/year)'],
            'Cost Kapal 1': k1['Total Cost USD/MMBTU'],
            'Rute Kapal 2': k2['Rute'],
            'CAPEX Kapal 2': k2['Total CAPEX (USD)'],
            'OPEX Kapal 2': k2['Total OPEX (USD/year)'],
            'Cost Kapal 2': k2['Total Cost USD/MMBTU'],
            'Total CAPEX (USD)': k1['Total CAPEX (USD)'] + k2['Total CAPEX (USD)'],
            'Total OPEX (USD/year)': k1['Total OPEX (USD/year)'] + k2['Total OPEX (USD/year)'],
            'Total Cost USD/MMBTU': k1['Total Cost USD/MMBTU'] + k2['Total Cost USD/MMBTU'],
            'Lokasi Kapal 1': loc_k1.join(', '),
            'Lokasi Kapal 2': loc_k2.join(', '),
          });
        }
      }
    }
  }

  total.sort((a, b) => a['Total Cost USD/MMBTU'] - b['Total Cost USD/MMBTU']);

  const kapal_1 = total.map(t => ({
    'Probability': t['Probability'],
    'split_id': t['split_id'],
    'Nama Kapal': t['Nama Kapal'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Rute': t['Rute Kapal 1'],
    'Total CAPEX (USD)': t['CAPEX Kapal 1'],
    'Total OPEX (USD/year)': t['OPEX Kapal 1'],
    'Total Cost USD/MMBTU': t['Cost Kapal 1'],
    'Lokasi Kapal 1': t['Lokasi Kapal 1'],
  }));

  const kapal_2 = total.map(t => ({
    'Probability': t['Probability'],
    'split_id': t['split_id'],
    'Nama Kapal': t['Nama Kapal'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Rute': t['Rute Kapal 2'],
    'Total CAPEX (USD)': t['CAPEX Kapal 2'],
    'Total OPEX (USD/year)': t['OPEX Kapal 2'],
    'Total Cost USD/MMBTU': t['Cost Kapal 2'],
    'Lokasi Kapal 2': t['Lokasi Kapal 2'],
  }));

  return { kapal_1, kapal_2, total };
}

// Twin vessel probability model (RISK)
async function runTwoVesselProbabilityModelRisk(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor, riskDB,
    ratios = ['50:50','60:40','70:30','80:20','90:10'],
    enforceSameVessel = true,
    vesselNames, // optional: ['VesselName1','VesselName2']
    geoMap, // NEW
  } = input;

  const ratioMap = {
    '50:50': [0.5, 0.5], '60:40': [0.6, 0.4], '70:30': [0.7, 0.3],
    '80:20': [0.8, 0.2], '90:10': [0.9, 0.1],
  };

  const total = [];
  for (const label of ratios) {
    const r = ratioMap[label];
    if (!r) continue;

    const n = selectedLocations.length;
    const n1 = Math.ceil(n * r[0]);
    const seen = new Set();

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
        params, inflationFactor, riskDB,
        geoMap, // NEW
      });
      const df2 = await runSupplyChainModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k2, demandBBTUD: demand_k2,
        params, inflationFactor, riskDB,
        geoMap, // NEW
      });

      if (!df1.length || !df2.length) continue;

      for (const k1 of df1) {
        for (const k2 of df2) {
          if (Array.isArray(vesselNames) && vesselNames.length === 2) {
            if (k1['Nama Kapal'] !== vesselNames[0] || k2['Nama Kapal'] !== vesselNames[1]) continue;
          } else if (enforceSameVessel) {
            if (k1['Nama Kapal'] !== k2['Nama Kapal'] || k1['Kapasitas Kapal (m3)'] !== k2['Kapasitas Kapal (m3)']) continue;
          }
          total.push({
            'Probability': label,
            'split_id': total.length,
            'Nama Kapal': k1['Nama Kapal'],
            'Kapasitas Kapal (m3)': k1['Kapasitas Kapal (m3)'],
            'Rute Kapal 1': k1['Rute'],
            'CAPEX Kapal 1': k1['Total CAPEX (USD)'],
            'OPEX Kapal 1': k1['Total OPEX (USD/year)'],
            'Cost Kapal 1': k1['Total Cost USD/MMBTU'],
            'Rute Kapal 2': k2['Rute'],
            'CAPEX Kapal 2': k2['Total CAPEX (USD)'],
            'OPEX Kapal 2': k2['Total OPEX (USD/year)'],
            'Cost Kapal 2': k2['Total Cost USD/MMBTU'],
            'Total CAPEX (USD)': k1['Total CAPEX (USD)'] + k2['Total CAPEX (USD)'],
            'Total OPEX (USD/year)': k1['Total OPEX (USD/year)'] + k2['Total OPEX (USD/year)'],
            'Total Cost USD/MMBTU': k1['Total Cost USD/MMBTU'] + k2['Total Cost USD/MMBTU'],
            'Lokasi Kapal 1': loc_k1.join(', '),
            'Lokasi Kapal 2': loc_k2.join(', '),
          });
        }
      }
    }
  }

  total.sort((a, b) => a['Total Cost USD/MMBTU'] - b['Total Cost USD/MMBTU']);

  const kapal_1 = total.map(t => ({
    'Probability': t['Probability'],
    'split_id': t['split_id'],
    'Nama Kapal': t['Nama Kapal'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Rute': t['Rute Kapal 1'],
    'Total CAPEX (USD)': t['CAPEX Kapal 1'],
    'Total OPEX (USD/year)': t['OPEX Kapal 1'],
    'Total Cost USD/MMBTU': t['Cost Kapal 1'],
    'Lokasi Kapal 1': t['Lokasi Kapal 1'],
  }));

  const kapal_2 = total.map(t => ({
    'Probability': t['Probability'],
    'split_id': t['split_id'],
    'Nama Kapal': t['Nama Kapal'],
    'Kapasitas Kapal (m3)': t['Kapasitas Kapal (m3)'],
    'Rute': t['Rute Kapal 2'],
    'Total CAPEX (USD)': t['CAPEX Kapal 2'],
    'Total OPEX (USD/year)': t['OPEX Kapal 2'],
    'Total Cost USD/MMBTU': t['Cost Kapal 2'],
    'Lokasi Kapal 2': t['Lokasi Kapal 2'],
  }));

  return { kapal_1, kapal_2, total };
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

      const tankCapexHub = (sel_st / 500.0) * 1030000 * inflationFactor;
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
        'Demand LNG/day (m3)': dem_m3,
        'Nominal Capacity (m3)': nom_cap,
        'Kapasitas Kapal (m3)': k.capacityM3,
        'Speed (knot)': speed,
        'buffer_day': buf,
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

        const lt =
          params.loading_hour * (1 + impact_lt_II2) +
          ruteLocs.length * params.loading_hour * (1 + impact_lt_II5);
        const st = (tdist / speed) * (1 + im_s);
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
            (((demL * 1000.0) / LNG_EC) * rtd +
              buf * (demL * 1000.0) / LNG_EC) *
              params.gross_storage_pct,
            500
          );
          sel_tot += s_st;
          const tankCapex = (s_st / 500.0) * 1030000 * inflationFactor;
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
          'buffer_day': buf,
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

    const partitions = generatePartitions(spk_all, numV);
    for (const partition of partitions) {
      const feederTables = [];
      let ok = true;
      for (const subset of partition) {
        const r = calcFeederRoutes(subset, hub);
        if (!r.length) {
          ok = false;
          break;
        }
        const sorted = r
          .slice()
          .sort((a, b) => a['Total Cost (USD/MMBTU)'] - b['Total Cost (USD/MMBTU)']);
        feederTables.push(numV === 1 ? sorted : sorted.slice(0, 50));
      }
      if (!ok || feederTables.length !== numV) continue;

      // Cross-join feeders (untuk numV=2 ini jadi F1 x F2)
      const feederCombos = [];
      for (const f1 of feederTables[0]) {
        for (const f2 of (feederTables[1] || [])) {
          feederCombos.push([f1, f2]);
        }
      }

      for (const rm of motherRows) {
        for (const fPair of feederCombos) {
          const [f1, f2] = fPair;
          it_c += 1;

          const c_usd =
            rm['Total CAPEX (USD)'] +
            f1['Total CAPEX (USD)'] +
            (f2 ? f2['Total CAPEX (USD)'] : 0);
          const o_usd_year =
            rm['Total OPEX (USD/year)'] +
            f1['Total OPEX (USD/year)'] +
            (f2 ? f2['Total OPEX (USD/year)'] : 0);

          const sys_cost =
            (c_usd + o_usd_year * Pyears) /
            (totCluster * 1000.0 * 365.0 * Pyears);

          const row = {
            'No. Skenario': it_c,
            'Skenario Hub': hub,
            'Probability': numV > 1 ? 'Split' : 'Full',
            'System CAPEX (USD)': c_usd,
            'System OPEX (USD/year)': o_usd_year,
            'System Cost (USD/MMBTU)': sys_cost,
          };

          // Flatten Mother (prefix M_)
          for (const [k, v] of Object.entries(rm)) {
            row[`M_${k}`] = v;
          }
          // Flatten Feeder 1 (prefix F1_)
          for (const [k, v] of Object.entries(f1)) {
            row[`F1_${k}`] = v;
          }
          // Flatten Feeder 2 (prefix F2_) jika ada
          if (f2) {
            for (const [k, v] of Object.entries(f2)) {
              row[`F2_${k}`] = v;
            }
          } else {
            row['F2_Nama Kapal'] = null;
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
    const out = { 'Skenario Hub': r['Skenario Hub'] };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('M_')) {
        out[k.substring(2)] = v; // buang prefix "M_"
      }
    }
    return out;
  });

  // Feeder 1 table
  const feeder1 = sortedAll.map(r => {
    const out = { 'Skenario Hub': r['Skenario Hub'] };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('F1_')) {
        out[k.substring(3)] = v; // buang prefix "F1_"
      }
    }
    return out;
  });

  // Feeder 2 table
  const feeder2 = sortedAll.map(r => {
    const out = { 'Skenario Hub': r['Skenario Hub'] };
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('F2_')) {
        out[k.substring(3)] = v; // buang prefix "F2_"
      }
    }
    return out;
  });

  // System gabungan (ringkas)
  const system = sortedAll.map(r => ({
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

// NEW: Hub & Spoke 1-vessel NO-RISK engine (proxy ke Milk & Run)
// --------------------------------------------------------

/**
 * Hub & Spoke, 1 kapal, NO-RISK
 * Untuk sementara: gunakan engine single-vessel Milk & Run yang sama.
 */
async function runHubSpokeSingleModel(input) {
  // TODO: ganti dengan implementasi Hub & Spoke 1 kapal NO-RISK (mother + feeder)
  return runSupplyChainModel(input);
}

/**
 * Hub & Spoke, 1 kapal, RISK
 * Untuk sementara: gunakan engine single-vessel Milk & Run (risk) yang sama.
 */
async function runHubSpokeSingleModelRisk(input) {
  // TODO: ganti dengan implementasi Hub & Spoke 1 kapal RISK (pakai riskDB)
  return runSupplyChainModelRisk(input);
}

/**
 * Hub & Spoke, 2 kapal, NO-RISK
 * Untuk sementara: gunakan twin-vessel Milk & Run yang sama.
 */
async function runHubSpokeTwoVesselModel(input) {
  // TODO: ganti dengan implementasi Hub & Spoke 2 kapal NO-RISK (mother + feeder)
  return runTwoVesselProbabilityModel(input);
}

/**
 * Hub & Spoke, 2 kapal, RISK
 * Untuk sementara: gunakan twin-vessel Milk & Run (risk) yang sama.
 */
async function runHubSpokeTwoVesselModelRisk(input) {
  // TODO: ganti dengan implementasi Hub & Spoke 2 kapal RISK (pakai riskDB)
  return runTwoVesselProbabilityModelRisk(input);
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
};
