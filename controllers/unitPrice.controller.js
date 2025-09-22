const prisma = require('../config/db');

exports.createUnitPrice = async (req, res) => {
  try {
    const allowed = [
      'workcode', // NEW
      'uraian','specification','qty','satuan','hargaSatuan','totalHarga',
      'aaceClass','accuracyLow','accuracyHigh','tahun','infrastruktur',
      'volume','satuanVolume','kelompok','kelompokDetail','proyek','lokasi','tipe'
    ];
    const data = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    }
    const unitPrice = await prisma.unitPrice.create({ data });
    res.status(201).json({
      message: 'Unit price created successfully.',
      data: unitPrice,
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create unit price', data: null });
  }
};

exports.getAllUnitPrices = async (req, res) => {
  try {
    const { page = 1, limit = 10, sort, order, search, tipe, infrastruktur, kelompok, volume } = req.query;

    const filters = {};
    if (tipe) filters.tipe = { equals: tipe.toLowerCase(), mode: 'insensitive' };
    if (infrastruktur) filters.infrastruktur = { equals: infrastruktur.toLowerCase(), mode: 'insensitive' };
    if (kelompok) filters.kelompok = { equals: kelompok.toLowerCase(), mode: 'insensitive' };

    // NEW: volume filter supports single value or comma-separated list
    if (volume) {
      if (typeof volume === 'string' && volume.includes(',')) {
        const vols = volume
          .split(',')
          .map(v => parseFloat(v.trim()))
          .filter(v => !Number.isNaN(v));
        if (vols.length) filters.volume = { in: vols };
      } else {
        const v = parseFloat(volume);
        if (!Number.isNaN(v)) filters.volume = { equals: v };
      }
    }

    if (search) {
      filters.OR = [
        { uraian: { contains: search.toLowerCase(), mode: 'insensitive' } },
        { specification: { contains: search.toLowerCase(), mode: 'insensitive' } },
      ];
    }

    const total = await prisma.unitPrice.count({ where: filters });
    const totalPages = Math.ceil(total / limit);

    if (page > totalPages) {
      return res.status(400).json({
        message: 'Page exceeds total data available.',
        totalData: total,
        totalPages,
      });
    }

    const unitPrices = await prisma.unitPrice.findMany({
      where: filters,
      orderBy: { [sort || 'createdAt']: order || 'asc' }, // Default sorting applied if empty
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });

    res.json({
      message: 'Objects retrieved successfully.',
      data: unitPrices,
      pagination: {
        totalData: total,
        totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching unit prices:', error); // Log the error for debugging
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
    const series = labels.map(label => countMap[label]);

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
    // 1. Fetch all unit prices
    const unitPrices = await prisma.unitPrice.findMany();

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
    const iqr = arr => {
      const sorted = [...arr].sort((a, b) => a - b);
      const q1 = median(sorted.slice(0, Math.floor(sorted.length / 2)));
      const q3 = median(sorted.slice(Math.ceil(sorted.length / 2)));
      return { q1, q3, iqr: q3 - q1 };
    };

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
      }));

      if (prices.length === 1) {
        recommended = prices[0];
        analysis.method = 'single';
      } else if (prices.length === 2) {
        recommended = Math.min(...prices);
        analysis.method = 'min-of-two';
      } else if (prices.length === 3) {
        // Median & MAD
        const med = median(prices);
        const deviations = prices.map(x => Math.abs(x - med));
        const madVal = mad(prices, med);
        // Modified Z-score
        const zscores = deviations.map(d => madVal === 0 ? 0 : 0.6745 * (d / madVal));
        const outliers = zscores.map(z => z > 3.5);
        recommended = med;
        analysis = {
          method: 'median-mad',
          median: med,
          deviations,
          mad: madVal,
          zscores,
          outliers,
        };
      } else if (prices.length >= 4) {
        // Interquartile Range
        const { q1, q3, iqr: iqrVal } = iqr(prices);
        const low = q1 - 1.5 * iqrVal;
        const high = q3 + 1.5 * iqrVal;
        const filtered = prices.filter(p => p >= low && p <= high);
        recommended = filtered.length ? filtered.reduce((a, b) => a + b, 0) / filtered.length : null;
        analysis = {
          method: 'iqr',
          q1, q3, iqr: iqrVal, low, high,
          filteredPrices: filtered,
          outliers: prices.map(p => p < low || p > high),
        };
      }

      // Pick representative item (full record) closest to recommendedPrice
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
      // allUnitPrices: unitPrices,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get best prices', error: error.message });
  }
};

// NEW: Update UnitPrice dan sinkronkan ConstructionCost pada project yang sama (berdasarkan nama project = unitPrice.proyek)
exports.updateUnitPrice = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const allowed = [
      'workcode',
      'uraian','specification','qty','satuan','hargaSatuan','totalHarga',
      'aaceClass','accuracyLow','accuracyHigh','tahun','infrastruktur',
      'volume','satuanVolume','kelompok','kelompokDetail','proyek','lokasi','tipe'
    ];
    const data = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    }

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.unitPrice.findUnique({ where: { id } });
      if (!before) throw new Error('UnitPrice not found');

      // Update unit price
      const updated = await tx.unitPrice.update({
        where: { id },
        data
      });

      // Cari project dengan nama sama seperti unitPrice.proyek (sebelum diupdate)
      const projectName = (before.proyek || '').trim();
      let projectIds = [];
      if (projectName) {
        const projects = await tx.project.findMany({
          where: { name: { equals: projectName, mode: 'insensitive' } },
          select: { id: true }
        });
        projectIds = projects.map(p => p.id);
      }

      let updatedCostCount = 0;

      if (projectIds.length) {
        // Ambil construction cost yang workcode-nya sama (pakai workcode lama) dan projectId cocok
        const costs = await tx.constructionCost.findMany({
          where: {
            projectId: { in: projectIds },
            workcode: before.workcode
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

          if (Object.keys(patch).length) {
            await tx.constructionCost.update({
              where: { id: cost.id },
              data: patch
            });
            updatedCostCount++;
          }
        }

        // Recalculate total harga dan rata-rata AACE untuk setiap project terdampak
        const affectedProjectIds = Array.from(new Set(costs.map(c => c.projectId)));
        for (const pid of affectedProjectIds) {
          const pCosts = await tx.constructionCost.findMany({ where: { projectId: pid } });
          const totalHarga = pCosts.reduce((sum, c) => sum + (c.totalHarga || 0), 0);
          const avgAACE = pCosts.length
            ? pCosts.reduce((sum, c) => sum + (c.aaceClass || 0), 0) / pCosts.length
            : 0;

          await tx.project.update({
            where: { id: pid },
            data: { harga: Math.round(totalHarga), levelAACE: Math.round(avgAACE) }
          });
        }
      }

      return { updated, updatedCostCount, projectIds };
    });

    res.json({
      message: 'Unit price updated and related construction costs synced.',
      data: result.updated,
      affected: {
        updatedCosts: result.updatedCostCount,
        affectedProjects: result.projectIds
      }
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to update unit price', error: error.message });
  }
};
