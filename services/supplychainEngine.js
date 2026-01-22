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

function buildDistanceMap(routes) {
  const m = new Map();
  for (const r of routes) {
    m.set(`${r.origin} - ${r.destination}`, r.nauticalMiles);
  }
  return m;
}

// inputs: { vessels, routes, oru, terminal, selectedLocations, demandBBTUD, params, inflationFactor }
async function runSupplyChainModel(input) {
  const {
    vessels, routes, oru,
    terminal, selectedLocations, demandBBTUD,
    params, inflationFactor,
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

      // Storage & CAPEX
      let total_capex = 0;
      let terminal_penerima = terminal;

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
        const terminal_oru = oruMap.get(terminal_penerima);
        if (terminal_oru) total_capex += terminal_oru;
      }

      const penyaluran_20th = Object.values(demandBBTUD).reduce((a, b) => a + b, 0) * 365 * 20 * 1000;
      const capex_usd_mmbtu = total_capex / penyaluran_20th;

      // OPEX – fuel, port, rent, ORU
      const n_leg = fullRoute.length - 1;
      let sailing_time_voyage = 0;
      let sailing_time_ballast = 0;

      for (let i = 0; i < n_leg; i++) {
        const legKey = `${fullRoute[i]} - ${fullRoute[i + 1]}`;
        const dist = distanceMap.get(legKey);
        const time_leg = dist / speed; // hours
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

module.exports = { runSupplyChainModel };
