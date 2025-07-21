const prisma = require('../config/db');

exports.createProject = async (req, res) => {
  try {
    const { constructionCosts, lokasi, infrastruktur, kategori, tahun, name, volume } = req.body;

    // Validate required fields
    if (!name || !infrastruktur || !lokasi || !kategori || !tahun) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    // Create the project with placeholder values for levelAACE and harga
    const project = await prisma.project.create({
      data: {
        name,
        infrastruktur, // Replace jenis with infrastruktur
        lokasi,
        kategori,
        tahun,
        volume,
        levelAACE: 0, // Placeholder value
        harga: 0, // Placeholder value
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

      // Calculate total harga and average levelAACE
      const totalHarga = constructionCosts.reduce((sum, cost) => sum + cost.totalHarga, 0);
      const averageLevelAACE =
        constructionCosts.reduce((sum, cost) => sum + cost.aaceClass, 0) / constructionCosts.length;

      // Update the project with calculated values
      await prisma.project.update({
        where: { id: project.id },
        data: {
          harga: Math.round(totalHarga),
          levelAACE: Math.round(averageLevelAACE),
        },
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

    // Calculate average AACE level
    const totalAACE = project.constructionCosts.reduce((sum, cost) => sum + cost.aaceClass, 0);
    const averageAACE = project.constructionCosts.length > 0 ? totalAACE / project.constructionCosts.length : 0;

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
        averageAACE: Math.round(averageAACE),
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
    const { name, infrastruktur, lokasi, volume, tahun, inflasi } = req.body;

    // Step 1: Query UnitPrice for matching items
    const unitPrices = await prisma.unitPrice.findMany({
      where: {
        infrastruktur: { equals: infrastruktur.toLowerCase(), mode: 'insensitive' },
        volume: { lte: volume }, // Fetch items with volume less than or equal to the target volume
      },
      orderBy: { volume: 'desc' }, // Order by volume in descending order to get the closest match first
    });

    if (unitPrices.length === 0) {
      return res.status(400).json({ message: 'No matching UnitPrice items found for recommendation.' });
    }

    // Step 2: Filter items to only include those with the closest matching volume
    const closestVolume = unitPrices[0].volume; // The first item has the closest volume due to descending order
    const filteredUnitPrices = unitPrices.filter((item) => item.volume === closestVolume);

    // Step 3: Fetch CCI for a province with a value within ±100 dynamically
    const cciReference = await prisma.cci.findFirst({
      where: {
        cci: { gte: 99, lte: 101 }, // Fetch CCI within ±100 range
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
      const factor = 0.73; // Capacity factor exponent
      return baseQty * Math.pow(targetVolume / baseVolume, factor);
    };

    const recommendedCosts = await Promise.all(
      filteredUnitPrices.map(async (item) => {
        const hargaSatuanItem = item.hargaSatuan || item.harga || 0; // Base price of the unit price item

        // Step 5: Adjust price based on inflation
        const n = Number(tahun) - Number(item.tahun || tahun); // Difference in years
        const r = Number(inflasi) / 100; // Inflation rate as a decimal
        let hargaTahunProject = hargaSatuanItem;
        if (n > 0) {
          hargaTahunProject = hargaSatuanItem * Math.pow(1 + r, n); // Adjust price for inflation
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

        return {
          ...item,
          tahun: tahun, // Update the item's year to match the project's year
          proyek: name, // Update the item's project name to match the project's name
          lokasi: lokasi, // Update the item's location to match the project's location
          qty: Math.ceil(adjustedQty), // Use Math.ceil to round up to the nearest whole number
          hargaSatuan: Math.round(hargaLokasiProject),
          totalHarga: Math.round(Math.ceil(adjustedQty) * hargaLokasiProject), // Ensure consistency with rounded qty
          volume: volume, // Adjust volume to match project volume
        };
      })
    );

    // Step 9: Send recommendations to frontend
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
    const { name, infrastruktur, lokasi, volume, tahun, kategori, inflasi } = req.body;

    // Step 1: Query UnitPrice for matching items
    const unitPrices = await prisma.unitPrice.findMany({
      where: {
        infrastruktur: { equals: infrastruktur.toLowerCase(), mode: 'insensitive' }, // Replace tipe with infrastruktur
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
        infrastruktur, // Replace jenis with infrastruktur
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
