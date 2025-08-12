const XLSX = require('xlsx');
const prisma = require('../config/db');

const cleanNumber = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0; // Input sanitization
};

const syncUnitPriceToConstruction = async (unitPrices) => {
  for (const unitPrice of unitPrices) {
    const { proyek, volume, tipe, infrastruktur, satuanVolume } = unitPrice;

    let project = await prisma.project.findFirst({
      where: {
        name: proyek,
        volume: volume, // Ensure the project is differentiated by volume
      },
    });

    if (!project) {
      const unitPricesForProject = unitPrices.filter(
        (price) => price.proyek === proyek && price.volume === volume // Filter by name and volume
      );

      const totalHarga = unitPricesForProject.reduce((sum, price) => sum + price.totalHarga, 0);
      const averageLevelAACE =
        unitPricesForProject.reduce((sum, price) => sum + price.aaceClass, 0) / unitPricesForProject.length;

      project = await prisma.project.create({
        data: {
          name: proyek,
          infrastruktur: tipe, // Replace jenis with infrastruktur
          lokasi: unitPrice.lokasi,
          tahun: unitPrice.tahun,
          kategori: 'Auto-generated',
          levelAACE: Math.round(averageLevelAACE) || 1, // Calculate average AACE level
          harga: Math.round(totalHarga) || 0, // Calculate total harga
          satuan: unitPrice.satuan || '',
          volume: volume || 1, // Default to 1 if volume is not provided
        },
      });
    }

    await prisma.constructionCost.create({
      data: {
        workcode: unitPrice.workcode, // NEW
        uraian: unitPrice.uraian,
        specification: (unitPrice.specification && String(unitPrice.specification).trim())
          ? String(unitPrice.specification).trim()
          : 'n/a', // default to 'n/a' if empty
        qty: unitPrice.qty,
        satuan: unitPrice.satuan,
        hargaSatuan: unitPrice.hargaSatuan,
        totalHarga: unitPrice.totalHarga,
        aaceClass: unitPrice.aaceClass,
        accuracyLow: unitPrice.accuracyLow,
        accuracyHigh: unitPrice.accuracyHigh,
        tahun: unitPrice.tahun,
        infrastruktur: infrastruktur || tipe, // Ensure infrastruktur is populated
        volume: volume, // Include volume in construction cost
        satuanVolume: satuanVolume,
        kelompok: unitPrice.kelompok,
        kelompokDetail: unitPrice.kelompokDetail,
        lokasi: unitPrice.lokasi,
        tipe: tipe,
        projectId: project.id, // Correctly pass the projectId
      },
    });
  }
};

exports.uploadExcel = async (req, res) => {
  try {
    const buffer = req.file?.buffer;
    if (!buffer) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!rawData.length) return res.status(400).json({ error: 'Excel is empty or unreadable' });

    // Normalize column names
    const headers = rawData[0].map(header => header.trim().toLowerCase());
    const data = rawData.slice(1).map(row => {
      const normalizedRow = {};
      headers.forEach((header, index) => {
        normalizedRow[header] = row[index];
      });
      return normalizedRow;
    });

    const requiredColumns = ['item', 'qty', 'cost'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    if (missingColumns.length) {
      return res.status(400).json({ error: `Missing required columns: ${missingColumns.join(', ')}` });
    }

    const unitPrices = [];
    const skippedRows = [];

    data.forEach((row, idx) => {
      if (!row['item']) {
        skippedRows.push(idx + 2); // Log the row number (Excel rows start at 1)
        return; // Skip rows with missing "Item"
      }
      const qty = cleanNumber(row['qty']);
      const hargaSatuan = cleanNumber(row['cost']);
      const specRaw = row['specification'];
      const specification =
        (typeof specRaw === 'string' && specRaw.trim()) ? specRaw.trim() : 'n/a'; // default 'n/a'
      unitPrices.push({
        workcode: row['work code'] || '', // NEW (optional if column exists)
        uraian: row['item'] || 'Unknown',
        specification, // use normalized specification
        qty,
        satuan: row['satuan'] || '',
        hargaSatuan,
        totalHarga: qty * hargaSatuan, // Calculate total cost
        aaceClass: parseInt(row['aace class']) || 0,
        accuracyLow: parseFloat(String(row['low']).replace(',', '.').replace('%', '')) || 0, // Handle commas as decimal points
        accuracyHigh: parseFloat(String(row['high']).replace(',', '.').replace('%', '')) || 0, // Handle commas as decimal points
        tahun: parseInt(row['year']) || new Date().getFullYear(),
        infrastruktur: row['infrastructure'] || '',
        volume: cleanNumber(row['volume']),
        satuanVolume: row['satuan'] || '',
        kelompok: row['group 1'] || '',
        kelompokDetail: row['group 1.1'] || '',
        proyek: row['project'] || '',
        lokasi: row['location'] || '',
        tipe: row['type'] || '',
      });
    });

    if (unitPrices.length > 0) {
      await prisma.unitPrice.createMany({
        data: unitPrices,
        skipDuplicates: true, // Prevent duplicate entries
      });

      await syncUnitPriceToConstruction(unitPrices); // Auto-map UnitPrice to ConstructionCost
    }

    res.status(200).json({
      message: 'Data uploaded successfully.',
      count: unitPrices.length,
      skippedRows,
    });
  } catch (error) {
    console.error('Upload Excel Error:', error); // Error logging
    res.status(500).json({ error: error.message });
  }
};
