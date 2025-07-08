const prisma = require('../config/db');

exports.createUnitPrice = async (req, res) => {
  try {
    const unitPrice = await prisma.unitPrice.create({ data: req.body });
    res.status(201).json(unitPrice);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create unit price' });
  }
};

exports.getAllUnitPrices = async (req, res) => {
  try {
    const unitPrices = await prisma.unitPrice.findMany();
    res.json(unitPrices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unit prices' });
  }
};
