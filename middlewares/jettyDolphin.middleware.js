/**
 * Validation middleware for Jetty & Dolphins endpoints
 */

exports.validateCalculation = (req, res, next) => {
  const b = req.body;
  const errors = [];

  // Required fields
  if (!b.loa || typeof b.loa !== 'number' || b.loa <= 0)
    errors.push('loa is required and must be a positive number');
  if (!b.beam || typeof b.beam !== 'number' || b.beam <= 0)
    errors.push('beam is required and must be a positive number');
  if (!b.draft || typeof b.draft !== 'number' || b.draft <= 0)
    errors.push('draft is required and must be a positive number');
  if (!b.cargoCapacity || typeof b.cargoCapacity !== 'number' || b.cargoCapacity <= 0)
    errors.push('cargoCapacity is required and must be a positive number');
  if (!b.waterDepth || typeof b.waterDepth !== 'number' || b.waterDepth <= 0)
    errors.push('waterDepth is required and must be a positive number');

  // Ship type validation
  const validShipTypes = ['LNGC', 'LNGBV', 'SPB', 'Tanker', 'Container', 'Ro-Ro', 'Bulk'];
  if (b.shipType && !validShipTypes.includes(b.shipType))
    errors.push(`shipType must be one of: ${validShipTypes.join(', ')}`);

  // Concept type
  const validConcepts = ['Jetty_Dolphins', 'Dolphins_Only'];
  if (b.conceptType && !validConcepts.includes(b.conceptType))
    errors.push(`conceptType must be one of: ${validConcepts.join(', ')}`);

  // Wave drift mode
  const validWaveModes = ['Off', 'User_Input', 'k_Wave'];
  if (b.waveDriftMode && !validWaveModes.includes(b.waveDriftMode))
    errors.push(`waveDriftMode must be one of: ${validWaveModes.join(', ')}`);

  // Exposure class
  const validExposure = ['Sheltered', 'Moderate', 'Exposed'];
  if (b.exposureClass && !validExposure.includes(b.exposureClass))
    errors.push(`exposureClass must be one of: ${validExposure.join(', ')}`);

  // Berthing condition
  const validConditions = ['Favourable', 'Moderate', 'Unfavourable'];
  if (b.berthingCondition && !validConditions.includes(b.berthingCondition))
    errors.push(`berthingCondition must be one of: ${validConditions.join(', ')}`);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

exports.validateIdParam = (req, res, next) => {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid ID parameter' });
  }
  next();
};
