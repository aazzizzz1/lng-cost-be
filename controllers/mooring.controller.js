const prisma = require('../config/db');

// Helpers
const DEFAULT_VALUES = {
	jettyMaxDepth: 25,
	jettyMaxDistanceKm: 2,
	cbmMinDepth: 15,
	cbmMaxDepth: 70,
	cbmExposurePolicy: 'SHELTERED_SEMI',
	spreadMaxDepth: 1000,
	towerYokeMaxDepth: 35,
	turretForPermanent: true,
	calmForVisiting: true,
};

async function ensureSingleton() {
	let item = await prisma.mooringRuleSetting.findFirst();
	if (!item) {
		item = await prisma.mooringRuleSetting.create({ data: { ...DEFAULT_VALUES } });
	}
	return item;
}

async function getSetting(req, res) {
	const item = await ensureSingleton();
	res.json(item);
}

async function updateSetting(req, res) {
	const existing = await ensureSingleton();
	const data = normalizeBody(req.body);
	const updated = await prisma.mooringRuleSetting.update({ where: { id: existing.id }, data });
	res.json(updated);
}

// Normalize numbers/booleans from strings
function normalizeBody(body) {
	const b = { ...body };
	const num = (v) => (v === undefined || v === null ? undefined : typeof v === 'number' ? v : Number(v));
	const bool = (v) => (v === undefined || v === null ? undefined : typeof v === 'boolean' ? v : v === 'true' || v === '1');
	return {
		jettyMaxDepth: num(b.jettyMaxDepth),
		jettyMaxDistanceKm: num(b.jettyMaxDistanceKm),
		cbmMinDepth: num(b.cbmMinDepth),
		cbmMaxDepth: num(b.cbmMaxDepth),
		cbmExposurePolicy: b.cbmExposurePolicy,
		spreadMaxDepth: num(b.spreadMaxDepth),
		towerYokeMaxDepth: num(b.towerYokeMaxDepth),
		turretForPermanent: bool(b.turretForPermanent),
		calmForVisiting: bool(b.calmForVisiting),
	};
}

module.exports = {
	getSetting,
	updateSetting,
};
