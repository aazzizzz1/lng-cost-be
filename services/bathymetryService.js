/**
 * Bathymetry Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads depth data from either:
 *   BATNAS  – BATNAS_MASTER_SUPER_MURNI_.tif  (GeoTIFF, 2.4 GB)
 *   GEBCO   – GEBCO_01_Apr_2026_*.zip → extracted *.nc  (NetCDF)
 *
 * Both engines return a uniform BathyWindow object:
 *   { data: Float32Array, width, height, latStart, latStep, lonStart, lonStep }
 *
 * IMPORTANT: only a small bounding-box slice is loaded per call to keep
 * memory usage manageable.  For BATNAS the geotiff library supports
 * "window" reads; for GEBCO we read the whole file once and subset in JS
 * (regional extract is usually < 100 MB after decompression).
 */

const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');
const GeoTIFF = require('geotiff');
// netcdfjs v4 exports { NetCDFReader }
const { NetCDFReader: NetCDF } = require('netcdfjs');

// ─────────────────────────────────────────────────────────────────────────────
// Path constants
// ─────────────────────────────────────────────────────────────────────────────
const DATA_DIR      = path.join(__dirname, '../data');
const BATNAS_PATH   = path.join(DATA_DIR, 'BATNAS_MASTER_SUPER_MURNI_.tif');
const GEBCO_ZIP_GLOB = /GEBCO.*\.zip$/i;
const GEBCO_EXTRACT = path.join(os.tmpdir(), 'gebco_lng');

// ─────────────────────────────────────────────────────────────────────────────
// Utility: haversine fast-approx in NM (equirectangular projection)
// ─────────────────────────────────────────────────────────────────────────────
function fastNm(lat1, lon1, lat2, lon2) {
  const dLat = lat2 - lat1;
  const dLon = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLon * dLon) * 60;
}

// ─────────────────────────────────────────────────────────────────────────────
// BATNAS TIF window reader
// Returns { data: Int16Array, width, height, latStart, latStep, lonStart, lonStep }
// Convention: negative elevation = below sea level (bathymetry)
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
    latStep: (north - south) / h, // positive – y↑
    width: w, height: h,
  };
  return { tiff: _batnasTiff, meta: _batnasMeta };
}

