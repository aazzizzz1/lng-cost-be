/**
 * Weather Forecast Service
 * ─────────────────────────────────────────────────────────────────────────────
 * MENGGUNAKAN PRE-COMPUTED PROPHET JSON
 * Pendekatan ini menjamin angka yang keluar 100% identik dengan Python Colab
 * tanpa harus membebani server Node.js dengan kalkulasi Machine Learning berat.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../config/db');

// File ini di-generate dari Google Colab menggunakan script Prophet
const FORECAST_JSON_PATH = path.join(__dirname, '../data/forecast_prophet.json');

const FALLBACK = {
  max: { wave: 1.5, wind: 20.0 },
  mean: { wave: 0.8, wind: 12.0 },
};

let _forecastData = null;

/**
 * Muat file JSON hasil otak AI Prophet ke dalam memory (sangat cepat & ringan)
 */
function loadForecastData() {
  if (_forecastData) return _forecastData;
  try {
    if (fs.existsSync(FORECAST_JSON_PATH)) {
      const rawData = fs.readFileSync(FORECAST_JSON_PATH, 'utf-8');
      _forecastData = JSON.parse(rawData);
      console.log('[WeatherService] Berhasil memuat otak AI dari forecast_prophet.json');
    } else {
      console.warn('[WeatherService] File forecast_prophet.json tidak ditemukan! Menggunakan Fallback.');
      _forecastData = {};
    }
  } catch (err) {
    console.error('[WeatherService] Gagal membaca forecast_prophet.json:', err.message);
    _forecastData = {};
  }
  return _forecastData;
}

/**
 * Get wave + wind forecast for one zone/month.
 */
async function getForecast(zone, month, year, mode = 'max') {
  const data = loadForecastData();

  // Jika data tersedia di JSON untuk zona, tahun, dan bulan tersebut
  if (data[zone] && data[zone][year] && data[zone][year][month]) {
    const monthData = data[zone][year][month];
    
    const wave = mode === 'max' ? monthData.wave_max : monthData.wave_mean;
    const wind = mode === 'max' ? monthData.wind_max : monthData.wind_mean;
    
    // Simpan ke Cache DB (opsional, untuk konsistensi struktur lama)
    try {
      await prisma.weatherZoneCache.upsert({
        where: { zone_month_year: { zone, month, year } },
        update: { 
          waveMax: mode === 'max' ? wave : 0, 
          waveMean: mode === 'mean' ? wave : 0, 
          windMax: mode === 'max' ? wind : 0, 
          windMean: mode === 'mean' ? wind : 0 
        },
        create: { 
          zone, month, year, 
          waveMax: mode === 'max' ? wave : 0, 
          waveMean: mode === 'mean' ? wave : 0, 
          windMax: mode === 'max' ? wind : 0, 
          windMean: mode === 'mean' ? wind : 0 
        },
      });
    } catch (_) { /* abaikan error db */ }

    return { wave, wind };
  }

  // Jika tahun melebihi batas JSON (misal tahun > 2045), gunakan fallback statis
  return FALLBACK[mode] || FALLBACK.max;
}

/**
 * Get forecast for all three zones at once.
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
 * (SUDAH SAMA PERSIS DENGAN PYTHON COLAB)
 */
