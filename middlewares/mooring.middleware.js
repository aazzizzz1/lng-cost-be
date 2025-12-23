const { body, param, query, validationResult } = require('express-validator');

const exposureOptions = ['SHELTERED_ONLY', 'SHELTERED_SEMI', 'ALL'];

const createOrUpdateRules = [
	body('jettyMaxDepth').optional().isFloat({ gt: 0 }).withMessage('jettyMaxDepth must be > 0'),
	body('jettyMaxDistanceKm').optional().isFloat({ gt: 0 }).withMessage('jettyMaxDistanceKm must be > 0'),
	body('cbmMinDepth').optional().isFloat({ gt: 0 }).withMessage('cbmMinDepth must be > 0'),
	body('cbmMaxDepth').optional().isFloat({ gt: 0 }).withMessage('cbmMaxDepth must be > 0'),
	body('cbmExposurePolicy').optional().isIn(exposureOptions).withMessage('Invalid cbmExposurePolicy'),
	body('spreadMaxDepth').optional().isFloat({ gt: 0 }).withMessage('spreadMaxDepth must be > 0'),
	body('towerYokeMaxDepth').optional().isFloat({ gt: 0 }).withMessage('towerYokeMaxDepth must be > 0'),
	body('turretForPermanent').optional().isBoolean().withMessage('turretForPermanent must be boolean'),
	body('calmForVisiting').optional().isBoolean().withMessage('calmForVisiting must be boolean'),
];

function handleValidation(req, res, next) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}
	next();
}

module.exports = {
	createOrUpdateRules,
	handleValidation,
};
