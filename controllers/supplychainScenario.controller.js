const prisma = require('../config/db');

async function upsertScenario(req, res) {
  try {
    const runKey = req.runKey;
    const { locations, params, demand } = req.body;
    // NEW: dukung banyak terminal
    const terminalsArr = Array.isArray(req.body.terminals) && req.body.terminals.length
      ? req.body.terminals
      : (req.body.terminal ? [req.body.terminal] : []);
    const terminalLabel = terminalsArr.length > 1
      ? terminalsArr.join(', ')
      : (terminalsArr[0] || '');

    const scenario = await prisma.supplyChainScenario.upsert({
      where: { runKey },
      update: { terminal: terminalLabel, locations, params, demand },
      create: { runKey, terminal: terminalLabel, locations, params, demand },
    });

    return res.json({ runKey: scenario.runKey, scenarioId: scenario.id });
  } catch (e) {
    return res.status(500).json({ error: 'Scenario error', detail: e.message });
  }
}

module.exports = { upsertScenario };
