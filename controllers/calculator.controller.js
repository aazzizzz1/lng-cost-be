const prisma = require('../config/db');
const XLSX = require('xlsx');

// Get all calculator total cost entries
exports.getAllTotalCosts = async (req, res) => {
  try {
    const data = await prisma.calculatorTotalCost.findMany({ orderBy: { id: 'asc' } });
    res.json({
      message: 'Calculator total cost data retrieved successfully.',
      data,
    });
  } catch (err) {
    console.error('GET calculatorTotalCost error:', err);
    res.status(500).json({ message: 'Failed to fetch data', error: err.message, data: [] });
  }
};

// Create a new calculator total cost entry
exports.createTotalCost = async (req, res) => {
  try {
    const {
      infrastructure,
      volume,
      unit,
      totalCost,
      year,
      location,
      low,
      high,
      information,
    } = req.body;

    const newEntry = await prisma.calculatorTotalCost.create({
      data: {
        infrastructure,
        volume,
        unit,
        totalCost,
        year,
        location,
        low,
        high,
        information,
      },
    });
    res.status(201).json({
      message: 'Calculator total cost entry created successfully.',
      data: newEntry,
    });
  } catch (err) {
    console.error('POST calculatorTotalCost error:', err);
    res.status(400).json({ message: 'Failed to create entry', error: err.message, data: null });
  }
};

// Delete all calculator total cost entries
exports.deleteAllTotalCosts = async (req, res) => {
  try {
    const deleted = await prisma.calculatorTotalCost.deleteMany();
    res.json({
      message: 'All calculator total cost data deleted successfully.',
      data: { count: deleted.count }
    });
  } catch (err) {
    console.error('DELETE calculatorTotalCost error:', err);
    res.status(500).json({ message: 'Failed to delete data', error: err.message });
  }
};

// Helper: Parse number from string (remove non-numeric except . and -)
function parseNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
}

// Helper: Parse percent/float from string
function parsePercent(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(',', '.').replace('%', '')) || 0;
}

// Upload Excel for CalculatorTotalCost
exports.uploadCalculatorExcel = async (req, res) => {
  try {
    const buffer = req.file?.buffer;
    if (!buffer) return res.status(400).json({ message: 'No file uploaded', data: null });

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!rawData.length) return res.status(400).json({ message: 'Excel is empty or unreadable', data: null });

    // Clean header: remove all whitespace (including non-breaking space) and lowercase
    const headers = rawData[0].map(header =>
      String(header)
        .replace(/[\s\uFEFF\xA0]+/g, '') // remove all whitespace (not just trim)
        .toLowerCase()
    );
    console.log('Parsed headers:', headers); // Debug: lihat hasil parsing header

    const requiredColumns = [ 
      'infrastructure', 'volume', 'unit', 'totalcost', 'year',
      'location', 'low', 'high', 'information'
    ];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    if (missingColumns.length) {
      return res.status(400).json({ message: `Missing required columns: ${missingColumns.join(', ')}`, data: null });
    }

    // Convert rows to objects, value tidak di-lowercase
    const data = rawData.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        let val = row[idx];
        if (typeof val === 'string') val = val.trim();
        obj[header] = val;
      });
      return obj;
    });

    const calculatorRows = [];
    const skippedRows = [];

    data.forEach((row, idx) => {
      // Validate required fields
      const hasAllFields = requiredColumns.every(col => row[col] !== undefined && row[col] !== '');
      if (!hasAllFields) {
        skippedRows.push(idx + 2); // Excel row number
        return;
      }
      calculatorRows.push({
        infrastructure: row['infrastructure'],
        volume: parseNumber(row['volume']),
        unit: row['unit'],
        totalCost: parseNumber(row['totalcost']),
        year: parseInt(row['year']) || new Date().getFullYear(),
        location: row['location'],
        low: parsePercent(row['low']),
        high: parsePercent(row['high']),
        information: row['information'],
      });
    });

    if (calculatorRows.length > 0) {
      await prisma.calculatorTotalCost.createMany({
        data: calculatorRows,
        skipDuplicates: true,
      });
    }

    res.status(200).json({
      message: 'Calculator total cost data uploaded successfully.',
      data: {
        count: calculatorRows.length,
        skippedRows,
      },
    });
  } catch (error) {
    console.error('Upload Calculator Excel Error:', error);
    res.status(500).json({ message: 'Failed to upload calculator data', error: error.message, data: null });
  }
};
