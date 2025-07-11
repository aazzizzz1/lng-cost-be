const XLSX = require('xlsx');
const prisma = require('../config/db');

const cleanNumber = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0; // Input sanitization
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

    const requiredColumns = ['item', 'specification', 'qty', 'cost'];
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
      unitPrices.push({
        uraian: row['item'] || 'Unknown',
        specification: row['specification'] || '',
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
        kapasitasRegasifikasi: 0,
        satuanKapasitas: 'N/A',
        kelompok: row['group 1'] || '',
        kelompokDetail: row['group 1.1'] || '',
        proyek: row['project'] || '',
        lokasi: row['location'] || '',
        tipe: row['type'] || '',
        kategori: 'Material Konstruksi',
      });
    });

    if (unitPrices.length > 0) {
      await prisma.unitPrice.createMany({
        data: unitPrices,
        skipDuplicates: true, // Prevent duplicate entries
      });
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
