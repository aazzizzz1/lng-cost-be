const prisma = require('../config/db');
const jwt = require('jsonwebtoken'); // NEW

// NEW: helper to get requester from cookie or Authorization header
const getRequester = (req) => {
  const bearer = req.headers?.authorization;
  const token =
    req.cookies?.accessToken ||
    (bearer && bearer.startsWith('Bearer ') ? bearer.split(' ')[1] : null);
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET); // { userId, role }
  } catch {
    return null;
  }
};

exports.createProject = async (req, res) => {
  try {
    // NEW: must be authenticated and attach owner
    const requester = getRequester(req);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });
    const requesterId = requester.userId;
    const requesterRole = requester.role;

    const { constructionCosts, lokasi, infrastruktur, kategori, tahun, name, volume, inflasi, approval, satuan } = req.body;

    // Validate required fields
    if (!name || !infrastruktur || !lokasi || !kategori || !tahun) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    // NEW: validate workcode for each construction cost
    if (!Array.isArray(constructionCosts) || !constructionCosts.length) {
      return res.status(400).json({ message: 'Construction costs are required to create a project.' });
    }
    const missingWorkcode = constructionCosts.findIndex((c) => !c?.workcode);
    if (missingWorkcode !== -1) {
      return res.status(400).json({ message: `Construction cost at index ${missingWorkcode} is missing "workcode"` });
    }

    // Only admin is allowed to set approval; others default to false
    const approvedValue = requesterRole === 'admin' && typeof approval === 'boolean' ? approval : false;

    // Create the project with owner and approval (fallback if approval column not migrated yet)
    const baseData = {
      name,
      infrastruktur,
      lokasi,
      kategori,
      tahun,
      volume,
      inflasi: inflasi ?? 0,
      levelAACE: 0,
      harga: 0,
      // createdAt is defaulted by DB
      userId: requesterId,
    };
    // NEW: persist project-level "satuan" if provided
    if (satuan !== undefined) baseData.satuan = satuan;

    let project;
    try {
      project = await prisma.project.create({
        data: { ...baseData, approval: approvedValue }, // try with approval
      });
    } catch (e) {
      // Fallback if approval column not in current Prisma Client/migration yet
      if (String(e?.message || '').includes('Unknown argument `approval`')) {
        project = await prisma.project.create({ data: baseData });
      } else {
        throw e;
      }
    }

    // Bulk create construction costs associated with the project
    if (constructionCosts && constructionCosts.length > 0) {
      await prisma.constructionCost.createMany({
        data: constructionCosts.map((cost) => ({
          ...cost,
          projectId: project.id, // Ensure projectId is included
        })),
      });

      // Calculate total harga and average levelAACE
      const totalHarga = constructionCosts.reduce((sum, cost) => sum + (cost.totalHarga || 0), 0);
      const averageLevelAACE =
        constructionCosts.reduce((sum, cost) => sum + (cost.aaceClass || 0), 0) / constructionCosts.length;

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
    const requester = getRequester(req);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });
    const isAdmin = requester.role === 'admin';
    const where = isAdmin ? {} : { userId: requester.userId };

    const projects = await prisma.project.findMany({ where });
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
    const requester = getRequester(req);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });
    const isAdmin = requester.role === 'admin';
    const baseWhere = { NOT: { kategori: 'Auto-generated' } };
    const where = isAdmin ? baseWhere : { ...baseWhere, userId: requester.userId };

    const projects = await prisma.project.findMany({ where });
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
    const requester = getRequester(req);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });

    const project = await prisma.project.findUnique({
      where: { id: parseInt(id) },
      include: { constructionCosts: true },
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found', data: null });
    }

    const isAdmin = requester.role === 'admin';
    if (!isAdmin && project.userId !== requester.userId) {
      return res.status(403).json({ message: 'Forbidden' });
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
    const { name, infrastruktur, lokasi, volume, tahun, inflasi, proyek } = req.body; // tambah proyek

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
    const byVolume = new Map(); // vol -> { vol, items, map: Map(code->item), codes:Set, mapByCodeProject: Map(code|projectId -> item) }
    for (const up of unitPrices) {
      const numVol = parseVol(up.volume);
      if (isNaN(numVol)) continue;
      up._numVolume = numVol;
      if (!byVolume.has(numVol)) {
        byVolume.set(numVol, { vol: numVol, items: [], map: new Map(), codes: new Set(), mapByCodeProject: new Map() });
      }
      const bucket = byVolume.get(numVol);
      bucket.items.push(up);

      const code = norm(up.workcode);
      if (code) {
        // code-only map (legacy, used as fallback)
        if (!bucket.map.has(code)) bucket.map.set(code, up);
        bucket.codes.add(code);
        // NEW: map by workcode + projectId to keep items distinct per project
        const projKey = `${code}|${up.projectId ?? 'no_project'}`;
        if (!bucket.mapByCodeProject.has(projKey)) {
          bucket.mapByCodeProject.set(projKey, up);
        }
      }
    }
    const entries = Array.from(byVolume.values()).sort((a, b) => a.vol - b.vol);
    if (!entries.length || isNaN(targetVolume)) {
      return res.status(400).json({ message: 'Invalid volume data.' });
    }

    // Williams rule if only one entry
    let williamsRule = false;
    let nWilliams = 0.66;
    if (entries.length === 1) {
      williamsRule = true;
    }

    // Cari volume template terdekat
    let closestIdx = 0;
    let minDist = Math.abs(entries[0].vol - targetVolume);
    for (let i = 1; i < entries.length; i++) {
      const dist = Math.abs(entries[i].vol - targetVolume);
      if (
        dist < minDist ||
        (dist === minDist && entries[i].vol > entries[closestIdx].vol)
      ) {
        minDist = dist;
        closestIdx = i;
      }
    }
    // Jika target tepat di tengah dua volume, pilih yang lebih besar
    for (let i = 1; i < entries.length; i++) {
      const v1 = entries[i - 1].vol;
      const v2 = entries[i].vol;
      if (targetVolume > v1 && targetVolume < v2) {
        const mid = (v1 + v2) / 2;
        if (targetVolume === mid) {
          closestIdx = i;
        }
      }
    }

    // Ambil entry volume referensi
    let refEntry = entries[closestIdx];

    // FILTER: Jika proyek diberikan, filter items agar hanya proyek tsb,
    // dan rebuild map + mapByCodeProject (DUPLICATE WORKCODE TETAP DIPERTAHANKAN)
    if (proyek && refEntry) {
      const normProyek = proyek.trim().toLowerCase();
      refEntry.items = refEntry.items.filter(item => (item.proyek || '').trim().toLowerCase() === normProyek);
      // Rebuild maps for this filtered list
      refEntry.map = new Map();
      refEntry.codes = new Set();
      refEntry.mapByCodeProject = new Map();
      for (const item of refEntry.items) {
        const code = norm(item.workcode);
        if (!code) continue;
        if (!refEntry.map.has(code)) refEntry.map.set(code, item);
        refEntry.codes.add(code);
        const projKey = `${code}|${item.projectId ?? 'no_project'}`;
        if (!refEntry.mapByCodeProject.has(projKey)) {
          refEntry.mapByCodeProject.set(projKey, item);
        }
      }
    }

    // Perbaikan penentuan lowerEntry dan upperEntry untuk extrapolasi
    let lowerEntry = null, upperEntry = null;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].vol <= targetVolume) lowerEntry = entries[i];
      if (upperEntry === null && entries[i].vol >= targetVolume) upperEntry = entries[i];
    }
    // Untuk extrapolasi bawah dan atas, ambil dua volume terdekat
    if (targetVolume < entries[0].vol) {
      lowerEntry = entries[0];
      upperEntry = entries[1] || entries[0];
    } else if (targetVolume > entries[entries.length - 1].vol) {
      lowerEntry = entries[entries.length - 2] || entries[entries.length - 1];
      upperEntry = entries[entries.length - 1];
    }

    // Mode penentuan
    let mode = 'single';
    let pairEntry = null;
    let isExactVolume = refEntry.vol === targetVolume;
    if (isExactVolume) {
      mode = 'single';
      pairEntry = null;
    } else if (
      targetVolume < entries[0].vol && entries.length > 1
    ) {
      mode = 'extrapolation-below';
      pairEntry = upperEntry;
    } else if (
      targetVolume > entries[entries.length - 1].vol && entries.length > 1
    ) {
      mode = 'extrapolation-above';
      pairEntry = lowerEntry;
    } else if (lowerEntry && upperEntry && lowerEntry.vol !== upperEntry.vol) {
      mode = 'interpolation';
      pairEntry = upperEntry;
    }

    // Peta untuk interpolasi/extrapolasi qty per item
    const lowerMapCodeOnly = lowerEntry ? lowerEntry.map : new Map();
    const upperMapCodeOnly = upperEntry ? upperEntry.map : new Map();
    const lowerMapByCodeProject = lowerEntry ? (lowerEntry.mapByCodeProject || new Map()) : new Map();
    const upperMapByCodeProject = upperEntry ? (upperEntry.mapByCodeProject || new Map()) : new Map();
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

    // NEW: Iterate over refEntry.items to preserve duplicate workcodes in the template
    const recommendedCosts = [];
    for (const baseItem of refEntry.items) {
      const code = norm(baseItem.workcode);
      if (!code) continue;

      // Prefer same-project match for lower/upper entries; fallback to code-only
      const projKey = `${code}|${baseItem.projectId ?? 'no_project'}`;
      const lowerMatch = lowerMapByCodeProject.get(projKey) || lowerMapCodeOnly.get(code);
      const upperMatch = upperMapByCodeProject.get(projKey) || upperMapCodeOnly.get(code);

      let qty;
      let rumusQty;

      if (williamsRule) {
        // Williams rule: qty = qty_ref * (V_target / V_ref)^n
        const qtyRef = baseItem.qty || 0;
        const Vref = refEntry.vol;
        const Vtarget = targetVolume;
        qty = qtyRef * Math.pow(Vtarget / Vref, nWilliams);
        rumusQty = `qty (Williams rule) = ${qtyRef} * (${Vtarget} / ${Vref})^${nWilliams}`;
      } else if (isExactVolume && Number(baseItem._numVolume) === targetVolume) {
        qty = baseItem.qty || 0;
        rumusQty = `qty = ${qty} (exact volume match)`;
      } else if (
        lowerMatch && upperMatch && X2 !== X1
      ) {
        const Y1 = (lowerMatch.qty || 0);
        const Y2 = (upperMatch.qty || 0);
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

      // Inflasi + normalisasi CCI (dua tahap)
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
        hargaSatuan: hargaCCI,
        totalHarga: qty * hargaCCI,
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
      total: recommendedCosts.reduce((sum, c) => sum + c.totalHarga, 0),
      data: recommendedCosts,
      meta: {
        targetVolume,
        referenceVolume: refEntry.vol,
        referenceProject: proyek || null,
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
    const requester = getRequester(req);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const project = await prisma.project.findUnique({ where: { id: parseInt(id) }, select: { userId: true } });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const isAdmin = requester.role === 'admin';
    if (!isAdmin && project.userId !== requester.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

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
    const requester = getRequester(req);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const project = await prisma.project.findUnique({
      where: { id: parseInt(id) },
      include: { constructionCosts: true },
    });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const isAdmin = requester.role === 'admin';
    if (!isAdmin && project.userId !== requester.userId) {
      return res.status(403).json({ message: 'Forbidden' });
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
    const requester = getRequester(req);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });

    const id = parseInt(req.params.id);
    const isAdmin = requester.role === 'admin';

    // NEW: permission check before transaction
    const existing = await prisma.project.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) return res.status(404).json({ message: 'Project not found' });
    if (!isAdmin && existing.userId !== requester.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const {
      name, infrastruktur, lokasi, kategori, tahun, volume, inflasi,
      approval, constructionCosts, deleteConstructionCostIds, satuan, // NEW: read "satuan"
    } = req.body;

    const projectData = {};
    if (name !== undefined) projectData.name = name;
    if (infrastruktur !== undefined) projectData.infrastruktur = infrastruktur;
    if (lokasi !== undefined) projectData.lokasi = lokasi;
    if (kategori !== undefined) projectData.kategori = kategori;
    if (tahun !== undefined) projectData.tahun = tahun;
    if (volume !== undefined) projectData.volume = volume;
    if (inflasi !== undefined) projectData.inflasi = inflasi;
    if (satuan !== undefined) projectData.satuan = satuan; // NEW: update "satuan" when provided
    if (approval !== undefined && isAdmin) projectData.approval = !!approval;

    const allowedCostFields = [
      'workcode','uraian','specification','qty','satuan','hargaSatuan','totalHarga',
      'aaceClass','accuracyLow','accuracyHigh','tahun','infrastruktur','volume',
      'satuanVolume','kelompok','kelompokDetail','lokasi','tipe'
    ];

    const updated = await prisma.$transaction(async (tx) => {
      const exists = await tx.project.findUnique({ where: { id } });
      if (!exists) throw new Error('Project not found');

      if (Object.keys(projectData).length) {
        try {
          await tx.project.update({ where: { id }, data: projectData });
        } catch (e) {
          // Fallback if approval not available in current schema/migration
          if (String(e?.message || '').includes('Unknown argument `approval`')) {
            const { approval: _drop, ...withoutApproval } = projectData;
            await tx.project.update({ where: { id }, data: withoutApproval });
          } else {
            throw e;
          }
        }
      }

      if (Array.isArray(deleteConstructionCostIds) && deleteConstructionCostIds.length) {
        await tx.constructionCost.deleteMany({
          where: { id: { in: deleteConstructionCostIds }, projectId: id },
        });
      }

      if (Array.isArray(constructionCosts) && constructionCosts.length) {
        // NEW: ensure each cost has workcode
        const idx = constructionCosts.findIndex((c) => !c?.workcode);
        if (idx !== -1) throw new Error(`Construction cost at index ${idx} is missing "workcode"`);

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

exports.deleteAllProjects = async (req, res) => { // NEW
  try {
    const requester = getRequester(req);
    if (!requester || requester.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

    const counts = await prisma.$transaction(async (tx) => {
      const deletedCosts = await tx.constructionCost.deleteMany();
      const deletedProjects = await tx.project.deleteMany();
      return { deletedCosts: deletedCosts.count, deletedProjects: deletedProjects.count };
    });
    res.status(200).json({
      message: 'All projects and associated construction costs deleted successfully.',
      ...counts,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete all projects', error: error.message });
  }
};

exports.getApprovedProjects = async (req, res) => {
  try {
    const { infrastruktur, lokasi, tahun } = req.query || {};
    const where = { approval: true };
    if (infrastruktur) where.infrastruktur = { equals: infrastruktur, mode: 'insensitive' };
    if (lokasi) where.lokasi = { equals: lokasi, mode: 'insensitive' };
    if (tahun) where.tahun = Number(tahun);

    const projects = await prisma.project.findMany({
      where,
      orderBy: { id: 'desc' },
    });

    res.json({ message: 'Approved projects retrieved successfully.', data: projects });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch approved projects', error: error.message });
  }
};