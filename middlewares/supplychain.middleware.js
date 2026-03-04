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

  // NORMALISASI daftar kapal yang dipakai (optional multi-select)
  let normVessels;
  if (Array.isArray(b.vessels)) {
    normVessels = [...new Set(
      b.vessels
        .filter((n) => typeof n === 'string')
        .map((n) => n.trim())
        .filter(Boolean)
    )];
    if (!normVessels.length) normVessels = undefined;
  }

  // canonical body for hashing (pakai daftar terminals, tanpa ratios)
  const canonical = stableStringify({
    terminals: [...terminals].sort(),                        // NEW
    terminal_primary: primaryTerminal,                       // NEW (kompat)
    locations: [...normLocations].sort(),
    params: b.params,
    demand: Object.keys(b.demand).sort().reduce((acc, k) => { acc[k] = b.demand[k]; return acc; }, {}),
    base_year: b.base_year ?? 2022,
    method: rawMethod,
    twin: b.twin ? {
      enforceSameVessel: !!b.twin.enforceSameVessel,
      vesselNames: Array.isArray(b.twin.vesselNames)
        ? [...new Set(b.twin.vesselNames.filter((n) => typeof n === 'string').map((n) => n.trim()).filter(Boolean))].sort()
        : undefined,
      shareTerminalORU: !!b.twin.shareTerminalORU,
    } : undefined,
    risk: b.risk || undefined,
    geo,
    vessels: normVessels,        // NEW: daftar nama kapal (kandidat)
  });
  req.runKey = crypto.createHash('sha256').update(canonical).digest('hex');

  // attach normalized fields
  req.body.method = rawMethod;
  req.body.terminals = terminals;          // NEW: full list
  req.body.terminal = primaryTerminal;     // tetap ada untuk kompat
  req.body.locations = normLocations;

  if (b.twin) {
    req.body.twin = {
      enforceSameVessel: !!b.twin.enforceSameVessel,
      vesselNames: Array.isArray(b.twin.vesselNames) ? b.twin.vesselNames : undefined,
      shareTerminalORU: !!b.twin.shareTerminalORU,
    };
  }
  if (normVessels) {
    req.body.vessels = normVessels;  // NEW: kapal yang dipilih user (multi-select)
  }
  if (b.risk && typeof b.risk === 'object') {
    req.body.risk = b.risk;
  }
  if (geo) {
    req.body.geo = geo;
  }

  next();
}

module.exports = { validateSupplyChainInput };
