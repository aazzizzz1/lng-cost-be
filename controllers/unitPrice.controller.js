const prisma = require('../config/db');

exports.createUnitPrice = async (req, res) => {
  try {
    const unitPrice = await prisma.unitPrice.create({ data: req.body }); // Ensure req.body is sanitized
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
    const { page = 1, limit = 10, sort, order, search, tipe, infrastruktur, kelompok } = req.query;

    const filters = {};
    if (tipe) filters.tipe = { equals: tipe.toLowerCase(), mode: 'insensitive' }; // Ensure case-insensitive matching
    if (infrastruktur) filters.infrastruktur = { equals: infrastruktur.toLowerCase(), mode: 'insensitive' };
    if (kelompok) filters.kelompok = { equals: kelompok.toLowerCase(), mode: 'insensitive' };
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
        cci: { gte: 99, lte: 101 },
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
