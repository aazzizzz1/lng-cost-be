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

// NEW: no-risk single-vessel engine (restored)
async function runSupplyChainModel(input) {
  const {
    vessels, routes, oru,
    terminal, selectedLocations, demandBBTUD,
    params, inflationFactor,
    shareTerminalORU = false,
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

      for (let i = 0; i < fullRoute.length - 1; i++) {
        const legKey = `${fullRoute[i]} - ${fullRoute[i + 1]}`;
        const dist = distanceMap.get(legKey);
        if (!dist) { totalDistance = null; break; }
        totalDistance += dist;
        sailingTime += dist / speed;
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

      // CAPEX (no-risk)
      let total_capex = 0;
      for (const loc of route) {
        const gs_net = ((demandBBTUD[loc] / 24.04) * 1000) * RTD;
        const gs_buffer = gs_net + (buffer_day * (demandBBTUD[loc] / 24.04) * 1000);
        const net_storage = gs_buffer * params.gross_storage_pct;
        const selected_storage = roundUp(net_storage, 500);

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
      const n_leg = fullRoute.length - 1;
      let sailing_time_voyage = 0;
      let sailing_time_ballast = 0;

      for (let i = 0; i < n_leg; i++) {
        const legKey = `${fullRoute[i]} - ${fullRoute[i + 1]}`;
        const dist = distanceMap.get(legKey);
        const time_leg = dist / speed;
        sailing_time_voyage += time_leg;
        if (i === n_leg - 1) sailing_time_ballast = time_leg;
      }

      const fuel_voyage = (sailing_time_voyage / 24) * vessel.voyageTonPerDay;
      const fuel_ballast = (sailing_time_ballast / 24) * vessel.ballastTonPerDay;
      const total_berth_call = route.length + 1;
      const fuel_berth = (params.loading_hour * total_berth_call / 24) * vessel.berthTonPerDay;

      const fuel_total = fuel_voyage + fuel_ballast + fuel_berth;
      const days_stock = working_volume_lngc / demand_m3_day;
      const voyages_year = 365 / days_stock;

      const lng_fuel = fuel_total * (SCF_LNG / SCF_MGO);
      const lng_fuel_cost = voyages_year * lng_fuel * params.harga_lng;

      const port_cost = voyages_year * vessel.portCostPerLocation * total_berth_call;
      const rent_cost = vessel.rentPerDayUSD * 365;
      const opex_oru = total_capex * 0.05;

      const total_opex = lng_fuel_cost + port_cost + rent_cost + opex_oru;
      const penyaluran_year = Object.values(demandBBTUD).reduce((a, b) => a + b, 0) * 365 * 1000;
      const opex_usd_mmbtu = total_opex / penyaluran_year;

      results.push({
        'Nama Kapal': vessel.name,
        'Rute': fullRoute.join(' - '),
        'Total Jarak (NM)': totalDistance,
        'RTD (day)': RTD,
        'Demand LNG/day (m3)': demand_m3_day,
        'Nominal Capacity (m3)': nominal_capacity,
        'fuel_ballast': fuel_ballast,
        'Kapasitas Kapal (m3)': kapasitas_kapal,
        'Speed (knot)': speed,
        'buffer_day': buffer_day,
        'Total CAPEX (USD)': total_capex,
        'Total CAPEX USD/MMBTU': capex_usd_mmbtu,
        'Total OPEX (USD/year)': Math.round(total_opex * 10) / 10,
        'Total OPEX USD/MMBTU': opex_usd_mmbtu,
        'Total Cost USD/MMBTU': capex_usd_mmbtu + opex_usd_mmbtu,
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

// --- RISK-AWARE SINGLE VESSEL ENGINE (NEW) ---
async function runSupplyChainModelRisk(input) {
  const {
    vessels, routes, oru, terminal, selectedLocations, demandBBTUD,
    params, inflationFactor, riskDB,
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

      for (let i = 0; i < fullRoute.length - 1; i++) {
        const legKey = `${fullRoute[i]} - ${fullRoute[i + 1]}`;
        const dist = distanceMap.get(legKey);
        if (!dist) { totalDistance = null; break; }
        totalDistance += dist;
        sailingTime += dist / speed;
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

      // CAPEX with risk (P3)
      const risk_capex_6 = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.6');
      const risk_capex_7 = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.7');
      const risk_capex_8 = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.8');
      const impact_capex_start = (risk_capex_6 + risk_capex_7 + risk_capex_8) / 3 || 0;
      const impact_capex_end = getRiskImpact(riskDB, 'P3_Biaya_Investasi', 'II.1') || 0;

      let total_capex = 0.0;
      const capex_loc_map = new Map();

      for (const loc of route) {
        const gs_net = ((demandBBTUD[loc] / 24.04) * 1000) * RTD;
        const gs_buffer = gs_net + (buffer_day * (demandBBTUD[loc] / 24.04) * 1000);
        const net_storage = gs_buffer * params.gross_storage_pct;
        const selected_storage = roundUp(net_storage, 500);

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

      // Fuel OPEX with risk on times
      const impact_sailing = getRiskImpact(riskDB, 'P2_Durasi', 'II.3');
      const impact_berth_start = getRiskImpact(riskDB, 'P2_Durasi', 'II.2');
      const impact_berth_next = getRiskImpact(riskDB, 'P2_Durasi', 'II.5');

      let sailing_time_voyage = 0.0;
      let sailing_time_ballast = 0.0;
      const n_leg = fullRoute.length - 1;

      for (let i = 0; i < n_leg; i++) {
        const legKey = `${fullRoute[i]} - ${fullRoute[i + 1]}`;
        const dist = distanceMap.get(legKey);
        const base_time = dist / speed;
        const time_leg = base_time * (1 + impact_sailing);
        sailing_time_voyage += time_leg;
        if (i === n_leg - 1) sailing_time_ballast = time_leg;
      }

      const fuel_voyage = (sailing_time_voyage / 24) * vessel.voyageTonPerDay;
      const fuel_ballast = (sailing_time_ballast / 24) * vessel.ballastTonPerDay;
      const fuel_berth_start = (params.loading_hour * (1 + impact_berth_start) / 24) * vessel.berthTonPerDay;
      const fuel_berth_next = (params.loading_hour * route.length * (1 + impact_berth_next) / 24) * vessel.berthTonPerDay;
      const fuel_total = fuel_voyage + fuel_ballast + fuel_berth_start + fuel_berth_next;

      const days_stock = working_volume_lngc / demand_m3_day;
      const voyages_year = 365 / days_stock;

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
        'Total CAPEX (USD)': Math.round(total_capex),
        'Total CAPEX USD/MMBTU': capex_usd_mmbtu,
        'Total OPEX (USD/year)': Math.round(total_opex * 10) / 10,
        'Total OPEX USD/MMBTU': opex_usd_mmbtu,
        'Total Cost USD/MMBTU': capex_usd_mmbtu + opex_usd_mmbtu,
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
      });
      const df2 = await runSupplyChainModel({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k2, demandBBTUD: demand_k2,
        params, inflationFactor, shareTerminalORU,
      });

      if (!df1.length || !df2.length) continue;

      for (const k1 of df1) {
        for (const k2 of df2) {
          // filter options
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
      });
      const df2 = await runSupplyChainModelRisk({
        vessels, routes, oru, terminal,
        selectedLocations: loc_k2, demandBBTUD: demand_k2,
        params, inflationFactor, riskDB,
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

module.exports = {
  runSupplyChainModel,
  runTwoVesselProbabilityModel,
  buildRiskDB,
  runSupplyChainModelRisk,
  runTwoVesselProbabilityModelRisk,
};
