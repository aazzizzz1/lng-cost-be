const prisma = require('../config/db');

async function upsertScenario(req, res) {
  try {
    const runKey = req.runKey;
    const { terminal, locations, params, demand } = req.body;

    const scenario = await prisma.supplyChainScenario.upsert({
      where: { runKey },
      update: { terminal, locations, params, demand },
      create: { runKey, terminal, locations, params, demand },
    });

    return res.json({ runKey: scenario.runKey, scenarioId: scenario.id });
  } catch (e) {
    return res.status(500).json({ error: 'Scenario error', detail: e.message });
  }
}

module.exports = { upsertScenario };
