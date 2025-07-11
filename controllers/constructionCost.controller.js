const prisma = require('../config/db');

exports.createConstructionCost = async (req, res) => {
  try {
    const cost = await prisma.constructionCost.create({ data: req.body }); // Ensure req.body is sanitized
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
