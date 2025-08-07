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
        createdAt: new Date(), // Add current date and time
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

    // 1. Ambil semua UnitPrice untuk infrastruktur ini
    const unitPrices = await prisma.unitPrice.findMany({
      where: {
        infrastruktur: { equals: infrastruktur, mode: 'insensitive' },
      },
      orderBy: { volume: 'asc' },
    });

    if (!unitPrices.length) {
      return res.status(400).json({ message: 'No UnitPrice data found.' });
    }

    // 2. Cari volume terdekat di bawah dan di atas target
    let lower = unitPrices.filter((u) => u.volume <= volume).pop();
    let upper = unitPrices.find((u) => u.volume >= volume);

    // Jika hanya ada satu data, tidak bisa interpolasi/extrapolasi
    if (unitPrices.length < 2) {
      return res.status(400).json({ message: 'Not enough data for interpolation.' });
    }

    // Pastikan lower dan upper memiliki volume berbeda
    if (!lower || !upper || lower.volume === upper.volume) {
      // Jika volume di bawah range, ambil dua data terkecil dengan volume berbeda
      if (volume < unitPrices[0].volume) {
        lower = unitPrices[0];
        upper = unitPrices.find((u) => u.volume > lower.volume);
      }
      // Jika volume di atas range, ambil dua data terbesar dengan volume berbeda
      else if (volume > unitPrices[unitPrices.length - 1].volume) {
        upper = unitPrices[unitPrices.length - 1];
        lower = unitPrices.slice(0, unitPrices.length - 1).reverse().find((u) => u.volume < upper.volume);
      }
      // Jika volume di tengah tapi lower dan upper sama, cari dua data terdekat dengan volume berbeda
      else {
        const idx = unitPrices.findIndex((u) => u.volume === lower.volume);
        // Cari lower sebelumnya yang volume berbeda
        let foundLower = null;
        for (let i = idx - 1; i >= 0; i--) {
          if (unitPrices[i].volume !== lower.volume) {
            foundLower = unitPrices[i];
            break;
          }
        }
        // Cari upper berikutnya yang volume berbeda
        let foundUpper = null;
        for (let i = idx + 1; i < unitPrices.length; i++) {
          if (unitPrices[i].volume !== lower.volume) {
            foundUpper = unitPrices[i];
            break;
          }
        }
        lower = foundLower || lower;
        upper = foundUpper || upper;
      }
      // Jika tetap tidak dapat dua volume berbeda, gagal
      if (!lower || !upper || lower.volume === upper.volume) {
        return res.status(400).json({ message: 'Not enough data for interpolation.' });
      }
    }

    // 3. Ambil data untuk kedua volume (group by uraian)
    const lowerItems = await prisma.unitPrice.findMany({
      where: { infrastruktur, volume: lower.volume },
    });
    const upperItems = await prisma.unitPrice.findMany({
      where: { infrastruktur, volume: upper.volume },
    });

    // Ambil CCI lokasi proyek
    const cciLokasi = await prisma.cci.findFirst({
      where: { provinsi: { equals: lokasi, mode: 'insensitive' } },
    });
    const cciLokasiValue = cciLokasi ? cciLokasi.cci : 100;

    // Ambil CCI referensi (dekat 100)
    const cciRef = await prisma.cci.findFirst({
      where: { cci: { gte: 99, lte: 101 } },
    });
    const cciRefValue = cciRef ? cciRef.cci : 100;

    // 4. Interpolasi Qty tiap item
    const recommendedCosts = lowerItems
      .map((item) => {
        const matchUpper = upperItems.find((u) => u.uraian === item.uraian);
        if (!matchUpper) return null;

        // 1. Penyesuaian harga satuan berdasarkan inflasi
        const r = inflasi / 100;
        const n = tahun - item.tahun;
        const hargaInflasi = item.hargaSatuan * Math.pow(1 + r, n);
        let rumusHargaInflasi = `hargaInflasi = ${item.hargaSatuan} * (1 + ${r})^${n}`;

        // 2. Penyesuaian harga dengan CCI lokasi
        const hargaCCI = hargaInflasi * (cciLokasiValue / cciRefValue);
        let rumusHargaCCI = `hargaCCI = hargaInflasi * (${cciLokasiValue} / ${cciRefValue})`;

        // 3. Interpolasi/extrapolasi qty
        const X1 = lower.volume;
        const Y1 = item.qty;
        const X2 = upper.volume;
        const Y2 = matchUpper.qty;
        const X = volume;
        let interpolatedQty = Y1;
        let rumusQty = `qty = ${Y1} + ((${X} - ${X1}) / (${X2} - ${X1})) * (${Y2} - ${Y1})`;
        if (X2 !== X1) {
          interpolatedQty = Y1 + ((X - X1) / (X2 - X1)) * (Y2 - Y1);
        }
        // Pastikan qty selalu positif
        if (interpolatedQty < 0) interpolatedQty = Math.abs(interpolatedQty);

        return {
          ...item,
          proyek: name,
          lokasi,
          tahun,
          volume: X,
          qty: Math.round(interpolatedQty),
          hargaSatuan: Math.round(hargaCCI),
          totalHarga: Math.round(interpolatedQty * hargaCCI),
          rumusQty,
          rumusHargaInflasi,
          rumusHargaCCI,
        };
      })
      .filter(Boolean);

    res.status(200).json({
      message: 'Recommended construction costs retrieved successfully.',
      data: recommendedCosts,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to recommend construction costs', error: error.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    // Hapus semua constructionCost yang terkait dengan project
    await prisma.constructionCost.deleteMany({
      where: { projectId: parseInt(id) },
    });

    // Hapus project berdasarkan ID
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
