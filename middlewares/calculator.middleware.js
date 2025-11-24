exports.validateTotalCostInput = (req, res, next) => {
  const {
    infrastructure,
    volume,
    unit,
    totalCost,
    year,
    location,
    low,
    high,
    information,
  } = req.body;

  if (
    !infrastructure ||
    typeof volume !== 'number' ||
    !unit ||
    typeof totalCost !== 'number' ||
    typeof year !== 'number' ||
    !location ||
    typeof low !== 'number' ||
    typeof high !== 'number' ||
    !information
  ) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  next();
};

exports.validateTotalCostUpdate = (req, res, next) => {
  const allowed = ['infrastructure','volume','unit','totalCost','year','location','low','high','information'];
  const bodyKeys = Object.keys(req.body);
  if (bodyKeys.length === 0) return res.status(400).json({ error: 'Empty body' });
  const invalid = bodyKeys.filter(k => !allowed.includes(k));
  if (invalid.length) return res.status(400).json({ error: `Invalid fields: ${invalid.join(', ')}` });
  // Basic type checks if present
  if (req.body.volume !== undefined && typeof req.body.volume !== 'number')
    return res.status(400).json({ error: 'volume must be number' });
  if (req.body.totalCost !== undefined && typeof req.body.totalCost !== 'number')
    return res.status(400).json({ error: 'totalCost must be number' });
  if (req.body.year !== undefined && typeof req.body.year !== 'number')
    return res.status(400).json({ error: 'year must be number' });
  if (req.body.low !== undefined && typeof req.body.low !== 'number')
    return res.status(400).json({ error: 'low must be number' });
  if (req.body.high !== undefined && typeof req.body.high !== 'number')
    return res.status(400).json({ error: 'high must be number' });
  next();
};
