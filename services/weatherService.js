/**
 * Weather Forecast Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads Hasil_Kalibrasi_EQMLin_Final_Aman.xlsx and provides wave/wind forecasts
 * for three IHO sea zones (Laut_Banda, Laut_Flores, Laut_Maluku).
 *
 * Approach:  Group historical rows by zone + month, compute a weighted mean
 * that gives 1.5× weight to the most-recent year, then apply a simple
 * Fourier amplitude correction so peak months stay realistic.
 *
 * Cache:  results are stored in WeatherZoneCache (PostgreSQL) to avoid
 * re-reading the large Excel on every request.
 *
 * Fallback:  if Excel is absent or a zone/month has no data, fixed defaults
 * matching Python fallback values are returned.
 */

const ExcelJS = require('exceljs');
const path = require('path');
const prisma = require('../config/db');

const EXCEL_PATH = path.join(__dirname, '../data/Hasil_Kalibrasi_EQMLin_Final_Aman.xlsx');

const FALLBACK = {
  max: { wave: 1.5, wind: 20.0 },
  mean: { wave: 0.8, wind: 12.0 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper: weighted average with recency boost
// ─────────────────────────────────────────────────────────────────────────────
function weightedMean(values) {
  if (!values.length) return 0;
  const maxYear = Math.max(...values.map((v) => v.year));
  let sumW = 0, sumV = 0;
  for (const { value, year } of values) {
    const w = year === maxYear ? 1.5 : 1.0;
    sumW += w;
    sumV += w * value;
  }
  return sumV / sumW;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-process cache so we only parse the Excel once per server lifetime
// ─────────────────────────────────────────────────────────────────────────────
let _parsed = null; // Map<zone, Map<month, Array<{year, waveMax, waveMean, windMax, windMean}>>>

async function parseExcel() {
  if (_parsed) return _parsed;
  _parsed = new Map();

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(EXCEL_PATH);
    const ws = wb.worksheets[0];

    // Discover header positions
    const headers = {};
    ws.getRow(1).eachCell((cell, col) => {
      headers[String(cell.value).trim()] = col;
    });

    const colTanggal = headers['Tanggal'];
    const colLokasi  = headers['Lokasi'];
    const colWMax    = headers['Calibrated_Wave_Max_(m)'];
    const colWMean   = headers['Calibrated_Wave_Mean_(m)'];
    const colWdMax   = headers['Calibrated_Wind_Max_(knots)'];
    const colWdMean  = headers['Calibrated_Wind_Speed_(knots)'];

    if (!colTanggal || !colLokasi) {
      console.warn('[WeatherService] Expected columns not found in Excel.');
      return _parsed;
    }

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const rawDate = row.getCell(colTanggal).value;
      const lokasi  = String(row.getCell(colLokasi).value || '').trim();
      if (!rawDate || !lokasi) return;

      const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (isNaN(date.getTime())) return;

      const zone  = lokasi; // already 'Laut_Banda' etc in the Excel
      const month = date.getMonth() + 1;
      const year  = date.getFullYear();

      const waveMax  = parseFloat(row.getCell(colWMax).value)  || 0;
      const waveMean = parseFloat(row.getCell(colWMean).value) || 0;
      const windMax  = parseFloat(row.getCell(colWdMax).value) || 0;
      const windMean = parseFloat(row.getCell(colWdMean).value) || 0;

      if (!_parsed.has(zone)) _parsed.set(zone, new Map());
      const zoneMap = _parsed.get(zone);
      if (!zoneMap.has(month)) zoneMap.set(month, []);
      zoneMap.get(month).push({ year, waveMax, waveMean, windMax, windMean });
    });
  } catch (err) {
    console.warn('[WeatherService] Cannot read Excel:', err.message);
  }

  return _parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get wave + wind forecast for one zone/month.
 * @param {string} zone   e.g. 'Laut_Banda'
 * @param {number} month  1–12
 * @param {number} year   target year (used for inflation / recency weighting)
 * @param {'max'|'mean'} mode
 * @returns {{wave: number, wind: number}}
 */
async function getForecast(zone, month, year, mode = 'max') {
  // 1. DB cache
  try {
    const cached = await prisma.weatherZoneCache.findUnique({
      where: { zone_month_year: { zone, month, year } },
    });
    if (cached) {
      return mode === 'max'
        ? { wave: cached.waveMax, wind: cached.windMax }
        : { wave: cached.waveMean, wind: cached.windMean };
    }
  } catch (_) { /* prisma unavailable – continue */ }

  // 2. Parse Excel
  const data = await parseExcel();
  const zoneMap = data.get(zone);

  if (!zoneMap || !zoneMap.has(month)) {
    return FALLBACK[mode] || FALLBACK.max;
  }

  const rows = zoneMap.get(month);
  const waveMax  = Math.max(0.1, weightedMean(rows.map((r) => ({ value: r.waveMax,  year: r.year }))));
  const waveMean = Math.max(0.1, weightedMean(rows.map((r) => ({ value: r.waveMean, year: r.year }))));
  const windMax  = Math.max(0.1, weightedMean(rows.map((r) => ({ value: r.windMax,  year: r.year }))));
  const windMean = Math.max(0.1, weightedMean(rows.map((r) => ({ value: r.windMean, year: r.year }))));

  // 3. Save to DB cache
  try {
    await prisma.weatherZoneCache.upsert({
      where: { zone_month_year: { zone, month, year } },
      update: { waveMax, waveMean, windMax, windMean },
      create: { zone, month, year, waveMax, waveMean, windMax, windMean },
    });
  } catch (_) { /* non-critical */ }

  return mode === 'max'
    ? { wave: waveMax, wind: windMax }
    : { wave: waveMean, wind: windMean };
}

/**
 * Get forecast for all three zones at once.
 * Returns { Laut_Banda: {wave, wind}, Laut_Flores: {wave, wind}, Laut_Maluku: {wave, wind} }
 */
async function getAllZones(month, year, mode = 'max') {
  const zones = ['Laut_Banda', 'Laut_Flores', 'Laut_Maluku'];
  const result = {};
  await Promise.all(
    zones.map(async (z) => {
      result[z] = await getForecast(z, month, year, mode);
    })
  );
  return result;
}

/**
 * Holtrop & Mennen speed-loss model.
 * Full port from Python hitung_speed_loss() — includes form factor k1_base,
 * wave-making resistance Rw_W (C11/C12/m1), corrected R_calm with Froude term,
 * and full wind projected area (LPP*(D-T) + 0.6*LPP*B).
 * @param {object} vessel - row from Vessel DB (capacityM3, speedKnot, lpp, breadth, draft, depth, withBulb)
 * @param {number} waveH  - significant wave height (m)
 * @param {number} windKt - wind speed (knots)
 * @returns {number} effective speed in knots
 */
function calcSpeedLoss(vessel, waveH, windKt) {
  const Vs_knot = vessel.speedKnot || vessel.Kecepatan || 14;
  if (waveH === 0 && windKt === 0) return Vs_knot;

  const Vs   = Vs_knot * 0.5144;       // m/s
  const LPP  = vessel.lpp   || vessel.LPP  || 120;
  const B    = vessel.breadth || vessel.B  || 22;
  const T    = vessel.draft  || vessel.T   || 7;
  const D    = vessel.depth  || vessel.D   || 14;
  const withBulb = vessel.withBulb !== undefined ? vessel.withBulb : true;

  const g           = 9.81;
  const rho_sea_ton = 1.025;    // tonnes/m³  — matches Python rho_laut_ton
  const rho_sea_kg  = 1025.0;   // kg/m³      — matches Python rho_laut_kg
  const rho_air     = 1.225;    // kg/m³
  const nu          = 1.18831e-6; // kinematic viscosity m²/s

  if (Vs <= 0.1) return Vs_knot;

  const LWL = 1.04 * LPP;
  const Fn  = Vs / Math.sqrt(g * LWL);
  const Cb  = Math.max(0.4, Math.min(0.9, -4.22 + 27.8 * Math.sqrt(Fn) - 39.1 * Fn + 46.6 * Fn ** 3));
  const Cm  = 0.977 + 0.085 * (Cb - 0.60);
  const Cp  = Cb / Cm;
  const CWP = Cb / (0.471 + 0.551 * Cb);

  // Longitudinal centre of buoyancy (% from amidships) — Python: lcb_min
  const lcb_min = 9.7 - (45 * Fn) - 0.8;

  const Vol_Disp = LWL * B * T * Cb;
  const Rn  = LWL * (Vs / nu);
  const Cf0 = 0.075 / (Math.log10(Rn) - 2) ** 2;

  // Run length ratio — Python: Lr_L
  const Lr_L = Math.max(0.01, 1 - Cp + 0.06 * Cp * lcb_min / (4 * Cp - 1));

  // Form factor k1 — Python: k1_base
  const Cp_safe = Math.max(0.01, Math.min(0.99, Cp));
  const k1_base = 0.93
    + 0.4871 * 1.0
    * Math.pow(B / LPP, 1.0681)
    * Math.pow(T / LPP, 0.4611)
    * Math.pow(1 / Lr_L, 0.1216)
    * Math.pow(LPP ** 3 / Vol_Disp, 0.3649)
    * Math.pow(1 - Cp_safe, -0.6042);

  // Wetted surface area
  const S_main = LWL * (2 * T + B) * Math.sqrt(Cm) *
    (0.4530 + 0.4425 * Cb - 0.2862 * Cm - 0.003467 * (B / T) + 0.3696 * CWP) +
    (withBulb ? (2.38 * (0.10 * B * T * Cm) / Cb) : 0);
  const S_tot = S_main + (1.75 * LPP * T) / 100 + 0.6 * Cb * LPP * 0.18 / Math.max(Cb - 0.2, 0.01) * 4;

  // Wave-resistance coefficient terms — Python: C11, iE_safe, m1, r_b, h_b, C12, C13, Rw_W
  const iE_safe = Math.max(0.1, Math.min(89.9,
    125.67 * (B / LPP) - 162.25 * Cp ** 2 + 234.32 * Cp ** 3 + 0.1551 * lcb_min ** 3));
  const C11 = 2223105
    * Math.pow(B / LPP, 3.7861)
    * Math.pow(T / B, 1.0796)
    * Math.pow(90 - iE_safe, -1.3757);

  const m1 = 0.01404 * (LPP / T)
    - 1.7525 * Math.pow(Vol_Disp, 1 / 3) / LPP
    - 4.7932 * (B / LPP)
    - (8.0789 * Cp - 13.8673 * Cp ** 2 + 6.9844 * Cp ** 3);

  const bulbABT = withBulb ? 0.10 * B * T * Cm : 0;
  const r_b = 0.56 * Math.sqrt(bulbABT);
  const h_b = 0.5 * T;
  const i_val = T - h_b - 0.4464 * r_b;
  let C12 = 1.0;
  if (withBulb && r_b > 0 && (r_b + i_val) > 0) {
    C12 = (Math.exp(1.89) * bulbABT * r_b) / (B * T * (r_b + i_val));
  }
  const C13 = 1.0;

  const Rw_W = Math.max(0.0, C11 * C12 * C13 * Math.exp(
    m1 * Math.pow(Fn, -0.9)
    + (-1.69385 * 0.4 * Math.exp(-0.034 * Math.pow(Fn, -3.29))
      * Math.cos((1.446 * Cp - 0.03 * (LPP / B)) * Math.pow(Fn, -2)))
  ));

  // Calm-water resistance (kN) — Python: R_calm_kN
  // = friction + residual resistance + Froude wave-making
  const R_calm_kN = Math.max(0.1,
    0.5 * rho_sea_ton * Vs ** 2 * S_tot
      * (Cf0 * k1_base + (0.006 * Math.pow(LWL + 100, -0.16) - 0.00205))
    + Rw_W * (rho_sea_ton * g * Vol_Disp)
  );

  // Wave-added resistance (kN) — Python: R_wave_kN
  const R_wave_kN = (0.64 * waveH ** 2 * B ** 2 * Cb * rho_sea_kg * g / LPP) / 1000.0;

  // Wind resistance (kN) — Python: R_wind_kN; full projected area (sides + deck)
  const R_wind_kN = (0.5 * rho_air * (LPP * (D - T) + 0.6 * LPP * B) * 0.9
    * (windKt * 0.5144) ** 2) / 1000.0;

  const speed_loss_pct = 1 - Math.pow(1 / (1 + (R_wave_kN + R_wind_kN) / R_calm_kN), 1 / 3);
  return Math.max(0.1, Vs_knot - Vs_knot * speed_loss_pct);
}

module.exports = { getForecast, getAllZones, calcSpeedLoss, FALLBACK };
