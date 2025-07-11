const prisma = require('../config/db');

exports.createUnitPrice = async (req, res) => {
  try {
    const unitPrice = await prisma.unitPrice.create({ data: req.body }); // Ensure req.body is sanitized
    res.status(201).json(unitPrice);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create unit price' });
  }
};

exports.getAllUnitPrices = async (req, res) => {
  try {
    const unitPrices = await prisma.unitPrice.findMany(); // Fetch all unit prices
    res.json({
      message: 'Objects retrieved successfully.',
      data: unitPrices, // Include unit prices in the 'data' field
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unit prices' });
  }
};

exports.deleteAllUnitPrices = async (req, res) => {
  try {
    await prisma.unitPrice.deleteMany(); // Deletes all records in the UnitPrice table
    res.status(200).json({ message: 'All unit prices have been deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete unit prices' });
  }
};
