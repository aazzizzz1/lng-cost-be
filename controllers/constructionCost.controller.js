const prisma = require('../config/db');

exports.createConstructionCost = async (req, res) => {
  try {
    const { projectName, ...constructionData } = req.body;

    let project = await prisma.project.findFirst({
      where: { name: projectName },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          name: projectName,
          jenis: constructionData.tipe || 'Unknown',
          lokasi: constructionData.lokasi || 'Unknown',
          tahun: constructionData.tahun || new Date().getFullYear(),
          kategori: 'Auto-generated',
          levelAACE: 1,
          harga: 0, // Placeholder value
        },
      });
    }

    const cost = await prisma.constructionCost.create({
      data: {
        ...constructionData,
        projectId: project.id, // Associate with the newly created or existing project
      },
    });

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
