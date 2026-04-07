const prisma = require('../config/db');
const engine = require('../services/jettyDolphinEngine');

// ── Run full J&D calculation ────────────────────────────
exports.calculate = async (req, res) => {
  try {
    const input = req.body;
    const result = await engine.runFullCalculation(input);

    // Optionally save to DB
    const saved = await prisma.jdCalculation.create({
      data: {
        projectId: input.projectId || null,
        // Vessel
        shipType: input.shipType || 'LNGBV',
        tugAssist: input.tugAssist !== false,
        loa: input.loa,
        lpp: input.lpp || null,
        beam: input.beam,
        draft: input.draft,
        cargoCapacity: input.cargoCapacity,
        displacement: input.displacement || null,
        freeboard: input.freeboard || null,
        cbOverride: input.cbOverride || null,
        // Berthing
        berthingCondition: input.berthingCondition || null,
        vbOverride: input.vbOverride || null,
        gAngle: input.gAngle || null,
        rRadius: input.rRadius || null,
        csOverride: input.csOverride != null ? input.csOverride : null,
        ccOverride: input.ccOverride != null ? input.ccOverride : null,
        nEff: input.nEff || null,
        // Site & Mooring
        waterDepth: input.waterDepth,
        hs: input.hs || 0.5,
        windSpeedKnots: input.windSpeedKnots || 20,
        currentSpeedKnots: input.currentSpeedKnots || 1,
        awOverride: input.awOverride || null,
        acOverride: input.acOverride || null,
        waveDriftMode: input.waveDriftMode || 'Off',
        exposureClass: input.exposureClass || 'Moderate',
        fWaveUser: input.fWaveUser || null,
        nLines: input.nLines || 4,
        // Structural Concept
        conceptType: input.conceptType || 'Jetty_Dolphins',
        trestleLength: input.trestleLength || 600,
        nBreastingDolphins: input.nBreastingDolphins || 4,
        nMooringDolphins: input.nMooringDolphins || 4,
        nPilesPerBd: input.nPilesPerBd || 14,
        nPilesPerMd: input.nPilesPerMd || 11,
        leverArmH: input.leverArmH || 12,
        penetrationDepth: input.penetrationDepth || 10,
        nFendersPerBd: input.nFendersPerBd || 2,
        projectDuration: input.projectDuration || 12,
        usdRate: input.usdRate || 16300,
        jettyHeadLength: input.jettyHeadLength || 30,
        jettyHeadWidth: input.jettyHeadWidth || 15,
        bdPileCapLength: input.bdPileCapLength || 7,
        bdPileCapWidth: input.bdPileCapWidth || 7,
        bdPileCapHeight: input.bdPileCapHeight || 1.5,
        mdPileCapLength: input.mdPileCapLength || 6,
        mdPileCapWidth: input.mdPileCapWidth || 6,
        mdPileCapHeight: input.mdPileCapHeight || 1.5,
        // Results
        results: result,
        capexData: result.capex,
        qtoData: result.qto,
        summaryData: result.checkSummary,
      },
    });

    return res.status(200).json({
      message: 'Calculation completed',
      calculationId: saved.id,
      data: result,
    });
  } catch (err) {
    console.error('JD Calculate Error:', err);
    return res.status(500).json({ error: 'Calculation failed', detail: err.message });
  }
};

// ── Get calculation by ID ───────────────────────────────
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const calc = await prisma.jdCalculation.findUnique({ where: { id: Number(id) } });
    if (!calc) return res.status(404).json({ error: 'Calculation not found' });
    return res.json(calc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── List all calculations ───────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const calcs = await prisma.jdCalculation.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, projectId: true, shipType: true, conceptType: true,
        loa: true, beam: true, draft: true, waterDepth: true,
        createdAt: true, updatedAt: true,
      },
    });
    return res.json(calcs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Delete calculation ──────────────────────────────────
exports.deleteById = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.jdCalculation.delete({ where: { id: Number(id) } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Get calculations by project ─────────────────────────
exports.getByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const calcs = await prisma.jdCalculation.findMany({
      where: { projectId: Number(projectId) },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(calcs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// LOOKUP TABLE CRUD ENDPOINTS
// ═══════════════════════════════════════════════════════════

// ── Settings ────────────────────────────────────────────
exports.getSettings = async (_req, res) => {
  try {
    const settings = await prisma.jdSetting.findMany({ orderBy: { key: 'asc' } });
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, unit, notes } = req.body;
    const updated = await prisma.jdSetting.update({
      where: { key },
      data: { value: Number(value), ...(unit !== undefined && { unit }), ...(notes !== undefined && { notes }) },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Cb Defaults ─────────────────────────────────────────
exports.getCbDefaults = async (_req, res) => {
  try {
    return res.json(await prisma.jdCbDefault.findMany({ orderBy: { shipType: 'asc' } }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Berthing Velocity ───────────────────────────────────
exports.getBerthingVelocities = async (_req, res) => {
  try {
    return res.json(await prisma.jdBerthingVelocity.findMany({ orderBy: { deltaMin: 'asc' } }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Fender Catalogue ────────────────────────────────────
exports.getFenderCatalog = async (_req, res) => {
  try {
    return res.json(await prisma.jdFenderCatalog.findMany({ orderBy: { energyKj: 'asc' } }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Pile Catalogue ──────────────────────────────────────
exports.getPileCatalog = async (_req, res) => {
  try {
    return res.json(await prisma.jdPileCatalog.findMany({ orderBy: { mCapKnm: 'asc' } }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── QRH Catalogue ───────────────────────────────────────
exports.getQrhCatalog = async (_req, res) => {
  try {
    return res.json(await prisma.jdQrhCatalog.findMany({ orderBy: { classSwlKn: 'asc' } }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Unit Rates ──────────────────────────────────────────
exports.getUnitRates = async (_req, res) => {
  try {
    return res.json(await prisma.jdUnitRate.findMany({ orderBy: { rateId: 'asc' } }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateUnitRate = async (req, res) => {
  try {
    const { rateId } = req.params;
    const { rateIdr, item, unit, keterangan, tahun } = req.body;
    const updated = await prisma.jdUnitRate.update({
      where: { rateId },
      data: {
        ...(rateIdr !== undefined && { rateIdr: Number(rateIdr) }),
        ...(item !== undefined && { item }),
        ...(unit !== undefined && { unit }),
        ...(keterangan !== undefined && { keterangan }),
        ...(tahun !== undefined && { tahun: Number(tahun) }),
      },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
