const crypto = require('crypto');

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map((v) => stableStringify(v)).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `"${k}":${stableStringify(obj[k])}`).join(',')}}`;
}

function validateSupplyChainInput(req, res, next) {
  const b = req.body || {};
  // minimal required structure
  const requiredParams = ['harga_bbm','harga_lng','scf_lng','scf_mgo','loading_hour','maintenance_days','unpumpable_pct','bog_pct','filling_pct','gross_storage_pct','analysis_year','inflation_rate'];
  if (!b.terminal || !Array.isArray(b.locations) || b.locations.length < 1) {
    return res.status(400).json({ error: 'terminal and locations[] are required' });
  }
  if (!b.params || requiredParams.some((p) => typeof b.params[p] !== 'number')) {
    return res.status(400).json({ error: 'params is incomplete' });
  }
  if (!b.demand || typeof b.demand !== 'object') {
    return res.status(400).json({ error: 'demand object is required' });
  }

  // NEW: normalize locations (unique, and must NOT include terminal)
  const rawLocations = Array.isArray(b.locations) ? b.locations : [];
  const normLocations = [...new Set(rawLocations)].filter((name) => !!name && name !== b.terminal);
  if (normLocations.length < 1) {
    return res.status(400).json({ error: 'locations[] must contain at least one destination different from terminal' });
  }

  // NEW: normalize method (milk-run | hub-spoke)
  const rawMethod = typeof b.method === 'string' ? b.method.toLowerCase() : 'milk-run';
  if (rawMethod !== 'milk-run' && rawMethod !== 'hub-spoke') {
    return res.status(400).json({ error: 'method must be "milk-run" or "hub-spoke"' });
  }

  // NEW: optional GEO map (nama -> { latitude, longitude }) untuk custom titik Leaflet
  let geo = undefined;
  if (b.geo && typeof b.geo === 'object') {
    geo = {};
    for (const [name, val] of Object.entries(b.geo)) {
      if (
        val &&
        typeof val.latitude === 'number' &&
        typeof val.longitude === 'number'
      ) {
        geo[name] = {
          latitude: val.latitude,
          longitude: val.longitude,
        };
      }
    }
    if (Object.keys(geo).length === 0) geo = undefined;
  }

  // canonical body for hashing
  const canonical = stableStringify({
    terminal: b.terminal,
    locations: [...normLocations].sort(),
    params: b.params,
    demand: Object.keys(b.demand).sort().reduce((acc, k) => { acc[k] = b.demand[k]; return acc; }, {}),
    base_year: b.base_year ?? 2022,
    method: rawMethod,
    twin: b.twin ? {
      ratios: Array.isArray(b.twin.ratios) ? [...b.twin.ratios].sort() : undefined,
      enforceSameVessel: !!b.twin.enforceSameVessel,
      vesselNames: Array.isArray(b.twin.vesselNames) ? b.twin.vesselNames : undefined,
      shareTerminalORU: !!b.twin.shareTerminalORU,
    } : undefined,
    risk: b.risk || undefined,
    // NEW: ikut mempengaruhi runKey bila pakai koordinat custom
    geo,
  });
  req.runKey = crypto.createHash('sha256').update(canonical).digest('hex');

  // attach normalized method, locations, twin and risk
  req.body.method = rawMethod;
  req.body.locations = normLocations;

  if (b.twin) {
    req.body.twin = {
      ratios: Array.isArray(b.twin.ratios) ? b.twin.ratios : undefined,
      enforceSameVessel: !!b.twin.enforceSameVessel,
      vesselNames: Array.isArray(b.twin.vesselNames) ? b.twin.vesselNames : undefined,
      shareTerminalORU: !!b.twin.shareTerminalORU,
    };
  }
  if (b.risk && typeof b.risk === 'object') {
    // expected shape: { selections: { "II.1": ["R1","R2"], "II.2": ["R22"], ... } }
    req.body.risk = b.risk;
  }
  if (geo) {
    // NEW: simpan geo normal ke body, dipakai engine untuk hitung jarak dinamis
    req.body.geo = geo;
  }

  next();
}

module.exports = { validateSupplyChainInput };
