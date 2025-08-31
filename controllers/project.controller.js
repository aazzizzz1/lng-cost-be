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

    // Kumpulkan per volume, siapkan map per workcode di setiap volume
    const norm = (s) => (s || '').trim().toLowerCase();
    const byVolume = new Map(); // vol -> { vol, items, map: Map(code->item), codes:Set }
    for (const up of unitPrices) {
      const numVol = parseVol(up.volume);
      if (isNaN(numVol)) continue;
      up._numVolume = numVol;
      if (!byVolume.has(numVol)) {
        byVolume.set(numVol, { vol: numVol, items: [], map: new Map(), codes: new Set() });
      }
      const bucket = byVolume.get(numVol);
      bucket.items.push(up);
      const code = norm(up.workcode);
      if (code) {
        if (!bucket.map.has(code)) bucket.map.set(code, up);
        bucket.codes.add(code);
      }
    }
    const entries = Array.from(byVolume.values()).sort((a, b) => a.vol - b.vol);
    if (!entries.length || isNaN(targetVolume)) {
      return res.status(400).json({ message: 'Invalid volume data.' });
    }

    // Temukan lower/upper di sekitar target (tanpa fallback ke indeks valid)
    let lowerIdx = -1;
    let upperIdx = -1;
    for (let i = 0; i < entries.length; i++) {
      const v = entries[i].vol;
      if (v <= targetVolume) lowerIdx = i;
      if (upperIdx === -1 && v >= targetVolume) upperIdx = i;
    }

    // Siapkan entries untuk perhitungan
    let lowerEntry = lowerIdx !== -1 ? entries[lowerIdx] : null;
    let upperEntry = upperIdx !== -1 ? entries[upperIdx] : null;

    let mode = 'single';
    let refEntry = null;
    let pairEntry = null;

    const belowRange = lowerIdx === -1;
    const aboveRange = upperIdx === -1;

    // isExactVolume hanya true jika benar-benar ketemu volume yang sama (bukan hasil fallback)
    let isExactVolume = false;

    if (belowRange && entries.length >= 1) {
      // extrapolasi di bawah range database
      mode = 'extrapolation-below';
      refEntry = entries[0];
      pairEntry = entries[1] || null;
      // gunakan pasangan [min, next] untuk perhitungan qty (X1, X2)
      lowerEntry = refEntry;
      upperEntry = pairEntry || refEntry;
    } else if (aboveRange && entries.length >= 1) {
      // extrapolasi di atas range database
      mode = 'extrapolation-above';
      refEntry = entries[entries.length - 1];
      pairEntry = entries[entries.length - 2] || null;
      // gunakan pasangan [prev, max] untuk perhitungan qty (X1, X2)
      lowerEntry = pairEntry || refEntry;
      upperEntry = refEntry;
    } else {
      // di dalam range database
      isExactVolume = lowerEntry && upperEntry && lowerEntry.vol === upperEntry.vol;
      // pilih reference volume terdekat (jika seri, pilih lower)
      refEntry = isExactVolume
        ? lowerEntry
        : (Math.abs(targetVolume - lowerEntry.vol) <= Math.abs(upperEntry.vol - targetVolume) ? lowerEntry : upperEntry);
      mode = isExactVolume ? 'single' : 'interpolation';
      pairEntry = refEntry === lowerEntry ? upperEntry : lowerEntry;
    }

    // Peta untuk interpolasi/extrapolasi qty per item
    const lowerMap = lowerEntry ? lowerEntry.map : new Map();
    const upperMap = upperEntry ? upperEntry.map : new Map();
    const X1 = lowerEntry ? lowerEntry.vol : refEntry.vol;
    const X2 = upperEntry ? upperEntry.vol : refEntry.vol;

    // CCI target lokasi dan referensi 100
    const cciRef = await prisma.cci.findFirst({ where: { cci: { gte: 100, lte: 100 } } });
    const cciRefValue = cciRef ? cciRef.cci : 100;
    const cciLokasi = await prisma.cci.findFirst({
      where: { provinsi: { equals: lokasi, mode: 'insensitive' } },
    });
    const cciLokasiValue = cciLokasi ? cciLokasi.cci : 100;

    // Cache CCI asal item
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

    // Hanya gunakan item dari volume referensi
    const recommendedCosts = [];
    for (const code of refEntry.codes) {
      const baseItem = refEntry.map.get(code);
      if (!baseItem) continue;

      let qty;
      let rumusQty;

      if (isExactVolume && Number(baseItem._numVolume) === targetVolume) {
        qty = baseItem.qty || 0;
        rumusQty = `qty = ${qty} (exact volume match)`;
      } else if (lowerEntry && upperEntry && lowerMap.has(code) && upperMap.has(code) && X2 !== X1) {
        const Y1 = (lowerMap.get(code).qty || 0);
        const Y2 = (upperMap.get(code).qty || 0);
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
        rumusQty = `qty = ${qty} (reference volume only)`;
      }

      // Jika hasil negatif, fallback ke qty asli
      if (qty < 0) {
        const originalQty = baseItem.qty || 0;
        rumusQty += ` => result negative (${qty}), fallback to original qty ${originalQty}`;
        qty = originalQty;
      }

      // Inflasi + normalisasi CCI (dua tahap) tetap sama
      const n = Number(tahun) - Number(baseItem.tahun || tahun);
      const hargaInflasi = (baseItem.hargaSatuan || 0) * Math.pow(1 + r, n);
      const cciOriginalValue = await getCCIValue(baseItem.lokasi);
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
        rumusBenchmark,
        rumusHargaCCI,
        toBenchmark,
        _mode: mode,
        _referenceVolume: refEntry.vol
      });
    }

    res.status(200).json({
      message: 'Recommended construction costs retrieved successfully.',
      data: recommendedCosts,
      meta: {
        targetVolume,
        referenceVolume: refEntry.vol,
        neighborVolume: pairEntry ? pairEntry.vol : null,
        mode,
        itemCount: recommendedCosts.length
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