/**
 * Spatial Routing Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * REST handlers for:
 *   POST /api/spatial-routing/route          – compute / cache sea-route
 *   POST /api/spatial-routing/multi-route    – batch compute (for full SC graph)
 *   POST /api/spatial-routing/jetty          – compute berth-point for a location
 *   GET  /api/spatial-routing/route/:key     – get cached route
 *   GET  /api/spatial-routing/weather        – get weather forecast for zones
 *   GET  /api/spatial-routing/iho-zones      – return IHO zone GeoJSON
 *   GET  /api/spatial-routing/berth-reports  – list all cached jetty reports
 *   DELETE /api/spatial-routing/cache        – clear all cached routes (admin)
 *
 * Leaflet frontend only needs:
 *   • waypoints  → L.polyline(waypoints)
 *   • iho-zones  → L.geoJSON(ihoZoneGeoJSON)
 *   • weather    → overlay per zone
 */

const prisma        = require('../config/db');
const spatialSvc    = require('../services/spatialRouteService');
const weatherSvc    = require('../services/weatherService');
const ihoSvc        = require('../services/ihoService');

// ─────────────────────────────────────────────────────────────────────────────
// POST /route
// Body: { origin: {name, lat, lon}, destination: {name, lat, lon},
//         draft?, waveHeight?, forceRecompute? }
// ─────────────────────────────────────────────────────────────────────────────
exports.computeRoute = async (req, res) => {
  const { origin, destination, draft, waveHeight, forceRecompute } = req.body;
  if (!origin?.lat || !origin?.lon || !destination?.lat || !destination?.lon) {
    return res.status(400).json({ error: 'origin and destination with lat/lon required' });
  }
  try {
    const result = await spatialSvc.computeRoute(origin, destination, {
      draft:         draft        || undefined,
      waveHeight:    waveHeight   || 0,
      forceRecompute: !!forceRecompute,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Route computation failed', detail: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /multi-route
// Body: { places: [{name, lat, lon}], draft?, waveHeight? }
// Computes all pairwise routes (for route graph pre-warming).
// ─────────────────────────────────────────────────────────────────────────────
exports.computeMultiRoute = async (req, res) => {
  const { places, draft, waveHeight } = req.body;
  if (!Array.isArray(places) || places.length < 2) {
    return res.status(400).json({ error: 'places[] with at least 2 entries required' });
  }
  const results = [];
  const errors  = [];

  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      try {
        const r = await spatialSvc.computeRoute(places[i], places[j], {
          draft: draft || undefined,
          waveHeight: waveHeight || 0,
        });
        results.push({
          origin:      places[i].name,
          destination: places[j].name,
          distanceNm:  r.distanceNm,
          routeKey:    r.routeKey,
          engineUsed:  r.engineUsed,
          fromCache:   r.fromCache,
        });
      } catch (e) {
        errors.push({ pair: `${places[i].name} – ${places[j].name}`, error: e.message });
      }
    }
  }

  res.json({ results, errors });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /jetty
// Body: { locationName, lat, lon, draft?, waveHeight?, maxJettyM? }
// ─────────────────────────────────────────────────────────────────────────────
exports.computeJetty = async (req, res) => {
  const { locationName, lat, lon, draft, waveHeight, maxJettyM } = req.body;
  if (!locationName || lat == null || lon == null) {
    return res.status(400).json({ error: 'locationName, lat, lon required' });
  }
  try {
    const report = await spatialSvc.computeJettyReport(locationName, lat, lon, {
      draft:      draft     || undefined,
      waveHeight: waveHeight || 0,
      maxJettyM:  maxJettyM  || 0,
    });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: 'Jetty computation failed', detail: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /route/:key
// ─────────────────────────────────────────────────────────────────────────────
exports.getRouteByKey = async (req, res) => {
  try {
    const route = await prisma.spatialRouteCache.findUnique({
      where: { routeKey: req.params.key },
    });
    if (!route) return res.status(404).json({ error: 'Route not cached' });
    res.json(route);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /weather?month=1&year=2030&mode=max
// ─────────────────────────────────────────────────────────────────────────────
exports.getWeather = async (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year  = parseInt(req.query.year)  || new Date().getFullYear();
  const mode  = req.query.mode === 'mean' ? 'mean' : 'max';
  try {
    const zones = await weatherSvc.getAllZones(month, year, mode);
    res.json({ month, year, mode, zones });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /iho-zones  – returns GeoJSON for Leaflet overlay
// ─────────────────────────────────────────────────────────────────────────────
exports.getIhoZones = async (req, res) => {
  try {
    const geoJSON = await ihoSvc.getZoneGeoJSON();
    res.json(geoJSON);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /berth-reports
// ─────────────────────────────────────────────────────────────────────────────
exports.getBerthReports = async (req, res) => {
  try {
    const reports = await prisma.jettyBerthReport.findMany({ orderBy: { locationName: 'asc' } });
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /cache  (admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.clearCache = async (req, res) => {
  try {
    const [routes, berths, weather] = await Promise.all([
      prisma.spatialRouteCache.deleteMany({}),
      prisma.jettyBerthReport.deleteMany({}),
      prisma.weatherZoneCache.deleteMany({}),
    ]);
    res.json({
      message: 'Cache cleared',
      routes:  routes.count,
      berths:  berths.count,
      weather: weather.count,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /oru-capex
// Body: { demandMmscfd, province, analysisYear, inflationRate }
// ─────────────────────────────────────────────────────────────────────────────
exports.getOruCapex = async (req, res) => {
  const { demandMmscfd, province, analysisYear, inflationRate } = req.body;
  if (demandMmscfd == null || !province) {
    return res.status(400).json({ error: 'demandMmscfd and province required' });
  }
  try {
    const capex = await spatialSvc.getDynamicOruCapex(
      parseFloat(demandMmscfd),
      province,
      parseInt(analysisYear) || new Date().getFullYear(),
      parseFloat(inflationRate) || 0.03,
    );
    res.json({ capex, demandMmscfd, province });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
