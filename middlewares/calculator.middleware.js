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
