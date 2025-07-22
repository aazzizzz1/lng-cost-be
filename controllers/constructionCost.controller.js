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
          infrastruktur: constructionData.tipe || 'Unknown', // Replace jenis with infrastruktur
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

exports.bulkCreateConstructionCosts = async (costs, projectId) => {
  try {
    const formattedCosts = costs.map((cost) => ({
      ...cost,
      projectId, // Associate with the project
    }));
    await prisma.constructionCost.createMany({ data: formattedCosts });
  } catch (error) {
    throw new Error('Failed to create construction costs.');
  }
};

exports.getUniqueInfrastruktur = async (req, res) => {
  try {
    const groupedData = await prisma.constructionCost.findMany({
      select: {
        tipe: true,
        infrastruktur: true,
        volume: true,
      },
    });

    const result = groupedData.reduce((acc, item) => {
      if (!acc[item.tipe]) {
        acc[item.tipe] = {};
      }

      if (!acc[item.tipe][item.infrastruktur]) {
        acc[item.tipe][item.infrastruktur] = [];
      }

      // Add volume only if it doesn't already exist in the array
      if (!acc[item.tipe][item.infrastruktur].some((v) => v.volume === item.volume)) {
        acc[item.tipe][item.infrastruktur].push({ volume: item.volume });
      }

      return acc;
    }, {});

    res.status(200).json({
      message: 'Grouped values retrieved successfully.',
      data: result,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch grouped values', data: null });
  }
};

exports.getFilteredConstructionCosts = async (req, res) => {
  try {
    const { tipe, infrastruktur } = req.query; // Extract filters from query parameters

    const filteredCosts = await prisma.constructionCost.findMany({
      where: {
        tipe: tipe || undefined, // Apply filter if provided
        infrastruktur: infrastruktur || undefined, // Apply filter if provided
      },
      include: { project: true }, // Include related project data
    });

    res.status(200).json({
      message: 'Filtered construction costs retrieved successfully.',
      data: filteredCosts,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch filtered construction costs', data: null });
  }
};
