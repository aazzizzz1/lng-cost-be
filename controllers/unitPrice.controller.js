const prisma = require('../config/db');

exports.createUnitPrice = async (req, res) => {
  try {
    const allowed = [
      'workcode','uraian','specification','qty','satuan','hargaSatuan','totalHarga',
      'aaceClass','accuracyLow','accuracyHigh','tahun','infrastruktur',
      'volume','satuanVolume','kelompok','kelompokDetail','proyek','lokasi','tipe','projectId' // NEW
    ];
    const data = {};
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
    // NEW: force totalHarga = qty * hargaSatuan
    const qty = Number(data.qty ?? 0);
    const harga = Number(data.hargaSatuan ?? 0);
    data.totalHarga = qty * harga;

    // NEW: auto-resolve projectId if not provided but proyek + volume ada
    if (!data.projectId && data.proyek && data.volume != null) {
      const project = await prisma.project.findFirst({
        where: {
          name: { equals: data.proyek, mode: 'insensitive' },
          volume: data.volume
        },
        select: { id: true }
      });
      if (project) data.projectId = project.id;
    }

    const unitPrice = await prisma.unitPrice.create({ data });
    res.status(201).json({ message: 'Unit price created successfully.', data: unitPrice });
  } catch {
    res.status(400).json({ message: 'Failed to create unit price', data: null });
  }
};

