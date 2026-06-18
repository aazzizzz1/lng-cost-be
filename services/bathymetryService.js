/**
 * Bathymetry Service
 * ─────────────────────────────────────────────────────────────────────────────
 * REVISI FINAL: PURE DATA LOADER (I/O OPTIMIZED)
 * File ini sekarang hanya bertugas membaca file BATNAS (TIF) & GEBCO (NetCDF).
 * Seluruh logika matematika (Koridor, Berth, KDTree) sudah dipindah ke 
 * spatialRouteService.js agar 100% identik dengan algoritma Python (Colab).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const GeoTIFF = require('geotiff');
const { NetCDFReader: NetCDF } = require('netcdfjs');

const DATA_DIR      = path.join(__dirname, '../data');
const BATNAS_PATH   = path.join(DATA_DIR, 'BATNAS_MASTER_SUPER_MURNI_.tif');
const GEBCO_ZIP_GLOB = /GEBCO.*\.zip$/i;
const GEBCO_EXTRACT = path.join(os.tmpdir(), 'gebco_lng');

// ─────────────────────────────────────────────────────────────────────────────
// BATNAS TIF window reader
// ─────────────────────────────────────────────────────────────────────────────
let _batnasTiff = null;
let _batnasMeta = null;

async function _getBatnasTiff() {
  if (_batnasTiff) return { tiff: _batnasTiff, meta: _batnasMeta };
  if (!fs.existsSync(BATNAS_PATH)) return null;

  _batnasTiff = await GeoTIFF.fromFile(BATNAS_PATH);
  const img   = await _batnasTiff.getImage();
  const [west, south, east, north] = img.getBoundingBox();
  const w = img.getWidth();
  const h = img.getHeight();
  _batnasMeta = {
    west, south, east, north,
    lonStep: (east  - west)  / w,
    latStep: (north - south) / h,
    width: w, height: h,
  };
  return { tiff: _batnasTiff, meta: _batnasMeta };
}

async function getBatnas(minLat, maxLat, minLon, maxLon) {
  const res = await _getBatnasTiff();
  if (!res) return null;
  const { tiff, meta } = res;
  const img = await tiff.getImage();

  const left   = Math.max(0, Math.floor((minLon - meta.west)  / meta.lonStep));
  const right  = Math.min(meta.width,  Math.ceil((maxLon - meta.west)  / meta.lonStep));
  const top    = Math.max(0, Math.floor((meta.north - maxLat) / meta.latStep));
  const bottom = Math.min(meta.height, Math.ceil((meta.north - minLat) / meta.latStep));

  if (left >= right || top >= bottom) return null;

  const rasters = await img.readRasters({ window: [left, top, right, bottom] });
  const data    = rasters[0]; 
  const w       = right - left;
  const h       = bottom - top;

  return {
    data,
    width:    w,
    height:   h,
    latStart: meta.north - top    * meta.latStep, 
    latStep:  -meta.latStep,                         
    lonStart: meta.west  + left   * meta.lonStep,
    lonStep:  meta.lonStep,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GEBCO NetCDF reader
// ─────────────────────────────────────────────────────────────────────────────
const _HDF5_MAGIC  = Buffer.from([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]); 
const _NC3_CLASSIC = Buffer.from([0x43, 0x44, 0x46, 0x01]); 

let _gebcoDs       = null;
let _gebcoIsHDF5   = false;
let _gebcoCache    = null; 

async function _getGebco() {
  if (_gebcoCache) return _gebcoCache;   
  if (_gebcoDs) return _buildGebcoCache(_gebcoDs);

  const zipFile = fs.readdirSync(DATA_DIR).find((f) => GEBCO_ZIP_GLOB.test(f));
  if (!zipFile) return null;

  if (!fs.existsSync(GEBCO_EXTRACT)) {
    fs.mkdirSync(GEBCO_EXTRACT, { recursive: true });
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(path.join(DATA_DIR, zipFile));
    zip.extractAllTo(GEBCO_EXTRACT, true);
  }

  const ncFile = fs.readdirSync(GEBCO_EXTRACT).find((f) => f.endsWith('.nc'));
  if (!ncFile) return null;

  const ncPath = path.join(GEBCO_EXTRACT, ncFile);
  const fd     = fs.openSync(ncPath, 'r');
  const magic  = Buffer.alloc(8);
  fs.readSync(fd, magic, 0, 8, 0);
  fs.closeSync(fd);

  if (magic.slice(0, 8).equals(_HDF5_MAGIC)) {
    console.warn('[BathymetryService] Format HDF5 tidak didukung netcdfjs. Lewati.');
    _gebcoIsHDF5 = true;
    return null;
  }

  if (!magic.slice(0, 3).equals(_NC3_CLASSIC.slice(0, 3))) return null;

  const buf   = fs.readFileSync(ncPath);
  _gebcoDs    = new NetCDF(buf);
  return _buildGebcoCache(_gebcoDs);
}

function _buildGebcoCache(ds) {
  const latKey  = ds.getDataVariable('lat')       ? 'lat'       : 'latitude';
  const lonKey  = ds.getDataVariable('lon')       ? 'lon'       : 'longitude';
  const elevKey = ds.getDataVariable('elevation') ? 'elevation' : 'z';
  const rawLats = ds.getDataVariable(latKey);
  const rawLons = ds.getDataVariable(lonKey);
  const rawElev = ds.getDataVariable(elevKey);
  if (!rawLats || !rawLons || !rawElev) return null;

  const lats = new Float64Array(rawLats);
  const lons = new Float64Array(rawLons);
  const elev = new Float32Array(rawElev.length);
  for (let i = 0; i < rawElev.length; i++) elev[i] = rawElev[i];

  _gebcoCache = { lats, lons, elev, nLat: lats.length, nLon: lons.length };
  return _gebcoCache;
}

async function getGebco(minLat, maxLat, minLon, maxLon) {
  let cache;
  try { cache = await _getGebco(); } catch (_) { return null; }
  if (!cache) return null;

  const { lats, lons, elev, nLat, nLon } = cache;
  const latAscending = nLat < 2 || lats[1] >= lats[0];

  let latS, latE;
  if (latAscending) {
    latS = 0; while (latS < nLat - 1 && lats[latS] < minLat) latS++;
    latE = nLat - 1; while (latE > 0 && lats[latE] > maxLat) latE--;
  } else {
    latS = 0; while (latS < nLat - 1 && lats[latS] > maxLat) latS++;
    latE = nLat - 1; while (latE > 0 && lats[latE] < minLat) latE--;
  }

  let lonS = 0; while (lonS < nLon - 1 && lons[lonS] < minLon) lonS++;
  let lonE = nLon - 1; while (lonE > 0 && lons[lonE] > maxLon) lonE--;

  const w = lonE - lonS + 1;
  const h = latE - latS + 1;
  if (w <= 0 || h <= 0) return null;

  const data = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    const srcRow = (latS + r) * nLon + lonS;
    data.set(elev.subarray(srcRow, srcRow + w), r * w);
  }

  const latStep = h > 1 ? (lats[latE] - lats[latS]) / (h - 1) : 0;

  return {
    data,
    width:    w,
    height:   h,
    latStart: lats[latS],
    latStep,
    lonStart: lons[lonS],
    lonStep:  w > 1 ? (lons[lonE] - lons[lonS]) / (w - 1) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper for depth queries (Dipakai untuk profiling & interpolasi Jetty)
// ─────────────────────────────────────────────────────────────────────────────
function getElevation(win, lat, lon) {
  const r = Math.round((lat - win.latStart) / win.latStep);
  const c = Math.round((lon - win.lonStart) / win.lonStep);
  if (r < 0 || r >= win.height || c < 0 || c >= win.width) return NaN;
  const v = win.data[r * win.width + c];
  if (v > 8000 || v < -11000) return NaN; // Abaikan anomali/no-data
  return v;
}

module.exports = { getBatnas, getGebco, getElevation };