async function getBatnas(minLat, maxLat, minLon, maxLon) {
  const res = await _getBatnasTiff();
  if (!res) return null;
  const { tiff, meta } = res;
  const img = await tiff.getImage();

  // Convert geo bbox → pixel window [left, top, right, bottom] (top-left origin)
  const left   = Math.max(0, Math.floor((minLon - meta.west)  / meta.lonStep));
  const right  = Math.min(meta.width,  Math.ceil((maxLon - meta.west)  / meta.lonStep));
  const top    = Math.max(0, Math.floor((meta.north - maxLat) / meta.latStep));
  const bottom = Math.min(meta.height, Math.ceil((meta.north - minLat) / meta.latStep));

  if (left >= right || top >= bottom) return null;

  const rasters = await img.readRasters({ window: [left, top, right, bottom] });
  const data    = rasters[0]; // Int16Array or Float32Array depending on TIF
  const w       = right - left;
  const h       = bottom - top;

  return {
    data,
    width:    w,
    height:   h,
    latStart: meta.north - top    * meta.latStep,   // lat of first row
    latStep:  -meta.latStep,                         // rows go south
    lonStart: meta.west  + left   * meta.lonStep,
    lonStep:  meta.lonStep,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GEBCO NetCDF reader
// ─────────────────────────────────────────────────────────────────────────────
// Magic-byte signatures for NetCDF format detection
const _HDF5_MAGIC  = Buffer.from([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]); // \x89HDF\r\n\x1a\n
const _NC3_CLASSIC = Buffer.from([0x43, 0x44, 0x46, 0x01]); // CDF\x01

let _gebcoDs       = null;
let _gebcoIsHDF5   = false;
// Full-dataset cache: extracted once from NetCDF, reused for all bbox queries.
// For a 4800×4320 regional file this is ~83 MB Float32 – acceptable.
let _gebcoCache    = null; // { lats, lons, elev: Float32Array, nLon }

async function _getGebco() {
  if (_gebcoCache) return _gebcoCache;   // already decoded – instant return
  if (_gebcoDs) {                        // ds parsed but not yet decoded
    return _buildGebcoCache(_gebcoDs);
  }

  // Find the zip file
  const zipFile = fs.readdirSync(DATA_DIR).find((f) => GEBCO_ZIP_GLOB.test(f));
  if (!zipFile) return null;

  // Extract if needed
  if (!fs.existsSync(GEBCO_EXTRACT)) {
    fs.mkdirSync(GEBCO_EXTRACT, { recursive: true });
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(path.join(DATA_DIR, zipFile));
    zip.extractAllTo(GEBCO_EXTRACT, true);
  }

  // Find .nc file
  const ncFile = fs.readdirSync(GEBCO_EXTRACT).find((f) => f.endsWith('.nc'));
  if (!ncFile) return null;

  const ncPath = path.join(GEBCO_EXTRACT, ncFile);

  // Check format via magic bytes (read only first 8 bytes)
  const fd     = fs.openSync(ncPath, 'r');
  const magic  = Buffer.alloc(8);
  fs.readSync(fd, magic, 0, 8, 0);
  fs.closeSync(fd);

  if (magic.slice(0, 8).equals(_HDF5_MAGIC)) {
    // NetCDF4 / HDF5 – netcdfjs cannot read this format.
    // Log once and skip gracefully; routes will fall back to sea-lanes.
    console.warn(
      '[BathymetryService] GEBCO file is NetCDF4/HDF5 format which netcdfjs cannot read. ' +
      'To enable GEBCO routing, convert the file to NetCDF3 Classic: ' +
      '  ncks -3 input.nc output_nc3.nc   (requires NCO tools), or ' +
      '  gdal_translate -of netCDF input.nc output_nc3.nc  (requires GDAL). ' +
      'Place the converted file in the same zip, or replace the zip.'
    );
    _gebcoIsHDF5 = true;
    return null;
  }

  if (!magic.slice(0, 3).equals(_NC3_CLASSIC.slice(0, 3))) {
    console.warn('[BathymetryService] GEBCO file has unknown format, skipping.');
    return null;
  }

  const buf   = fs.readFileSync(ncPath);
  _gebcoDs    = new NetCDF(buf);
  return _buildGebcoCache(_gebcoDs);
}

// Pre-decode the full NetCDF elevation array into a flat Float32Array cache.
// This one-time ~5s cost makes all subsequent window queries O(W×H) pure JS.
function _buildGebcoCache(ds) {
  const latKey  = ds.getDataVariable('lat')       ? 'lat'       : 'latitude';
  const lonKey  = ds.getDataVariable('lon')       ? 'lon'       : 'longitude';
  const elevKey = ds.getDataVariable('elevation') ? 'elevation' : 'z';
  const rawLats = ds.getDataVariable(latKey);
  const rawLons = ds.getDataVariable(lonKey);
  const rawElev = ds.getDataVariable(elevKey);
  if (!rawLats || !rawLons || !rawElev) return null;

  // Convert to typed arrays for fast indexing
  const lats = new Float64Array(rawLats);
  const lons = new Float64Array(rawLons);
  // raw elevation may be Int16Array or regular array; copy to Float32
  const elev = new Float32Array(rawElev.length);
  for (let i = 0; i < rawElev.length; i++) elev[i] = rawElev[i];

  _gebcoCache = { lats, lons, elev, nLat: lats.length, nLon: lons.length };
  console.log(`[BathymetryService] GEBCO decoded: ${lons.length}×${lats.length} grid (~${((elev.buffer.byteLength)/(1024*1024)).toFixed(0)} MB)`);
  return _gebcoCache;
}

async function getGebco(minLat, maxLat, minLon, maxLon) {
  let cache;
  try { cache = await _getGebco(); } catch (_) { return null; }
  if (!cache) return null;

  const { lats, lons, elev, nLat, nLon } = cache;

  // Determine lat sort order
  const latAscending = nLat < 2 || lats[1] >= lats[0];

  // Find lat index bounds
  let latS, latE;
  if (latAscending) {
    latS = 0; while (latS < nLat - 1 && lats[latS] < minLat) latS++;
    latE = nLat - 1; while (latE > 0 && lats[latE] > maxLat) latE--;
  } else {
    latS = 0; while (latS < nLat - 1 && lats[latS] > maxLat) latS++;
    latE = nLat - 1; while (latE > 0 && lats[latE] < minLat) latE--;
  }

  // Find lon index bounds (assumed ascending)
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
// Shared helpers for depth queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get elevation value at (lat, lon) from a BathyWindow.
 * Returns NaN if out of bounds.
 */
function getElevation(win, lat, lon) {
  const r = Math.round((lat - win.latStart) / win.latStep);
  const c = Math.round((lon - win.lonStart) / win.lonStep);
  if (r < 0 || r >= win.height || c < 0 || c >= win.width) return NaN;
  const v = win.data[r * win.width + c];
  // Clamp impossible values (no-data sentinels like 32767 in BATNAS)
  if (v > 8000 || v < -11000) return NaN;
  return v;
}

/**
 * Quick line-of-sight safety check between two points.
 * Returns true if the straight-line corridor (sampled at ~steps points,
 * skipping first/last 2 to ignore port-lock) has no point above limitDepth.
 * limitDepth is a NEGATIVE number (e.g. -10.85).
 * maxSteps: cap samples to avoid O(pixel_distance) cost on large windows.
 */
function isSafeCorridorLine(win, lat1, lon1, lat2, lon2, limitDepth, bufPx = 0, maxSteps = 0) {
  // Use pixel-resolution steps (matching Python: max(dlat/latStep, dlon/lonStep) * 1.5)
  const dlat = Math.abs(lat2 - lat1);
  const dlon = Math.abs(lon2 - lon1);
  const latStepAbs = Math.abs(win.latStep);
  const lonStepAbs = Math.abs(win.lonStep);
  const pixelSteps = (latStepAbs > 0 && lonStepAbs > 0)
    ? Math.max(dlat / latStepAbs, dlon / lonStepAbs) * 1.5
    : fastNm(lat1, lon1, lat2, lon2) * 4;
  // Cap if requested (used by buildAdjacency to keep per-edge cost O(1))
  const steps = maxSteps > 0
    ? Math.min(maxSteps, Math.max(10, Math.round(pixelSteps)))
    : Math.max(10, Math.round(pixelSteps));

  for (let i = 2; i < steps - 2; i++) {   // skip first/last 2: anti port-lock
    const t  = i / (steps - 1);
    const lt = lat1 + t * (lat2 - lat1);
    const ln = lon1 + t * (lon2 - lon1);
    const d  = getElevation(win, lt, ln);
    if (!isNaN(d) && d > limitDepth) return false;

    if (bufPx > 0) {
      const dlatBuf = bufPx * latStepAbs;
      const dlonBuf = bufPx * lonStepAbs;
      // 8-direction buffer (matching Python fast_safe_corridor_numpy buffer_px)
      const nbrs = [
        [lt + dlatBuf, ln],           [lt - dlatBuf, ln],
        [lt, ln + dlonBuf],           [lt, ln - dlonBuf],
        [lt + dlatBuf, ln + dlonBuf], [lt + dlatBuf, ln - dlonBuf],
        [lt - dlatBuf, ln + dlonBuf], [lt - dlatBuf, ln - dlonBuf],
      ];
      for (const [nl, no] of nbrs) {
        const nd = getElevation(win, nl, no);
        if (!isNaN(nd) && nd > limitDepth) return false;
      }
    }
  }
  return true;
}

/**
 * Find the nearest deep-water berth point from a land coordinate.
 * Scans the window for valid deep pixels, picks closest to coord.
 *
 * @param {object} win     BathyWindow
 * @param {number} lat     original location lat
 * @param {number} lon     original location lon
 * @param {number} safeD   minimum safe depth (negative, e.g. -10.85)
 * @param {number} maxJettyM  max jetty length in metres (0 = unlimited)
 * @returns {{ berthLat, berthLon, jettyM, berthDepth }}
 */
function findBerthPoint(win, lat, lon, safeD, maxJettyM = 0) {
  let bestDist = Infinity;
  let best = null;

  for (let r = 0; r < win.height; r++) {
    for (let c = 0; c < win.width; c++) {
      const v = win.data[r * win.width + c];
      if (isNaN(v) || v > 8000 || v < -11000) continue;
      if (v <= safeD) {
        const bLat = win.latStart + r * win.latStep;
        const bLon = win.lonStart + c * win.lonStep;
        const distNm = fastNm(lat, lon, bLat, bLon);
        const distM  = distNm * 1852;
        if (maxJettyM > 0 && distM > maxJettyM) continue;
        if (distNm < bestDist) {
          bestDist = distNm;
          best = { berthLat: bLat, berthLon: bLon, jettyM: distM, berthDepth: v };
        }
      }
    }
  }

  return best || { berthLat: lat, berthLon: lon, jettyM: 0, berthDepth: 0 };
}

module.exports = { getBatnas, getGebco, getElevation, isSafeCorridorLine, findBerthPoint, fastNm };
