const prisma = require('../config/db');

exports.createCCI = async (req, res) => {
  try {
    const cciData = await prisma.cci.create({ data: req.body });
    res.status(201).json({
      message: 'CCI data created successfully.',
      data: cciData,
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create CCI data', error: error.message });
  }
};

exports.getAllCCI = async (req, res) => {
  try {
    const cciData = await prisma.cci.findMany();
    res.json({
      message: 'CCI data retrieved successfully.',
      data: cciData,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch CCI data', error: error.message });
  }
};
