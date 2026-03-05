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

  // NEW: dukung terminal string atau array
  let terminals = [];
  if (Array.isArray(b.terminal)) {
    terminals = b.terminal
      .filter((n) => typeof n === 'string')
      .map((n) => n.trim())
      .filter(Boolean);
  } else if (typeof b.terminal === 'string') {
    const t = b.terminal.trim();
    if (t) terminals = [t];
  }

  if (!terminals.length || !Array.isArray(b.locations) || b.locations.length < 1) {
    return res.status(400).json({ error: 'terminal (string atau array) dan locations[] wajib diisi' });
  }

  if (!b.params || requiredParams.some((p) => typeof b.params[p] !== 'number')) {
    return res.status(400).json({ error: 'params is incomplete' });
  }
  if (!b.demand || typeof b.demand !== 'object') {
    return res.status(400).json({ error: 'demand object is required' });
  }

  const primaryTerminal = terminals[0];

  // normalize locations (unique, dan TIDAK boleh mengandung salah satu terminal)
  const rawLocations = Array.isArray(b.locations) ? b.locations : [];
  const termSet = new Set(terminals);
  const normLocations = [...new Set(rawLocations)].filter(
    (name) => !!name && !termSet.has(name)
  );
  if (normLocations.length < 1) {
    return res.status(400).json({ error: 'locations[] must contain at least one destination different from terminal(s)' });
  }

  // normalize method (milk-run | hub-spoke)
  const rawMethod = typeof b.method === 'string' ? b.method.toLowerCase() : 'milk-run';
  if (rawMethod !== 'milk-run' && rawMethod !== 'hub-spoke') {
    return res.status(400).json({ error: 'method must be "milk-run" or "hub-spoke"' });
  }

  // optional GEO map
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

  // NORMALISASI numVessels (jumlah kapal): angka 1, 2, 3, dst.
  let numVessels = 1;
  if (typeof b.numVessels === 'number' && Number.isInteger(b.numVessels) && b.numVessels >= 1) {
    numVessels = b.numVessels;
  } else if (typeof b.twin === 'object' && b.twin) {
    // backward compat: jika ada twin object, artinya 2 kapal
    numVessels = 2;
  }

  // Validasi: numVessels tidak boleh lebih dari jumlah lokasi
  if (numVessels > normLocations.length) {
    return res.status(400).json({ 
      error: `numVessels (${numVessels}) tidak boleh lebih besar dari jumlah lokasi (${normLocations.length})` 
    });
  }

  // normalize vessels list (optional filter)
  let normVessels = undefined;
  if (Array.isArray(b.vessels) && b.vessels.length > 0) {
    normVessels = [...new Set(
      b.vessels
        .filter((n) => typeof n === 'string')
        .map((n) => n.trim())
        .filter(Boolean)
    )].sort();
  }

  // canonical body for hashing
  const canonical = stableStringify({
    terminals: [...terminals].sort(),
    terminal_primary: primaryTerminal,
    locations: [...normLocations].sort(),
    params: b.params,
    demand: Object.keys(b.demand).sort().reduce((acc, k) => { acc[k] = b.demand[k]; return acc; }, {}),
    base_year: b.base_year ?? 2022,
    method: rawMethod,
    numVessels,
    vesselConfig: b.vesselConfig ? {
      enforceSameVessel: !!b.vesselConfig.enforceSameVessel,
      vesselNames: Array.isArray(b.vesselConfig.vesselNames)
        ? [...new Set(b.vesselConfig.vesselNames.filter((n) => typeof n === 'string').map((n) => n.trim()).filter(Boolean))].sort()
        : undefined,
      shareTerminalORU: !!b.vesselConfig.shareTerminalORU,
    } : undefined,
    risk: b.risk || undefined,
    geo,
    vessels: normVessels,
  });
  req.runKey = crypto.createHash('sha256').update(canonical).digest('hex');

  // attach normalized fields
  req.body.method = rawMethod;
  req.body.terminals = terminals;
  req.body.terminal = primaryTerminal;
  req.body.locations = normLocations;
  req.body.numVessels = numVessels;
  req.body.vessels = normVessels; // attach normalized vessels

  // vesselConfig (pengganti twin)
  if (b.vesselConfig) {
    req.body.vesselConfig = {
      enforceSameVessel: !!b.vesselConfig.enforceSameVessel,
      vesselNames: Array.isArray(b.vesselConfig.vesselNames) ? b.vesselConfig.vesselNames : undefined,
      shareTerminalORU: !!b.vesselConfig.shareTerminalORU,
    };
  } else if (b.twin) {
    // backward compat
    req.body.vesselConfig = {
      enforceSameVessel: !!b.twin.enforceSameVessel,
      vesselNames: Array.isArray(b.twin.vesselNames) ? b.twin.vesselNames : undefined,
      shareTerminalORU: !!b.twin.shareTerminalORU,
    };
  }

  next();
}

module.exports = { validateSupplyChainInput };
