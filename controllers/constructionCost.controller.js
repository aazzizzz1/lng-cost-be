const prisma = require('../config/db');

exports.createConstructionCost = async (req, res) => {
  try {
    const { projectName, ...constructionData } = req.body;

    let project = await prisma.project.findFirst({
      where: { name: projectName },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          name: projectName,
          infrastruktur: constructionData.tipe || 'Unknown', // Replace jenis dengan infrastruktur
          lokasi: constructionData.lokasi || 'Unknown',
          tahun: constructionData.tahun || new Date().getFullYear(),
          kategori: 'Auto-generated',
          levelAACE: 1,
          harga: 0, // Placeholder value
          volume: constructionData.volume ?? null, // NEW: simpan volume agar relasi name+volume valid
        },
      });
    }

    const allowed = [
      'workcode', // NEW
      'uraian','specification','qty','satuan','hargaSatuan','totalHarga',
      'aaceClass','accuracyLow','accuracyHigh','tahun','infrastruktur','volume',
      'satuanVolume','kelompok','kelompokDetail','lokasi','tipe'
    ];
    const data = {};
    for (const k of allowed) {
      if (constructionData[k] !== undefined) data[k] = constructionData[k];
    }

    const cost = await prisma.constructionCost.create({
      data: {
        ...data,
        projectId: project.id, // Associate with the newly created or existing project
      },
    });

    res.status(201).json({
      message: 'Construction cost created successfully.',
      data: cost,
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create construction cost', data: null });
  }
};

