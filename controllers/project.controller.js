const prisma = require('../config/db');

exports.createProject = async (req, res) => {
  try {
    const { constructionCosts, lokasi, infrastruktur, kategori, tahun, levelAACE, harga, name, volume } = req.body;

    // Validate required fields
    if (!name || !infrastruktur || !lokasi || !kategori || !tahun || !levelAACE || !harga) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    // Create the project
    const project = await prisma.project.create({
      data: {
        name,
        infrastruktur,
        lokasi,
        kategori,
        tahun,
        levelAACE,
        harga,
        volume,
      },
    });

    // Bulk create construction costs associated with the project
    if (constructionCosts && constructionCosts.length > 0) {
      await prisma.constructionCost.createMany({
        data: constructionCosts.map((cost) => ({
          ...cost,
          projectId: project.id, // Ensure projectId is included
        })),
      });
    } else {
      return res.status(400).json({
        message: 'Construction costs are required to create a project.',
        data: null,
      });
    }

    res.status(201).json({
      message: 'Project created successfully.',
      data: project,
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create project', error: error.message });
  }
};

exports.getAllProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    res.json({
      message: 'Objects retrieved successfully.',
      data: projects,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch projects', data: null });
  }
};

exports.getProjectById = async (req, res) => {
  const { id } = req.params;
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(id) }, // Prevent SQL injection by using parameterized queries
      include: { constructionCosts: true },
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found', data: null });
    }

    // Calculate total construction cost
    const totalConstructionCost = project.constructionCosts.reduce((sum, cost) => sum + cost.totalHarga, 0);

    // Define PPN and insurance rates
    const ppnRate = 0.11; // 11% PPN
    const insuranceRate = 0.025; // 2.5% insurance

    // Calculate PPN, insurance, and total estimation
    const ppn = totalConstructionCost * ppnRate;
    const insurance = totalConstructionCost * insuranceRate;
    const totalEstimation = totalConstructionCost + ppn + insurance;

    res.json({
      message: 'Object retrieved successfully.',
      data: {
        ...project,
        totalConstructionCost,
        ppn,
        insurance,
        totalEstimation,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch project', data: null });
  }
};

exports.recommendConstructionCostsAndCreateProject = async (req, res) => {
  try {
    const { name, infrastruktur, lokasi, volume, tahun, inflasi } = req.body; // Remove kategori from destructuring

    // Step 1: Query UnitPrice for matching items
    const unitPrices = await prisma.unitPrice.findMany({
      where: {
        infrastruktur: { equals: infrastruktur.toLowerCase(), mode: 'insensitive' }, // Use infrastruktur instead of tipe
        volume: { lte: volume },
      },
      orderBy: { volume: 'desc' }, // Get the largest volume less than or equal to the input
    });

    if (unitPrices.length === 0) {
      return res.status(400).json({ message: 'No matching UnitPrice items found for recommendation.' });
    }

    // Step 2: Fetch CCI for the project location
    const projectCCI = await prisma.cci.findFirst({
      where: { provinsi: { equals: lokasi, mode: 'insensitive' } },
    });

    if (!projectCCI) {
      return res.status(400).json({ message: 'CCI data not found for the specified location.' });
    }

    // Step 3: Adjust prices and quantities based on inflation, CCI, and capacity factor
    const calculateQuantityUsingCapacityFactor = (baseQty, baseVolume, targetVolume) => {
      const factor = 0.73; // Capacity factor exponent
      return baseQty * Math.pow(targetVolume / baseVolume, factor);
    };

    const recommendedCosts = await Promise.all(
      unitPrices.map(async (item) => {
        const adjustedQty = calculateQuantityUsingCapacityFactor(item.qty, item.volume, volume);
        const adjustedPrice = item.hargaSatuan * Math.pow(1 + inflasi / 100, tahun - item.tahun);

        // Fetch CCI for the item's location
        const itemCCI = await prisma.cci.findFirst({
          where: { provinsi: { equals: item.lokasi, mode: 'insensitive' } },
        });

        if (!itemCCI) {
          throw new Error(`CCI data not found for location: ${item.lokasi}`);
        }

        // Adjust price based on CCI conversion
        const cciAdjustedPrice = adjustedPrice * (projectCCI.cci / itemCCI.cci);

        return {
          ...item,
          qty: Math.round(adjustedQty),
          hargaSatuan: Math.round(cciAdjustedPrice),
          totalHarga: Math.round(adjustedQty * cciAdjustedPrice),
        };
      })
    );

    // Step 4: Send recommendations to frontend
    res.status(200).json({
      message: 'Recommended construction costs retrieved successfully.',
      data: recommendedCosts,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to recommend construction costs', error: error.message });
  }
};

exports.recommendAndSaveProject = async (req, res) => {
  try {
    const { name, jenis, lokasi, volume, tahun, kategori, inflasi } = req.body;

    // Step 1: Query UnitPrice for matching items
    const unitPrices = await prisma.unitPrice.findMany({
      where: {
        tipe: { equals: jenis.toLowerCase(), mode: 'insensitive' },
        volume: { lte: volume },
      },
      orderBy: { volume: 'desc' },
    });

    if (unitPrices.length === 0) {
      return res.status(400).json({ message: 'No matching UnitPrice items found for recommendation.' });
    }

    // Step 2: Fetch CCI for the project location
    const projectCCI = await prisma.cci.findFirst({
      where: { provinsi: { equals: lokasi, mode: 'insensitive' } },
    });

    if (!projectCCI) {
      return res.status(400).json({ message: 'CCI data not found for the specified location.' });
    }

    // Step 3: Adjust prices and quantities based on inflation, CCI, and capacity factor
    const calculateQuantityUsingCapacityFactor = (baseQty, baseVolume, targetVolume) => {
      const factor = 0.73;
      return baseQty * Math.pow(targetVolume / baseVolume, factor);
    };

    const recommendedCosts = await Promise.all(
      unitPrices.map(async (item) => {
        const adjustedQty = calculateQuantityUsingCapacityFactor(item.qty, item.volume, volume);
        const adjustedPrice = item.hargaSatuan * Math.pow(1 + inflasi / 100, tahun - item.tahun);

        const itemCCI = await prisma.cci.findFirst({
          where: { provinsi: { equals: item.lokasi, mode: 'insensitive' } },
        });

        if (!itemCCI) {
          throw new Error(`CCI data not found for location: ${item.lokasi}`);
        }

        const cciAdjustedPrice = adjustedPrice * (projectCCI.cci / itemCCI.cci);

        return {
          ...item,
          qty: Math.round(adjustedQty),
          hargaSatuan: Math.round(cciAdjustedPrice),
          totalHarga: Math.round(adjustedQty * cciAdjustedPrice),
        };
      })
    );

    // Step 4: Create the project
    const project = await prisma.project.create({
      data: {
        name,
        jenis,
        lokasi,
        tahun,
        kategori,
        volume,
        harga: recommendedCosts.reduce((sum, cost) => sum + cost.totalHarga, 0),
        levelAACE: Math.round(
          recommendedCosts.reduce((sum, cost) => sum + cost.aaceClass, 0) / recommendedCosts.length
        ),
      },
    });

    // Step 5: Save construction costs
    await prisma.constructionCost.createMany({
      data: recommendedCosts.map((cost) => ({
        ...cost,
        projectId: project.id,
      })),
    });

    res.status(201).json({
      message: 'Project and recommended construction costs saved successfully.',
      data: { project, recommendedCosts },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save project and construction costs', error: error.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the project by ID
    await prisma.project.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      message: 'Project and associated construction costs deleted successfully.',
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to delete project', error: error.message });
  }
};

exports.calculateProjectEstimation = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the project and its associated construction costs
    const project = await prisma.project.findUnique({
      where: { id: parseInt(id) },
      include: { constructionCosts: true },
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Calculate total construction cost
    const totalConstructionCost = project.constructionCosts.reduce((sum, cost) => sum + cost.totalHarga, 0);

    // Define PPN and insurance rates
    const ppnRate = 0.11; // 11% PPN
    const insuranceRate = 0.025; // 2.5% insurance

    // Calculate PPN, insurance, and total estimation
    const ppn = totalConstructionCost * ppnRate;
    const insurance = totalConstructionCost * insuranceRate;
    const totalEstimation = totalConstructionCost + ppn + insurance;

    res.status(200).json({
      message: 'Project estimation calculated successfully.',
      data: {
        totalConstructionCost,
        ppn,
        insurance,
        totalEstimation,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to calculate project estimation', error: error.message });
  }
};
