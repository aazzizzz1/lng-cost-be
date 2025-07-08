const XLSX = require('xlsx');
const prisma = require('../config/db');

const cleanNumber = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
};

exports.uploadExcel = async (req, res) => {
  try {
    const buffer = req.file?.buffer;
    if (!buffer) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    if (!data.length) return res.status(400).json({ error: 'Excel is empty or unreadable' });

    const unitPrices = data.map((row, idx) => {
      if (!row['Item']) throw new Error(`Row ${idx + 2} missing "Item"`); // error jelas
      return {
        uraian: row['Item'] || 'Unknown',
        specification: row['Specification'] || '',
        qty: cleanNumber(row['Qty']),
        satuan: row['Satuan'] || '',
        hargaSatuan: cleanNumber(row['Cost']),
        totalHarga: cleanNumber(row['Total Cost']),
        aaceClass: parseInt(row['AACE Class']) || 0,
        accuracyLow: parseInt(String(row['Low']).replace('%', '')) || 0,
        accuracyHigh: parseInt(String(row['High']).replace('%', '')) || 0,
        tahun: parseInt(row['Year']) || new Date().getFullYear(),
        infrastruktur: row['Infrastructure'] || '',
        volume: cleanNumber(row['Volume']),
        satuanVolume: row['Satuan'] || '',
        kapasitasRegasifikasi: 0,
        satuanKapasitas: 'N/A',
        kelompok: row['Group 1'] || '',
        kelompokDetail: row['Group 1.1'] || '',
        proyek: row['Project'] || '',
        lokasi: row['Location'] || '',
        tipe: row['Type'] || '',
        kategori: 'Material Konstruksi',
      };
    });

    await prisma.unitPrice.createMany({
      data: unitPrices,
      skipDuplicates: true,
    });

    res.status(200).json({ message: 'Data uploaded successfully.', count: unitPrices.length });
  } catch (error) {
    console.error('Upload Excel Error:', error);
    res.status(500).json({ error: error.message });
  }
};