exports.getAllUnitPrices = async (req, res) => {
  try {
    const { page = 1, limit = 10, sort, order, search, tipe, infrastruktur, kelompok, volume, minVolume, maxVolume } = req.query;

    // NEW: normalize page/limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    const filters = {};
    if (tipe) filters.tipe = { equals: tipe.toLowerCase(), mode: 'insensitive' };
    if (infrastruktur) filters.infrastruktur = { equals: infrastruktur.toLowerCase(), mode: 'insensitive' };
    if (kelompok) filters.kelompok = { equals: kelompok.toLowerCase(), mode: 'insensitive' };

    // NEW: helper to parse numeric (supports "125,5")
    const parseNum = (v) => {
      if (v === undefined || v === null) return undefined;
      const n = parseFloat(String(v).replace(',', '.'));
      return Number.isNaN(n) ? undefined : n;
    };

    // Volume filter: supports exact/list; if absent, support minVolume/maxVolume range
    if (volume) {
      if (typeof volume === 'string' && volume.includes(',')) {
        const vols = volume
          .split(',')
          .map(v => parseNum(v.trim()))
          .filter(v => v !== undefined);
        if (vols.length) filters.volume = { in: vols };
      } else {
        const v = parseNum(volume);
        if (v !== undefined) filters.volume = { equals: v };
      }
    } else {
      const minV = parseNum(minVolume);
      const maxV = parseNum(maxVolume);
      if (minV !== undefined || maxV !== undefined) {
        filters.volume = {
          ...(minV !== undefined ? { gte: minV } : {}),
          ...(maxV !== undefined ? { lte: maxV } : {}),
        };
      }
    }

    if (search) {
      filters.OR = [
        { uraian: { contains: search.toLowerCase(), mode: 'insensitive' } },
        { specification: { contains: search.toLowerCase(), mode: 'insensitive' } },
      ];
    }

    const total = await prisma.unitPrice.count({ where: filters });
    const totalPages = Math.ceil(total / limitNum);

    if (pageNum > totalPages && totalPages > 0) {
      return res.status(400).json({
        message: 'Page exceeds total data available.',
        totalData: total,
        totalPages,
      });
    }

    const unitPrices = await prisma.unitPrice.findMany({
      where: filters,
      orderBy: { [sort || 'createdAt']: order || 'asc' }, // Default sorting applied if empty
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    res.json({
      message: 'Objects retrieved successfully.',
      data: unitPrices,
      pagination: {
        totalData: total,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error fetching unit prices:', error);
    res.status(500).json({ message: 'Failed to fetch unit prices', error: error.message });
  }
};

// NEW: get all unit prices without filters/pagination
exports.getAllUnitPricesAll = async (req, res) => {
  try {
    const unitPrices = await prisma.unitPrice.findMany({
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      message: 'All unit prices retrieved successfully.',
      data: unitPrices,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all unit prices', error: error.message });
  }
};

exports.deleteAllUnitPrices = async (req, res) => {
  try {
    await prisma.unitPrice.deleteMany(); // Deletes all records in the UnitPrice table
    res.status(200).json({
      message: 'All unit prices have been deleted successfully.',
      data: null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete unit prices', data: null });
  }
};

exports.getUniqueFields = async (req, res) => {
  try {
    const unitPrices = await prisma.unitPrice.findMany({
      select: { tipe: true, infrastruktur: true, kelompok: true },
    });

    // Helper function to normalize strings (trim, lowercase)
    const normalize = (str) => {
      if (!str) return '';
      return str.trim().toLowerCase();
    };

    const groupedData = unitPrices.reduce((acc, item) => {
      const tipe = item.tipe?.trim();
      const infrastruktur = item.infrastruktur?.trim();
      const kelompok = item.kelompok?.trim();

      // Exclude entries with missing tipe, infrastruktur, or kelompok
      if (!tipe || !infrastruktur || !kelompok) return acc;

      if (!acc[tipe]) acc[tipe] = {};
      if (!acc[tipe][infrastruktur]) acc[tipe][infrastruktur] = [];
      
      // Only add kelompok if it's not empty and not already included
      if (kelompok && !acc[tipe][infrastruktur].includes(kelompok)) {
        acc[tipe][infrastruktur].push(kelompok);
      }

      return acc;
    }, {});

    // Sort kelompok arrays in ascending order
    Object.keys(groupedData).forEach((tipe) => {
      Object.keys(groupedData[tipe]).forEach((infrastruktur) => {
        groupedData[tipe][infrastruktur].sort((a, b) => a.localeCompare(b));
      });
    });

    res.json({
      message: 'Unique fields grouped successfully.',
      data: groupedData,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch unique fields', data: null });
  }
};

exports.recommendUnitPrices = async (req, res) => {
  try {
    const { name, infrastruktur, lokasi, volume, tahun, inflasi } = req.body;

    // Step 1: Query UnitPrice for matching items (read-only)
    const unitPrices = await prisma.unitPrice.findMany({
      where: {
        infrastruktur: { equals: infrastruktur.toLowerCase(), mode: 'insensitive' },
        volume: { lte: volume },
      },
      orderBy: { volume: 'desc' },
    });

    if (unitPrices.length === 0) {
      return res.status(400).json({ message: 'No matching UnitPrice items found for recommendation.' });
    }

    // Step 2: Filter items to only include those with the closest matching volume
    const closestVolume = unitPrices[0].volume;
    const filteredUnitPrices = unitPrices.filter((item) => item.volume === closestVolume);

    // Step 3: Fetch CCI for a province with a value within ±100 dynamically
    const cciReference = await prisma.cci.findFirst({
      where: {
        cci: { gte: 100, lte: 100 },
      },
    });

    if (!cciReference) {
      return res.status(400).json({ message: 'CCI reference data not found.' });
    }

    // Step 4: Fetch CCI for the project location
    const projectCCI = await prisma.cci.findFirst({
      where: { provinsi: { equals: lokasi, mode: 'insensitive' } },
    });

    if (!projectCCI) {
      return res.status(400).json({ message: 'CCI data not found for the specified location.' });
    }

    const calculateQuantityUsingCapacityFactor = (baseQty, baseVolume, targetVolume) => {
      const factor = 0.73;
      return baseQty * Math.pow(targetVolume / baseVolume, factor);
    };

    // Semua perhitungan dilakukan di objek baru, tidak mengubah/mengupdate tabel UnitPrice
    const recommendedCosts = await Promise.all(
      filteredUnitPrices.map(async (item) => {
        const hargaSatuanItem = item.hargaSatuan || item.harga || 0;

        // Step 5: Adjust price based on inflation
        const n = Number(tahun) - Number(item.tahun || tahun);
        const r = Number(inflasi) / 100;
        let hargaTahunProject = hargaSatuanItem;
        if (n > 0) {
          hargaTahunProject = hargaSatuanItem * Math.pow(1 + r, n);
        }

        // Step 6: Convert price to reference CCI
        const cciItem = await prisma.cci.findFirst({
          where: { provinsi: { equals: item.lokasi || lokasi, mode: 'insensitive' } },
        });
        const cciItemValue = cciItem ? cciItem.cci : 100;
        let hargaReferenceCCI = hargaTahunProject * (cciReference.cci / cciItemValue);

        // Step 7: Convert price to project location CCI
        let hargaLokasiProject = hargaReferenceCCI * (projectCCI.cci / cciReference.cci);

        // Step 8: Adjust quantity using capacity factor
        const adjustedQty = calculateQuantityUsingCapacityFactor(
          item.qty || 1,
          item.volume || 1,
          volume || 1
        );

        // Return hasil rekomendasi sebagai objek baru, tidak mengubah tabel UnitPrice
        return {
          ...item,
          tahun: tahun,
          proyek: name,
          lokasi: lokasi,
          qty: adjustedQty, // tidak dibulatkan
          hargaSatuan: Math.round(hargaLokasiProject),
          totalHarga: Math.round(adjustedQty * hargaLokasiProject), // gunakan nilai asli adjustedQty
          volume: volume,
        };
      })
    );

    res.status(200).json({
      message: 'Recommended unit prices retrieved successfully.',
      data: recommendedCosts,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to recommend unit prices', error: error.message });
  }
};

// Endpoint untuk chart diagram: labels = infrastruktur unik, series = jumlah item per infrastruktur
exports.getUnitPriceChartData = async (req, res) => {
  try {
    // Ambil semua unit price, hanya field infrastruktur
    const unitPrices = await prisma.unitPrice.findMany({
      select: { infrastruktur: true }
    });

    // Hitung jumlah item per infrastruktur
    const countMap = {};
    unitPrices.forEach(item => {
      const infra = (item.infrastruktur || '').trim();
      if (!infra) return;
      countMap[infra] = (countMap[infra] || 0) + 1;
    });

    // Urutkan label secara alfabetis
    const labels = Object.keys(countMap).sort((a, b) => a.localeCompare(b));
    const series = labels.map(label => countMap[label]); // FIX: removed stray token

    res.json({
      message: 'Chart data retrieved successfully.',
      labels,
      series
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch chart data', error: error.message });
  }
};

// NEW: Get unique infrastruktur and proyek (show all infrastruktur, proyek only if same volume)
exports.getUniqueInfrastrukturAndProyek = async (req, res) => {
  try {
    const unitPrices = await prisma.unitPrice.findMany({
      select: { infrastruktur: true, volume: true, proyek: true },
    });

    // Step 1: Kelompokkan per infrastruktur dan volume
    const infraMap = {};
    for (const item of unitPrices) {
      const infra = (item.infrastruktur || '').trim();
      const vol = item.volume != null ? String(item.volume) : '';
      const proyek = (item.proyek || '').trim();
      if (!infra || !vol) continue;
      if (!infraMap[infra]) infraMap[infra] = {};
      if (!infraMap[infra][vol]) infraMap[infra][vol] = new Set();
      if (proyek) infraMap[infra][vol].add(proyek);
    }

    // Step 2: Untuk setiap infrastruktur, cek volume yang sama (duplikat)
    const result = {};
    Object.keys(infraMap).forEach(infra => {
      const volumes = Object.keys(infraMap[infra]);
      // Cari volume yang muncul lebih dari satu proyek (duplikat volume)
      const proyekSet = new Set();
      volumes.forEach(vol => {
        if (infraMap[infra][vol].size > 1) {
          infraMap[infra][vol].forEach(proyek => proyekSet.add(proyek));
        }
      });
      result[infra] = Array.from(proyekSet); // kosong jika tidak ada volume sama
    });

    res.json({
      message: 'Unique infrastruktur and proyek (with same volume) grouped successfully.',
      data: result,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch unique infrastruktur/proyek', data: null });
  }
};

// NEW: Get best price per workcode with outlier analysis
exports.getBestPricesByWorkcode = async (req, res) => {
  try {
    // Parse filters from query
    const { search, infrastruktur, kelompok } = req.query;

    // Build case-insensitive filters, support comma-separated lists for infrastruktur/kelompok
    const AND = [];

    if (search) {
      AND.push({
        OR: [
          { uraian: { contains: String(search), mode: 'insensitive' } },
          { specification: { contains: String(search), mode: 'insensitive' } },
          { workcode: { contains: String(search), mode: 'insensitive' } },
        ],
      });
    }

    const buildOREquals = (field, raw) => {
      const vals = String(raw)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      if (!vals.length) return null;
      if (vals.length === 1) return { [field]: { equals: vals[0], mode: 'insensitive' } };
      return {
        OR: vals.map(v => ({ [field]: { equals: v, mode: 'insensitive' } })),
      };
    };

    const infraFilter = infrastruktur ? buildOREquals('infrastruktur', infrastruktur) : null;
    const kelompokFilter = kelompok ? buildOREquals('kelompok', kelompok) : null;
    if (infraFilter) AND.push(infraFilter);
    if (kelompokFilter) AND.push(kelompokFilter);

    const where = AND.length ? { AND } : undefined;

    // 1. Fetch filtered unit prices
    const unitPrices = await prisma.unitPrice.findMany({ where });

    // 2. Group by workcode
    const grouped = {};
    for (const item of unitPrices) {
      const code = item.workcode || 'NO_WORKCODE';
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(item);
    }

    // Helper functions
    const median = arr => {
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    const mad = (arr, med) => {
      const deviations = arr.map(x => Math.abs(x - med));
      return median(deviations);
    };

    // REPLACED: IQR helper to match Excel QUARTILE.INC (PERCENTILE.INC)
    // NEW: percentileInc with linear interpolation (inclusive)
    const percentileInc = (sorted, p) => {
      if (!sorted.length) return NaN;
      const n = sorted.length;
      if (n === 1) return sorted[0];
      const h = (n - 1) * p;        // 0-based rank
      const l = Math.floor(h);
      const u = Math.ceil(h);
      if (l === u) return sorted[l];
      return sorted[l] + (h - l) * (sorted[u] - sorted[l]);
    };

    // Use Excel-compatible Q1/Q3 so LOW/HIGH match spreadsheet results
    const iqr = arr => {
      const sorted = [...arr]
        .filter(v => typeof v === 'number' && !Number.isNaN(v))
        .sort((a, b) => a - b);
      const q1 = percentileInc(sorted, 0.25);
      const q3 = percentileInc(sorted, 0.75);
      return { q1, q3, iqr: q3 - q1 };
    };

    // NEW: constants for MAD modified Z-score method
    const ZSCORE_THRESHOLD = 3.5;
    const MAD_Z_COEF = 0.6745;

    // 3. Analyze each group
    const recommendations = [];
    for (const [workcode, items] of Object.entries(grouped)) {
      // Consider only items with numeric hargaSatuan
      const pricedItems = items.filter(i => typeof i.hargaSatuan === 'number' && !Number.isNaN(i.hargaSatuan));
      const prices = pricedItems.map(i => i.hargaSatuan);

      let recommended = null;
      let analysis = {};
      // Show all columns for composingPrices (keep as-is)
      let composingPrices = items.map(i => ({
        id: i.id,
        workcode: i.workcode,
        uraian: i.uraian,
        specification: i.specification,
        qty: i.qty,
        satuan: i.satuan,
        hargaSatuan: i.hargaSatuan,
        totalHarga: i.totalHarga,
        aaceClass: i.aaceClass,
        accuracyLow: i.accuracyLow,
        accuracyHigh: i.accuracyHigh,
        tahun: i.tahun,
        infrastruktur: i.infrastruktur,
        volume: i.volume,
        satuanVolume: i.satuanVolume,
        kelompok: i.kelompok,
        kelompokDetail: i.kelompokDetail,
        proyek: i.proyek,
        lokasi: i.lokasi,
        tipe: i.tipe,
        createdAt: i.createdAt,
        // NEW: default result label for later enrichment
        result: 'N/A',
      }));

      if (prices.length === 1) {
        recommended = prices[0];
        analysis.method = 'single';
        // NEW: mark the single priced item as OK
        var idToFlag = new Map(pricedItems.map(i => [i.id, { ok: true }]));
      } else if (prices.length === 2) {
        recommended = Math.min(...prices);
        analysis.method = 'min-of-two';
        // NEW: both are considered OK (no outlier test for 2 samples)
        var idToFlag = new Map(pricedItems.map(i => [i.id, { ok: true }]));
      } else if (prices.length === 3) {
        // Median & MAD outlier analysis with final AVERAGE VALUE (mean of inliers)
        const med = median(prices);
        const deviations = prices.map(x => Math.abs(x - med));
        const madVal = mad(prices, med);
        const zscores = deviations.map(d => madVal === 0 ? 0 : MAD_Z_COEF * (d / madVal));
        const outliers = zscores.map(z => z > ZSCORE_THRESHOLD);

        // AVERAGE VALUE = mean of non-outlier prices; fallback to median if all are outliers
        const inlierPrices = prices.filter((_, idx) => !outliers[idx]);
        const avgValue = inlierPrices.length
          ? inlierPrices.reduce((a, b) => a + b, 0) / inlierPrices.length
          : med;

        recommended = avgValue;
        analysis = {
          method: 'median-mad-average',
          median: med,
          deviations,
          mad: madVal,
          zscores,
          threshold: ZSCORE_THRESHOLD,
          outliers,
          resultFlags: outliers.map(o => (o ? 'OUTLIER' : 'OK')),
          inlierPrices,
          averageValue: avgValue, // final value used
        };

        // NEW: attach OK/OUTLIER and z-score per priced item
        var idToFlag = new Map(pricedItems.map((i, idx) => [i.id, { ok: !outliers[idx], zscore: zscores[idx] }]));
      } else if (prices.length >= 4) {
        // Interquartile Range outlier analysis with LOW/HIGH and AVERAGE VALUE = mean of inliers
        const { q1, q3, iqr: iqrVal } = iqr(prices);
        const low = q1 - 1.5 * iqrVal;
        const high = q3 + 1.5 * iqrVal;
        const inlierMask = prices.map(p => p >= low && p <= high);
        const filtered = prices.filter((_, idx) => inlierMask[idx]);
        recommended = filtered.length ? filtered.reduce((a, b) => a + b, 0) / filtered.length : null;
        analysis = {
          method: 'iqr-average',
          q1, q3, iqr: iqrVal, low, high,
          filteredPrices: filtered,
          outliers: inlierMask.map(ok => !ok),
          resultFlags: inlierMask.map(ok => (ok ? 'OK' : 'OUTLIER')),
          averageValue: recommended,
        };

        // NEW: attach OK/OUTLIER per priced item (IQR method)
        var idToFlag = new Map(pricedItems.map((i, idx) => [i.id, { ok: inlierMask[idx] }]));
      }

      // NEW: enrich composingPrices rows with result and (for MAD) z-score
      if (idToFlag) {
        composingPrices = composingPrices.map(row => {
          const info = idToFlag.get(row.id);
          return {
            ...row,
            result: info ? (info.ok ? 'OK' : 'OUTLIER') : row.result,
            ...(info && info.zscore != null ? { zscore: info.zscore } : {})
          };
        });
      }

      // Pick recommended item (full record) closest to recommendedPrice
      let recommendedItem = null;
      if (recommended != null && pricedItems.length) {
        recommendedItem = pricedItems.reduce((best, curr) => {
          if (!best) return curr;
          const bestDiff = Math.abs(best.hargaSatuan - recommended);
          const currDiff = Math.abs(curr.hargaSatuan - recommended);
          return currDiff < bestDiff ? curr : best;
        }, null);
      }

      recommendations.push({
        workcode,
        recommendedPrice: recommended,
        recommendedItem, // Full row with other columns from table harga satuan
        composingPrices,
        analysis,
      });
    }

    res.json({
      message: 'Best price recommendation per workcode with outlier analysis.',
      recommendations,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get best prices', error: error.message });
  }
};

// NEW: Update UnitPrice dan sinkronkan ConstructionCost pada project yang sama (berdasarkan nama project + volume + workcode)
exports.updateUnitPrice = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const allowed = [
      'workcode','uraian','specification','qty','satuan','hargaSatuan','totalHarga',
      'aaceClass','accuracyLow','accuracyHigh','tahun','infrastruktur',
      'volume','satuanVolume','kelompok','kelompokDetail','proyek','lokasi','tipe','projectId' // NEW
    ];
    const data = {};
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.unitPrice.findUnique({ where: { id } });
      if (!before) throw new Error('UnitPrice not found');

      // Recompute totalHarga
      const nextQty = data.qty !== undefined ? Number(data.qty) : Number(before.qty || 0);
      const nextHarga = data.hargaSatuan !== undefined ? Number(data.hargaSatuan) : Number(before.hargaSatuan || 0);
      const updatePayload = { ...data, totalHarga: nextQty * nextHarga };

      // Resolve projectId if still missing and proyek+volume tersedia
      if (!updatePayload.projectId && (before.projectId == null)) {
        const nameRef = data.proyek || before.proyek;
        const volRef = data.volume != null ? data.volume : before.volume;
        if (nameRef && volRef != null) {
          const p = await tx.project.findFirst({
            where: { name: { equals: nameRef, mode: 'insensitive' }, volume: volRef },
            select: { id: true }
          });
            if (p) updatePayload.projectId = p.id;
        }
      }

      const updated = await tx.unitPrice.update({ where: { id }, data: updatePayload });

      // Determine affected projectIds
      let projectIds = [];
      if (updated.projectId) {
        projectIds = [updated.projectId];
      } else {
        // fallback legacy: name + volume
        const projects = await tx.project.findMany({
          where: {
            name: { equals: (before.proyek || '').trim(), mode: 'insensitive' },
            ...(before.volume != null ? { volume: before.volume } : {})
          },
          select: { id: true }
        });
        projectIds = projects.map(p => p.id);
      }

      let updatedCostCount = 0;
      if (projectIds.length) {
        const costs = await tx.constructionCost.findMany({
          where: {
            projectId: { in: projectIds },
            workcode: before.workcode,
            ...(before.volume != null ? { volume: before.volume } : {})
          },
          select: { id: true, qty: true, projectId: true }
        });

        const payloadKeys = new Set(Object.keys(data));
        for (const cost of costs) {
          const patch = {};
            if (payloadKeys.has('workcode')) patch.workcode = updated.workcode;
            if (payloadKeys.has('uraian')) patch.uraian = updated.uraian;
            if (payloadKeys.has('specification')) patch.specification = updated.specification;
            if (payloadKeys.has('satuan')) patch.satuan = updated.satuan;
            if (payloadKeys.has('hargaSatuan')) {
              patch.hargaSatuan = updated.hargaSatuan;
              patch.totalHarga = (cost.qty || 0) * (updated.hargaSatuan || 0);
            }
            if (payloadKeys.has('volume')) patch.volume = updated.volume;

          if (Object.keys(patch).length) {
            await tx.constructionCost.update({ where: { id: cost.id }, data: patch });
            updatedCostCount++;
          }
        }

        const affectedProjectIds = [...new Set(costs.map(c => c.projectId))];
        for (const pid of affectedProjectIds) {
          const pCosts = await tx.constructionCost.findMany({ where: { projectId: pid } });
          const totalHarga = pCosts.reduce((s, c) => s + (c.totalHarga || 0), 0);
          const avgAACE = pCosts.length ? pCosts.reduce((s, c) => s + (c.aaceClass || 0), 0) / pCosts.length : 0;
          await tx.project.update({
            where: { id: pid },
            data: { harga: Math.round(totalHarga), levelAACE: Math.round(avgAACE) }
          });
        }
      }

      return { updated, updatedCostCount, projectIds };
    });

    res.json({
      message: 'Unit price updated and related construction costs synced (projectId preferred).',
      data: result.updated,
      affected: { updatedCosts: result.updatedCostCount, affectedProjects: result.projectIds }
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to update unit price', error: error.message });
  }
};

// NEW: Delete UnitPrice by id + delete linked ConstructionCost (match by project name + volume + workcode) and recalc projects
exports.deleteUnitPriceById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.unitPrice.findUnique({ where: { id } });
      if (!before) throw new Error('UnitPrice not found');

      const projectName = (before.proyek || '').trim();
      const unitVol = before.volume;
      let affectedProjectIds = [];

      // Hapus construction cost yang terhubung: proyek (nama) + volume + workcode
      let deletedCosts = 0;
      if (projectName) {
        const projects = await tx.project.findMany({
          where: {
            name: { equals: projectName, mode: 'insensitive' },
            ...(unitVol != null ? { volume: unitVol } : {}),
          },
          select: { id: true }
        });
        const projectIds = projects.map(p => p.id);

        if (projectIds.length) {
          const delRes = await tx.constructionCost.deleteMany({
            where: {
              projectId: { in: projectIds },
              workcode: before.workcode,
              ...(unitVol != null ? { volume: unitVol } : {}),
            }
          });
          deletedCosts = delRes.count;
          affectedProjectIds = projectIds;
        }
      }

      // Hapus unit price
      await tx.unitPrice.delete({ where: { id } });

      // Recalc tiap project terdampak
      for (const pid of affectedProjectIds) {
        const costs = await tx.constructionCost.findMany({ where: { projectId: pid } });
        const totalHarga = costs.reduce((sum, c) => sum + (c.totalHarga || 0), 0);
        const avgAACE = costs.length
          ? costs.reduce((sum, c) => sum + (c.aaceClass || 0), 0) / costs.length
          : 0;

        await tx.project.update({
          where: { id: pid },
          data: { harga: Math.round(totalHarga), levelAACE: Math.round(avgAACE) }
        });
      }

      return { deletedCosts, affectedProjectIds };
    });

    res.status(200).json({
      message: 'Unit price deleted. Related construction costs (by project + volume + workcode) removed.',
      affected: {
        deletedConstructionCosts: result.deletedCosts,
        affectedProjects: result.affectedProjectIds
      }
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to delete unit price', error: error.message });
  }
};
