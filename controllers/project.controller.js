const prisma = require('../config/db');

exports.createProject = async (req, res) => {
  try {
    const { constructionCosts, lokasi, infrastruktur, kategori, tahun, name, volume, inflasi } = req.body;

    // Validate required fields
    if (!name || !infrastruktur || !lokasi || !kategori || !tahun) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    // Create the project with placeholder values for levelAACE and harga
    const project = await prisma.project.create({
      data: {
        name,
        infrastruktur, // Replace jenis with infrastruktur
        lokasi,
        kategori,
        tahun,
        volume,
        inflasi: inflasi ?? 0, // NEW: store inflasi
        levelAACE: 0, // Placeholder value
        harga: 0, // Placeholder value
        createdAt: new Date(), // Add current date and time
      },
    });

    // Bulk create construction costs associated with the project
    if (constructionCosts && constructionCosts.length > 0) {
      await prisma.constructionCost.createMany({
        data: constructionCosts.map((cost) => ({
          ...cost,
          projectId: project.id, // Ensure projectId is included
        })),
      });

      // Calculate total harga and average levelAACE
      const totalHarga = constructionCosts.reduce((sum, cost) => sum + cost.totalHarga, 0);
      const averageLevelAACE =
        constructionCosts.reduce((sum, cost) => sum + cost.aaceClass, 0) / constructionCosts.length;

      // Update the project with calculated values
      await prisma.project.update({
        where: { id: project.id },
        data: {
          harga: Math.round(totalHarga),
          levelAACE: Math.round(averageLevelAACE),
        },
      });
    } else {
      return res.status(400).json({
        message: 'Construction costs are required to create a project.',
        data: null,
      });
    }

    res.status(201).json({
      message: 'Project created successfully.',
      data: project,
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create project', error: error.message });
  }
};

exports.getAllProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    res.json({
      message: 'Objects retrieved successfully.',
      data: projects,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch projects', data: null });
  }
};

exports.getManualProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { NOT: { kategori: 'Auto-generated' } },
    });
    res.json({
      message: 'Manual projects retrieved successfully.',
      data: projects,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch manual projects', data: null });
  }
};

