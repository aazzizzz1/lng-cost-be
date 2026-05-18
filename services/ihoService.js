/**
 * IHO World Seas Shapefile Service
 * ---------------------------------
 * Reads World_Seas_IHO_v3.shp and maps sea-names to our weather zone keys.
 * Used to detect which weather zone a route mid-point or bounding box crosses.
 *
 * Zone mapping (matches Python WEATHER_ZONES):
 *   Laut_Banda   → IHO "Banda Sea"
 *   Laut_Flores  → IHO "Flores Sea"
 *   Laut_Maluku  → IHO "Molucca Sea"
 */

const shapefile = require('shapefile');
const path = require('path');

// ──────────────────────────────────────────────────────────
// Fallback bounding boxes when shapefile can't be loaded
// (same as Python WEATHER_ZONES with a pad of 1.5 deg)
// ──────────────────────────────────────────────────────────
const FALLBACK_ZONES = {
  Laut_Banda:  { minLat: -6.97, maxLat: -3.97, minLon: 125.14, maxLon: 128.14 },
  Laut_Flores: { minLat: -9.34, maxLat: -6.34, minLon: 115.90, maxLon: 118.90 },
  Laut_Maluku: { minLat: -2.00, maxLat: 1.00,  minLon: 123.66, maxLon: 126.66 },
};

// ──────────────────────────────────────────────────────────
// Ray-casting point-in-polygon (coordinates in [lon, lat])
// ──────────────────────────────────────────────────────────
function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeometry(lon, lat, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    return pointInRing(lon, lat, geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => pointInRing(lon, lat, poly[0]));
  }
  return false;
}

// ──────────────────────────────────────────────────────────
// Map a raw IHO name to our internal zone key
// ──────────────────────────────────────────────────────────
function ihoNameToZone(rawName) {
  const n = (rawName || '').toLowerCase();
  if (n.includes('banda')) return 'Laut_Banda';
  if (n.includes('flores')) return 'Laut_Flores';
  if (n.includes('molucca') || n.includes('molukka') || n.includes('maluku')) return 'Laut_Maluku';
  return null;
}

// ──────────────────────────────────────────────────────────
// Coordinate simplification: round to 2 dp (~1.1 km precision)
// reduces GeoJSON response from ~11 MB to ~0.5 MB
// ──────────────────────────────────────────────────────────
function simplifyRing(ring, precision = 2) {
  const f = Math.pow(10, precision);
  const out = [];
  for (const [x, y] of ring) {
    const rx = Math.round(x * f) / f;
    const ry = Math.round(y * f) / f;
    if (!out.length || out[out.length - 1][0] !== rx || out[out.length - 1][1] !== ry) {
      out.push([rx, ry]);
    }
  }
  // close the ring
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
    out.push(out[0]);
  }
  return out;
}

function simplifyGeometry(geometry) {
  if (!geometry) return geometry;
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(ring => simplifyRing(ring)) };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(poly => poly.map(ring => simplifyRing(ring))),
    };
  }
  return geometry;
}

// ──────────────────────────────────────────────────────────
// Singleton: loads & caches shapefile on first use
// ──────────────────────────────────────────────────────────
class IHOService {
  constructor() {
    this._zones = null;      // Array<{zone, geometry}>
    this._geoJSON = null;    // Cached simplified GeoJSON
    this._shpPath = path.join(__dirname, '../data/World_Seas_IHO_v3.shp');
    this._loadError = null;
  }

  async _load() {
    if (this._zones !== null || this._loadError) return;
    const zones = [];
    try {
      const source = await shapefile.open(this._shpPath);
      while (true) {
        const result = await source.read();
        if (result.done) break;
        const feat = result.value;
        const zoneName = ihoNameToZone(
          feat.properties.NAME || feat.properties.name || ''
        );
        // Only keep zones we care about – skip geometry parsing for all others
        if (zoneName) {
          zones.push({ zone: zoneName, geometry: feat.geometry });
        }
        // Early exit once all 3 target zones are found
        if (zones.length === 3) break;
      }
      this._zones = zones;
    } catch (err) {
      console.warn('[IHO] Cannot load shapefile, falling back to bounding boxes:', err.message);
      this._loadError = err.message;
      this._zones = []; // empty → fall back to bbox
    }
  }

  // ── Warm up in background (non-blocking). Call once at startup. ──
  warmUp() {
    if (this._zones !== null || this._loadError || this._loading) return;
    this._loading = true;
    this._load().then(() => { this._loading = false; }).catch(() => { this._loading = false; });
  }

  // ── Get zone for a single point ──
  async getActiveZone(lat, lon) {
    // Use shapefile polygons only if already loaded (non-blocking)
    if (this._zones && this._zones.length > 0) {
      for (const { zone, geometry } of this._zones) {
        if (pointInGeometry(lon, lat, geometry)) return zone;
      }
    }

    // Fast fallback bbox – always available, no IO cost
    for (const [zone, bb] of Object.entries(FALLBACK_ZONES)) {
      if (lat >= bb.minLat && lat <= bb.maxLat && lon >= bb.minLon && lon <= bb.maxLon) {
        return zone;
      }
    }
    return null;
  }

  // ── Get all zones intersecting a bounding box (sampled corners + centre) ──
  // Non-blocking: uses fast bbox fallback, doesn't await shapefile load.
  async getZonesForBbox(minLat, maxLat, minLon, maxLon) {
    const midLat = (minLat + maxLat) / 2;
    const midLon = (minLon + maxLon) / 2;
    const samplePoints = [
      [minLat, minLon], [minLat, maxLon],
      [maxLat, minLon], [maxLat, maxLon],
      [midLat, midLon],
    ];
    const found = new Set();
    for (const [lt, ln] of samplePoints) {
      const z = await this.getActiveZone(lt, ln);
      if (z) found.add(z);
    }
    return Array.from(found);
  }

  // ── Return GeoJSON features for all mapped zones (for Leaflet rendering) ──
  async getZoneGeoJSON() {
    if (this._geoJSON) return this._geoJSON; // serve from memory cache

    await this._load();
    const features = this._zones.map(({ zone, geometry }) => ({
      type: 'Feature',
      properties: { zone },
      geometry: simplifyGeometry(geometry),
    }));

    // Supplement with bbox polygons for zones not in shapefile
    const inShapefile = new Set(this._zones.map((z) => z.zone));
    for (const [zone, bb] of Object.entries(FALLBACK_ZONES)) {
      if (!inShapefile.has(zone)) {
        features.push({
          type: 'Feature',
          properties: { zone, isFallback: true },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [bb.minLon, bb.minLat], [bb.maxLon, bb.minLat],
              [bb.maxLon, bb.maxLat], [bb.minLon, bb.maxLat],
              [bb.minLon, bb.minLat],
            ]],
          },
        });
      }
    }

    this._geoJSON = { type: 'FeatureCollection', features };
    return this._geoJSON;
  }
}

module.exports = new IHOService();
