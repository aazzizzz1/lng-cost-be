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
    if (tipe) filters.tipe = { equals: tipe.toLowerCase(), mode: 'insensitive' };
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
    const uniqueTipe = await prisma.unitPrice.findMany({
      select: { tipe: true },
      distinct: ['tipe'],
    });

    const uniqueInfrastruktur = await prisma.unitPrice.findMany({
      select: { infrastruktur: true },
      distinct: ['infrastruktur'],
    });

    const uniqueKelompok = await prisma.unitPrice.findMany({
      select: { kelompok: true },
      distinct: ['kelompok'],
    });

    res.json({
      message: 'Unique fields retrieved successfully.',
      data: {
        tipe: uniqueTipe.map((item) => item.tipe),
        infrastruktur: uniqueInfrastruktur.map((item) => item.infrastruktur),
        kelompok: uniqueKelompok.map((item) => item.kelompok),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch unique fields', data: null });
  }
};
