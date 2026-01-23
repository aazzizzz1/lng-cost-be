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
  // canonical body for hashing
  const twinCanonical = b.twin ? {
    ratios: Array.isArray(b.twin.ratios) ? [...b.twin.ratios].sort() : undefined,
    enforceSameVessel: !!b.twin.enforceSameVessel,
    vesselNames: Array.isArray(b.twin.vesselNames) ? b.twin.vesselNames : undefined,
    shareTerminalORU: !!b.twin.shareTerminalORU,
  } : undefined;

  const canonical = stableStringify({
    terminal: b.terminal,
    locations: [...b.locations].sort(),
    params: b.params,
    demand: Object.keys(b.demand).sort().reduce((acc, k) => { acc[k] = b.demand[k]; return acc; }, {}),
    base_year: b.base_year ?? 2022,
    twin: twinCanonical,
  });
  req.runKey = crypto.createHash('sha256').update(canonical).digest('hex');

  // attach normalized twin for controllers/services
  if (b.twin) {
    req.body.twin = {
      ratios: Array.isArray(b.twin.ratios) ? b.twin.ratios : undefined,
      enforceSameVessel: !!b.twin.enforceSameVessel,
      vesselNames: Array.isArray(b.twin.vesselNames) ? b.twin.vesselNames : undefined,
      shareTerminalORU: !!b.twin.shareTerminalORU,
    };
  }
  next();
}

module.exports = { validateSupplyChainInput };