exports.getProjectById = async (req, res) => {
  const { id } = req.params;
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(id) }, // Prevent SQL injection by using parameterized queries
      include: { constructionCosts: true },
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found', data: null });
    }

    // Calculate total construction cost
    const totalConstructionCost = project.constructionCosts.reduce((sum, cost) => sum + cost.totalHarga, 0);

    // Calculate average AACE level
    const totalAACE = project.constructionCosts.reduce((sum, cost) => sum + cost.aaceClass, 0);
    const averageAACE = project.constructionCosts.length > 0 ? totalAACE / project.constructionCosts.length : 0;

    // Define PPN and insurance rates
    const ppnRate = 0.11; // 11% PPN
    const insuranceRate = 0.025; // 2.5% insurance

    // Calculate PPN, insurance, and total estimation
    const ppn = totalConstructionCost * ppnRate;
    const insurance = totalConstructionCost * insuranceRate;
    const totalEstimation = totalConstructionCost + ppn + insurance;

    res.json({
      message: 'Object retrieved successfully.',
      data: {
        ...project,
        totalConstructionCost,
        averageAACE: Math.round(averageAACE),
        ppn,
        insurance,
        totalEstimation,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch project', data: null });
  }
};

exports.recommendConstructionCostsAndCreateProject = async (req, res) => {
  try {
    const { name, infrastruktur, lokasi, volume, tahun, inflasi } = req.body;

    const parseVol = (v) => {
      if (v === null || v === undefined) return NaN;
      if (typeof v === 'number') return v;
      return Number(String(v).replace(',', '.').trim());
    };
    const targetVolume = parseVol(volume);

    const unitPrices = await prisma.unitPrice.findMany({
      where: { infrastruktur: { equals: infrastruktur, mode: 'insensitive' } },
      orderBy: { volume: 'asc' },
    });
    if (!unitPrices.length) {
      return res.status(400).json({ message: 'No UnitPrice data found.' });
    }

    // Normalisasi volume dan kumpulkan per volume
    const volumeMap = new Map(); // numVolume -> { vol, items, codes:Set }
    for (const up of unitPrices) {
      const numVol = parseVol(up.volume);
      if (isNaN(numVol)) continue;
      up._numVolume = numVol;
      if (!volumeMap.has(numVol)) volumeMap.set(numVol, { vol: numVol, items: [], codes: new Set() });
      const bucket = volumeMap.get(numVol);
      bucket.items.push(up);
      const code = (up.workcode || '').trim().toLowerCase();
      if (code) bucket.codes.add(code);
    }
    const volumeEntries = Array.from(volumeMap.values()).sort((a, b) => a.vol - b.vol);
    if (!volumeEntries.length || isNaN(targetVolume)) {
      return res.status(400).json({ message: 'Invalid volume data.' });
    }

    const volumes = volumeEntries.map(v => v.vol);
    const isExactVolume = volumes.includes(targetVolume);

    const selectPairByMaxOverlap = (candidatesLower, candidatesUpper, context) => {
      let best = null;
      for (const L of candidatesLower) {
        for (const U of candidatesUpper) {
          if (L.vol === U.vol) continue;
            // context in-range: enforce L<=target<=U
            if (context === 'in-range' && !(L.vol <= targetVolume && targetVolume <= U.vol)) continue;
          const interSize = [...L.codes].filter(c => U.codes.has(c)).length;
          if (!best) {
            best = { L, U, interSize };
            continue;
          }
          if (
            interSize > best.interSize ||
            (interSize === best.interSize && (U.vol - L.vol) < (best.U.vol - best.L.vol)) ||
            (interSize === best.interSize && (U.vol - L.vol) === (best.U.vol - best.L.vol) &&
              Math.abs(targetVolume - ((L.vol + U.vol) / 2)) < Math.abs(targetVolume - ((best.L.vol + best.U.vol) / 2)))
          ) {
            best = { L, U, interSize };
          }
        }
      }
      return best;
    };

    let mode = 'single';
    let lowerVol, upperVol;
    let lowerItems = [];
    let upperItems = [];

    if (isExactVolume) {
      lowerVol = upperVol = targetVolume;
      lowerItems = upperItems = volumeMap.get(targetVolume).items;
    } else if (targetVolume < volumes[0]) {
      // extrapolation below: gunakan dua volume terbawah dengan overlap maksimum
      mode = 'extrapolation-below';
      const subset = volumeEntries.slice(0, Math.min(4, volumeEntries.length));
      const pair = selectPairByMaxOverlap(subset, subset.slice(1), 'below') ||
        { L: subset[0], U: subset[1] };
      lowerVol = pair.L.vol;
      upperVol = pair.U.vol;
      lowerItems = pair.L.items;
      upperItems = pair.U.items;
    } else if (targetVolume > volumes[volumes.length - 1]) {
      // extrapolation above
      mode = 'extrapolation-above';
      const subset = volumeEntries.slice(-Math.min(4, volumeEntries.length));
      const pair = selectPairByMaxOverlap(subset, subset, 'above') ||
        { L: subset[subset.length - 2], U: subset[subset.length - 1] };
      // Ensure L < U
      if (pair.L.vol > pair.U.vol) [pair.L, pair.U] = [pair.U, pair.L];
      lowerVol = pair.L.vol;
      upperVol = pair.U.vol;
      lowerItems = pair.L.items;
      upperItems = pair.U.items;
    } else {
      // in-range interpolation
      mode = 'interpolation';
      const lowers = volumeEntries.filter(v => v.vol <= targetVolume);
      const uppers = volumeEntries.filter(v => v.vol >= targetVolume);
      const pair = selectPairByMaxOverlap(lowers, uppers, 'in-range');
      if (pair) {
        lowerVol = pair.L.vol;
        upperVol = pair.U.vol;
        lowerItems = pair.L.items;
        upperItems = pair.U.items;
        if (lowerVol === upperVol) mode = 'single';
      } else {
        // fallback ke volumes terdekat
        let closest = volumes[0];
        for (const v of volumes) {
          if (Math.abs(v - targetVolume) < Math.abs(closest - targetVolume)) closest = v;
        }
        lowerVol = upperVol = closest;
        lowerItems = upperItems = volumeMap.get(closest).items;
        mode = 'single';
      }
    }

    const norm = (s) => (s || '').trim().toLowerCase();
    const toMap = (arr) => {
      const m = new Map();
      for (const it of arr) {
        const k = norm(it.workcode);
        if (k && !m.has(k)) m.set(k, it);
      }
      return m;
    };
    const lowerMap = toMap(lowerItems);
    const upperMap = toMap(upperItems);
    const unionCodes = new Set([...lowerMap.keys(), ...upperMap.keys()]);
    if (unionCodes.size === 0) {
      return res.status(400).json({ message: 'No UnitPrice items found for selected volumes.' });
    }

    // CCI
    const cciRef = await prisma.cci.findFirst({ where: { cci: { gte: 100, lte: 100 } } });
    const cciRefValue = cciRef ? cciRef.cci : 100;
    const cciLokasi = await prisma.cci.findFirst({
      where: { provinsi: { equals: lokasi, mode: 'insensitive' } },
    });
    const cciLokasiValue = cciLokasi ? cciLokasi.cci : 100;

    // NEW: cache helper for original location CCI
    const cciCache = new Map();
    const getCCIValue = async (prov) => {
      if (!prov) return 100;
      const key = prov.trim().toLowerCase();
      if (cciCache.has(key)) return cciCache.get(key);
      const found = await prisma.cci.findFirst({
        where: { provinsi: { equals: prov, mode: 'insensitive' } },
      });
      const val = found ? found.cci : 100;
      cciCache.set(key, val);
      return val;
    };

    const r = Number(inflasi || 0) / 100;
    const X1 = lowerVol;
    const X2 = upperVol;

    const recommendedCosts = [];
    for (const code of unionCodes) {
      const itemLower = lowerMap.get(code);
      const itemUpper = upperMap.get(code);
      const baseItem = itemLower || itemUpper;

      let qty;
      let rumusQty;

      if (isExactVolume && Number(baseItem._numVolume) === targetVolume) {
        qty = baseItem.qty || 0;
        rumusQty = `qty = ${qty} (exact volume match)`;
      } else if (itemLower && itemUpper && X2 !== X1) {
        const Y1 = itemLower.qty || 0;
        const Y2 = itemUpper.qty || 0;
        const label =
          mode === 'interpolation'
            ? 'interpolation'
            : (mode === 'extrapolation-above'
              ? 'extrapolation above'
              : (mode === 'extrapolation-below'
                ? 'extrapolation below'
                : 'calculation'));
        qty = Y1 + ((targetVolume - X1) / (X2 - X1)) * (Y2 - Y1);
        rumusQty = `qty (${label}) = ${Y1} + ((${targetVolume} - ${X1}) / (${X2} - ${X1})) * (${Y2} - ${Y1})`;
      } else {
        qty = baseItem.qty || 0;
        rumusQty = `qty = ${qty} (single side, no pair)`;
      }

      // NEW: if interpolated/extrapolated qty becomes negative, fallback to original database qty
      if (qty < 0) {
        const originalQty = baseItem.qty || 0;
        rumusQty += ` => result negative (${qty}), fallback to original qty ${originalQty}`;
        qty = originalQty;
      }

      const n = Number(tahun) - Number(baseItem.tahun || tahun);
      const hargaInflasi = (baseItem.hargaSatuan || 0) * Math.pow(1 + r, n);
      const cciOriginalValue = await getCCIValue(baseItem.lokasi); // NEW
      // REFACTORED two-step CCI normalization
      const toBenchmark = hargaInflasi * (cciRefValue / cciOriginalValue);
      const hargaCCI = toBenchmark * (cciLokasiValue / 100);

      const rumusHargaInflasi = `hargaInflasi = ${baseItem.hargaSatuan} * (1 + ${r})^${n}`;
      const rumusBenchmark = `toBenchmark = ${hargaInflasi} * (${cciRefValue} / ${cciOriginalValue})`;
      const rumusHargaCCI = `hargaCCI = toBenchmark * (${cciLokasiValue} / 100)`;

      recommendedCosts.push({
        ...baseItem,
        proyek: name,
        lokasi,
        tahun,
        volume: targetVolume,
        qty,
        hargaSatuan: Math.round(hargaCCI),
        totalHarga: Math.round(qty * hargaCCI),
        rumusQty,
        rumusHargaInflasi,
        rumusBenchmark,       // NEW
        rumusHargaCCI,        // UPDATED meaning
        toBenchmark,          // NEW (raw value, not rounded)
        _mode: mode
      });
    }

    res.status(200).json({
      message: 'Recommended construction costs retrieved successfully.',
      data: recommendedCosts,
      meta: {
        targetVolume,
        lowerVol,
        upperVol,
        mode,
        overlapCodes: [...lowerMap.keys()].filter(c => upperMap.has(c)).length
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to recommend construction costs', error: error.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    // Hapus semua constructionCost yang terkait dengan project
    await prisma.constructionCost.deleteMany({
      where: { projectId: parseInt(id) },
    });

    // Hapus project berdasarkan ID
    await prisma.project.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      message: 'Project and associated construction costs deleted successfully.',
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to delete project', error: error.message });
  }
};

exports.calculateProjectEstimation = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the project and its associated construction costs
    const project = await prisma.project.findUnique({
      where: { id: parseInt(id) },
      include: { constructionCosts: true },
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Calculate total construction cost
    const totalConstructionCost = project.constructionCosts.reduce((sum, cost) => sum + cost.totalHarga, 0);

    // Define PPN and insurance rates
    const ppnRate = 0.11; // 11% PPN
    const insuranceRate = 0.025; // 2.5% insurance

    // Calculate PPN, insurance, and total estimation
    const ppn = totalConstructionCost * ppnRate;
    const insurance = totalConstructionCost * insuranceRate;
    const totalEstimation = totalConstructionCost + ppn + insurance;

    res.status(200).json({
      message: 'Project estimation calculated successfully.',
      data: {
        totalConstructionCost,
        ppn,
        insurance,
        totalEstimation,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to calculate project estimation', error: error.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      name,
      infrastruktur,
      lokasi,
      kategori,
      tahun,
      volume,
      inflasi, // NEW
      constructionCosts, // array item: jika ada id -> update, jika tidak -> create
      deleteConstructionCostIds, // array id yang akan dihapus
    } = req.body;

    const projectData = {};
    if (name !== undefined) projectData.name = name;
    if (infrastruktur !== undefined) projectData.infrastruktur = infrastruktur;
    if (lokasi !== undefined) projectData.lokasi = lokasi;
    if (kategori !== undefined) projectData.kategori = kategori;
    if (tahun !== undefined) projectData.tahun = tahun;
    if (volume !== undefined) projectData.volume = volume;
    if (inflasi !== undefined) projectData.inflasi = inflasi; // NEW

    const allowedCostFields = [
      'workcode', // NEW
      'uraian','specification','qty','satuan','hargaSatuan','totalHarga',
      'aaceClass','accuracyLow','accuracyHigh','tahun','infrastruktur','volume',
      'satuanVolume','kelompok','kelompokDetail','lokasi','tipe' // REMOVED kapasitasRegasifikasi, satuanKapasitas
    ];

    const updated = await prisma.$transaction(async (tx) => {
      const exists = await tx.project.findUnique({ where: { id } });
      if (!exists) throw new Error('Project not found');

      if (Object.keys(projectData).length) {
        await tx.project.update({ where: { id }, data: projectData });
      }

      if (Array.isArray(deleteConstructionCostIds) && deleteConstructionCostIds.length) {
        await tx.constructionCost.deleteMany({
          where: { id: { in: deleteConstructionCostIds }, projectId: id },
        });
      }

      if (Array.isArray(constructionCosts) && constructionCosts.length) {
        for (const cost of constructionCosts) {
          const { id: costId, ...rest } = cost || {};
          const data = {};
          for (const k of allowedCostFields) {
            if (rest[k] !== undefined) data[k] = rest[k];
          }

          if (costId) {
            const { count } = await tx.constructionCost.updateMany({
              where: { id: costId, projectId: id },
              data,
            });
            if (count === 0) {
              throw new Error(`ConstructionCost ${costId} not found in this project`);
            }
          } else {
            await tx.constructionCost.create({ data: { ...data, projectId: id } });
          }
        }
      }

      const costs = await tx.constructionCost.findMany({ where: { projectId: id } });
      const totalHarga = costs.reduce((sum, c) => sum + (c.totalHarga || 0), 0);
      const avgAACE = costs.length
        ? costs.reduce((sum, c) => sum + (c.aaceClass || 0), 0) / costs.length
        : 0;

      const project = await tx.project.update({
        where: { id },
        data: { harga: Math.round(totalHarga), levelAACE: Math.round(avgAACE) },
        include: { constructionCosts: true },
      });

      return project;
    });

    res.status(200).json({ message: 'Project updated successfully.', data: updated });
  } catch (error) {
    const status = error.message === 'Project not found' ? 404 : 400;
    res.status(status).json({ message: 'Failed to update project', error: error.message });
  }
};