function calcSpeedLoss(vessel, waveH, windKt) {
  const Vs_knot = vessel.speedKnot || vessel.Kecepatan || 14;
  if (waveH === 0 && windKt === 0) return Vs_knot;

  const Vs   = Vs_knot * 0.5144;      
  const LPP  = vessel.lpp   || vessel.LPP  || 120;
  const B    = vessel.breadth || vessel.B  || 22;
  const T    = vessel.draft  || vessel.T   || 7;
  const D    = vessel.depth  || vessel.D   || 14;
  const withBulb = vessel.withBulb !== undefined ? vessel.withBulb : true;

  const g           = 9.81;
  const rho_sea_ton = 1.025;    
  const rho_sea_kg  = 1025.0;   
  const rho_air     = 1.225;    
  const nu          = 1.18831e-6; 

  if (Vs <= 0.1) return Vs_knot;

  const LWL = 1.04 * LPP;
  const Fn  = Vs / Math.sqrt(g * LWL);
  const Cb  = Math.max(0.4, Math.min(0.9, -4.22 + 27.8 * Math.sqrt(Fn) - 39.1 * Fn + 46.6 * Fn ** 3));
  const Cm  = 0.977 + 0.085 * (Cb - 0.60);
  const Cp  = Cb / Cm;
  const CWP = Cb / (0.471 + 0.551 * Cb);
  const lcb_min = 9.7 - (45 * Fn) - 0.8;
  const Vol_Disp = LWL * B * T * Cb;
  const Rn  = LWL * (Vs / nu);
  const Cf0 = 0.075 / (Math.log10(Rn) - 2) ** 2;
  const Lr_L = Math.max(0.01, 1 - Cp + 0.06 * Cp * lcb_min / (4 * Cp - 1));
  const Cp_safe = Math.max(0.01, Math.min(0.99, Cp));
  const k1_base = 0.93 + 0.4871 * 1.0 * Math.pow(B / LPP, 1.0681) * Math.pow(T / LPP, 0.4611) * Math.pow(1 / Lr_L, 0.1216) * Math.pow(LPP ** 3 / Vol_Disp, 0.3649) * Math.pow(1 - Cp_safe, -0.6042);
  const S_main = LWL * (2 * T + B) * Math.sqrt(Cm) * (0.4530 + 0.4425 * Cb - 0.2862 * Cm - 0.003467 * (B / T) + 0.3696 * CWP) + (withBulb ? (2.38 * (0.10 * B * T * Cm) / Cb) : 0);
  const S_tot = S_main + (1.75 * LPP * T) / 100 + 0.6 * Cb * LPP * 0.18 / Math.max(Cb - 0.2, 0.01) * 4;

  const iE_safe = Math.max(0.1, Math.min(89.9, 125.67 * (B / LPP) - 162.25 * Cp ** 2 + 234.32 * Cp ** 3 + 0.1551 * lcb_min ** 3));
  const C11 = 2223105 * Math.pow(B / LPP, 3.7861) * Math.pow(T / B, 1.0796) * Math.pow(90 - iE_safe, -1.3757);
  const m1 = 0.01404 * (LPP / T) - 1.7525 * Math.pow(Vol_Disp, 1 / 3) / LPP - 4.7932 * (B / LPP) - (8.0789 * Cp - 13.8673 * Cp ** 2 + 6.9844 * Cp ** 3);

  const bulbABT = withBulb ? 0.10 * B * T * Cm : 0;
  const r_b = 0.56 * Math.sqrt(bulbABT);
  const h_b = 0.5 * T;
  const i_val = T - h_b - 0.4464 * r_b;
  let C12 = 1.0;
  if (withBulb && r_b > 0 && (r_b + i_val) > 0) { C12 = (Math.exp(1.89) * bulbABT * r_b) / (B * T * (r_b + i_val)); }
  const C13 = 1.0;

  const Rw_W = Math.max(0.0, C11 * C12 * C13 * Math.exp(m1 * Math.pow(Fn, -0.9) + (-1.69385 * 0.4 * Math.exp(-0.034 * Math.pow(Fn, -3.29)) * Math.cos((1.446 * Cp - 0.03 * (LPP / B)) * Math.pow(Fn, -2)))));
  const R_calm_kN = Math.max(0.1, 0.5 * rho_sea_ton * Vs ** 2 * S_tot * (Cf0 * k1_base + (0.006 * Math.pow(LWL + 100, -0.16) - 0.00205)) + Rw_W * (rho_sea_ton * g * Vol_Disp));
  const R_wave_kN = (0.64 * waveH ** 2 * B ** 2 * Cb * rho_sea_kg * g / LPP) / 1000.0;
  const R_wind_kN = (0.5 * rho_air * (LPP * (D - T) + 0.6 * LPP * B) * 0.9 * (windKt * 0.5144) ** 2) / 1000.0;

  const speed_loss_pct = 1 - Math.pow(1 / (1 + (R_wave_kN + R_wind_kN) / R_calm_kN), 1 / 3);
  return Math.max(0.1, Vs_knot - Vs_knot * speed_loss_pct);
}

module.exports = { getForecast, getAllZones, calcSpeedLoss, FALLBACK };