exports.getAllConstructionCosts = async (req, res) => {
  try {
    const costs = await prisma.constructionCost.findMany({
      include: { project: true },
    }); // Prevent over-fetching sensitive data
    res.json({
      message: 'Objects retrieved successfully.',
      data: costs,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch construction costs', data: null });
  }
};

exports.bulkCreateConstructionCosts = async (costs, projectId) => {
  try {
    const formattedCosts = costs.map((cost) => ({
      ...cost,
      projectId, // Associate with the project
    }));
    await prisma.constructionCost.createMany({ data: formattedCosts });
  } catch (error) {
    throw new Error('Failed to create construction costs.');
  }
};

exports.getUniqueInfrastruktur = async (req, res) => {
  try {
    // NEW: filter only construction costs from projects with kategori = 'Auto-generated'
    const groupedData = await prisma.constructionCost.findMany({
      where: { project: { kategori: 'Auto-generated' } }, // FILTER
      select: {
        tipe: true,
        infrastruktur: true,
        volume: true,
        satuanVolume: true,              // NEW: ambil satuanVolume
      },
    });

    const result = groupedData.reduce((acc, item) => {
      if (!acc[item.tipe]) acc[item.tipe] = {};
      if (!acc[item.tipe][item.infrastruktur]) acc[item.tipe][item.infrastruktur] = [];

      // Bentuk key unik volume+satuan untuk mencegah duplikasi
      const key = `${item.volume}__${item.satuanVolume || ''}`;
      const exists = acc[item.tipe][item.infrastruktur].some(v => v._key === key);

      if (!exists) {
        acc[item.tipe][item.infrastruktur].push({
          volume: item.volume,
            satuan: item.satuanVolume,                 // NEW: expose satuan terpisah
            label: `${item.volume} ${item.satuanVolume || ''}`.trim(), // NEW: gabungan untuk display
            _key: key // internal key (bisa diabaikan di FE)
        });
      }
      return acc;
    }, {});

    // Hapus _key sebelum kirim (opsional)
    Object.keys(result).forEach(t => {
      Object.keys(result[t]).forEach(infra => {
        result[t][infra] = result[t][infra].map(({ _key, ...rest }) => rest);
      });
    });

    res.status(200).json({
      message: 'Grouped values retrieved successfully (auto-generated projects only).',
      data: result,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch grouped values', data: null });
  }
};

/**
 * GET /api/construction-costs/filter
 * Query params (all optional, combined with AND):
 *  - tipe=string
 *  - infrastruktur=string
 *  - volume=number (exact match, e.g. 100 or 100.5)
 * Only returns costs from projects with kategori = 'Auto-generated'
 */
exports.getFilteredConstructionCosts = async (req, res) => {
  try {
    const { tipe, infrastruktur, volume } = req.query;

    const parsedVolume =
      volume !== undefined && !isNaN(parseFloat(volume)) ? parseFloat(volume) : undefined;

    const where = {
      project: { kategori: 'Auto-generated' }, // NEW: only from auto-generated projects (upload excel)
      ...(tipe ? { tipe } : {}),
      ...(infrastruktur ? { infrastruktur } : {}),
      ...(parsedVolume !== undefined ? { volume: parsedVolume } : {}),
    };

    const filteredCosts = await prisma.constructionCost.findMany({
      where,
      include: { project: true },
    });

    res.status(200).json({
      message: 'Filtered construction costs retrieved successfully.',
      data: filteredCosts,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch filtered construction costs', data: null });
  }
};

// NEW: Update ConstructionCost dan sinkronkan UnitPrice pada project yang sama (berdasarkan Project.name + volume + workcode)
exports.updateConstructionCost = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const allowed = [
      'workcode','uraian','specification','qty','satuan','hargaSatuan','totalHarga',
      'aaceClass','accuracyLow','accuracyHigh','tahun','infrastruktur','volume',
      'satuanVolume','kelompok','kelompokDetail','lokasi','tipe'
    ];
    const data = {};
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.constructionCost.findUnique({
        where: { id },
        select: { id: true, projectId: true, workcode: true, volume: true }
      });
      if (!before) throw new Error('ConstructionCost not found');

      const updated = await tx.constructionCost.update({ where: { id }, data });

      let syncedUnitPrices = 0;

      // Prefer projectId join
      const unitPrices = await tx.unitPrice.findMany({
        where: {
          projectId: before.projectId,
          workcode: before.workcode,
          ...(before.volume != null ? { volume: before.volume } : {})
        },
        select: { id: true, qty: true }
      });

      if (unitPrices.length) {
        const payloadKeys = new Set(Object.keys(data));
        for (const up of unitPrices) {
          const patch = {};
          if (payloadKeys.has('workcode')) patch.workcode = updated.workcode;
          if (payloadKeys.has('uraian')) patch.uraian = updated.uraian;
          if (payloadKeys.has('specification')) patch.specification = updated.specification;
          if (payloadKeys.has('satuan')) patch.satuan = updated.satuan;
          if (payloadKeys.has('hargaSatuan')) {
            patch.hargaSatuan = updated.hargaSatuan;
            patch.totalHarga = (up.qty || 0) * (updated.hargaSatuan || 0);
          }
          if (payloadKeys.has('volume')) patch.volume = updated.volume;
          if (Object.keys(patch).length) {
            await tx.unitPrice.update({ where: { id: up.id }, data: patch });
            syncedUnitPrices++;
          }
        }
      }

      // Recalc project
      const pCosts = await tx.constructionCost.findMany({ where: { projectId: before.projectId } });
      const totalHarga = pCosts.reduce((s, c) => s + (c.totalHarga || 0), 0);
      const avgAACE = pCosts.length ? pCosts.reduce((s, c) => s + (c.aaceClass || 0), 0) / pCosts.length : 0;
      await tx.project.update({
        where: { id: before.projectId },
        data: { harga: Math.round(totalHarga), levelAACE: Math.round(avgAACE) }
      });

      return { updated, syncedUnitPrices, projectId: before.projectId };
    });

    res.status(200).json({
      message: 'Construction cost updated & related unit prices synced (projectId).',
      data: result.updated,
      affected: { syncedUnitPrices: result.syncedUnitPrices, projectId: result.projectId }
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to update construction cost', error: error.message });
  }
};

// NEW: Delete ConstructionCost dan rekap ulang Project (hapus UnitPrice terkait jika kombinasi unik hilang)
exports.deleteConstructionCost = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    let deletedUnitPrices = 0;

    await prisma.$transaction(async (tx) => {
      const exists = await tx.constructionCost.findUnique({
        where: { id },
        select: { id: true, projectId: true, workcode: true, volume: true } // UPDATED: include workcode & volume
      });
      if (!exists) throw new Error('ConstructionCost not found');

      // Hapus construction cost
      await tx.constructionCost.delete({ where: { id } });

      // Cek apakah masih ada construction cost lain dengan kombinasi (projectId + workcode + volume)
      const stillExists = await tx.constructionCost.count({
        where: {
          projectId: exists.projectId,
          workcode: exists.workcode,
          volume: exists.volume
        }
      });

      // Jika tidak ada lagi, hapus UnitPrice terkait kombinasi ini
      if (stillExists === 0) {
        const delUP = await tx.unitPrice.deleteMany({
          where: {
            projectId: exists.projectId,
            workcode: exists.workcode,
            volume: exists.volume
          }
        });
        deletedUnitPrices = delUP.count;
      }

      // Recalculate project aggregate
      const costs = await tx.constructionCost.findMany({ where: { projectId: exists.projectId } });
      const totalHarga = costs.reduce((sum, c) => sum + (c.totalHarga || 0), 0);
      const avgAACE = costs.length
        ? costs.reduce((sum, c) => sum + (c.aaceClass || 0), 0) / costs.length
        : 0;

      await tx.project.update({
        where: { id: exists.projectId },
        data: { harga: Math.round(totalHarga), levelAACE: Math.round(avgAACE) }
      });
    });

    res.status(200).json({
      message: 'Construction cost deleted and project totals recalculated.',
      affected: { deletedUnitPrices }
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to delete construction cost', error: error.message });
  }
};

// NEW: bulk delete all construction costs + reset all project totals
exports.deleteAllConstructionCosts = async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.constructionCost.deleteMany();
      await tx.project.updateMany({ data: { harga: 0, levelAACE: 0 } });
    });
    res.status(200).json({ message: 'All construction costs deleted. All projects reset.' });
  } catch (error) {
    res.status(400).json({ message: 'Failed to delete all construction costs', error: error.message });
  }
};
