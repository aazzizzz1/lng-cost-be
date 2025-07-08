const prisma = require('../config/db');

exports.createConstructionCost = async (req, res) => {
  try {
    const cost = await prisma.constructionCost.create({ data: req.body });
    res.status(201).json(cost);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create construction cost' });
  }
};

exports.getAllConstructionCosts = async (req, res) => {
  try {
    const costs = await prisma.constructionCost.findMany({
      include: { project: true },
    });
    res.json(costs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch construction costs' });
  }
};
