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

// Helper: Calculate R² for linear regression
function calculateRSquared(data, predictFn) {
  const meanY = data.reduce((acc, d) => acc + d.cost, 0) / data.length;
  const ssTot = data.reduce((acc, d) => acc + Math.pow(d.cost - meanY, 2), 0);
  const ssRes = data.reduce((acc, d) => acc + Math.pow(d.cost - predictFn(d.capacity), 2), 0);
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
}

// Helper: R² interpretation
function interpretRSquared(r2) {
  if (r2 === 0) return 'Model tidak menjelaskan sama sekali variasi data';
  if (r2 < 0.3) return 'Sangat lemah — model hampir tidak menjelaskan variasi';
  if (r2 < 0.5) return 'Lemah — ada sedikit hubungan antara variabel';
  if (r2 < 0.7) return 'Cukup — model menjelaskan sebagian besar variasi';
  if (r2 < 0.9) return 'Kuat — model menjelaskan sebagian besar variasi dengan baik';
  if (r2 < 1.0) return 'Sangat kuat — model menjelaskan hampir semua variasi dalam data';
  return 'Sempurna — model menjelaskan semua variasi data';
}

// Regression and capacity factor methods
function linearRegression(data, x) {
  const n = data.length;
  const sumX = data.reduce((acc, d) => acc + d.capacity, 0);
  const sumY = data.reduce((acc, d) => acc + d.cost, 0);
  const sumXY = data.reduce((acc, d) => acc + d.capacity * d.cost, 0);
  const sumX2 = data.reduce((acc, d) => acc + d.capacity * d.capacity, 0);
  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const a = (sumY - b * sumX) / n;
  return { estimate: a + b * x, predictFn: (cx) => a + b * cx };
}

function logLogRegression(data, x) {
  const n = data.length;
  const sumLnX = data.reduce((acc, d) => acc + Math.log(d.capacity), 0);
  const sumLnY = data.reduce((acc, d) => acc + Math.log(d.cost), 0);
  const sumLnXLnY = data.reduce((acc, d) => acc + Math.log(d.capacity) * Math.log(d.cost), 0);
  const sumLnX2 = data.reduce((acc, d) => acc + Math.log(d.capacity) ** 2, 0);
  const b = (n * sumLnXLnY - sumLnX * sumLnY) / (n * sumLnX2 - sumLnX ** 2);
  const a = (sumLnY - b * sumLnX) / n;
  return { estimate: Math.exp(a) * x ** b, predictFn: (cx) => Math.exp(a) * cx ** b };
}

function capacityFactorMethod(data, x) {
  if (data.length < 1) return { estimate: null, predictFn: () => null };
  const n = 0.65;
  let closest = data[0];
  let minDiff = Math.abs(x - data[0].capacity);
  for (let i = 1; i < data.length; i++) {
    const diff = Math.abs(x - data[i].capacity);
    if (diff < minDiff) {
      closest = data[i];
      minDiff = diff;
    }
  }
  const { capacity: x1, cost: y1 } = closest;
  return { estimate: y1 * Math.pow(x / x1, n), predictFn: () => y1 * Math.pow(x / x1, n) };
}

// POST /api/calculator/estimate
exports.estimateCost = async (req, res) => {
  try {
    const { infrastructure, location, year, inflation, desiredCapacity, method } = req.body;
    if (!infrastructure || !location || !year || !desiredCapacity || !method)
      return res.status(400).json({ message: 'Missing required fields.' });

    // Ambil semua data referensi untuk infrastruktur (tanpa filter lokasi)
    const rows = await prisma.calculatorTotalCost.findMany({
      where: {
        infrastructure: { equals: infrastructure, mode: 'insensitive' },
      },
    });

    if (!rows || rows.length === 0)
      return res.status(404).json({ message: 'No reference data found.' });

    // Prepare data for regression
    const data = rows.map(r => ({
      capacity: Number(r.volume),
      cost: Number(r.totalCost),
    })).filter(d => d.capacity > 0 && d.cost > 0);

    let result, r2 = null, r2Interpretation = null;
    if (method === 'Linear Regression') {
      if (data.length < 2)
        return res.status(400).json({ message: 'Data terlalu sedikit untuk regresi linear.' });
      result = linearRegression(data, desiredCapacity);
      r2 = calculateRSquared(data, result.predictFn);
      r2Interpretation = interpretRSquared(r2);
    } else if (method === 'Log-log Regression') {
      if (data.length < 2)
        return res.status(400).json({ message: 'Data terlalu sedikit untuk regresi log-log.' });
      result = logLogRegression(data, desiredCapacity);
      r2 = calculateRSquared(data, result.predictFn);
      r2Interpretation = interpretRSquared(r2);
    } else if (method === 'Capacity Factor Method') {
      result = capacityFactorMethod(data, desiredCapacity);
      r2 = null;
      r2Interpretation = null;
    } else {
      return res.status(400).json({ message: 'Unknown method.' });
    }

    let estimatedCost = result.estimate;

    // --- Adjust for CCI and inflation ---
    // Reference CCI (±100)
    const cciReference = await prisma.cci.findFirst({
      where: { cci: { gte: 99, lte: 101 } },
    });
    // Project location CCI (sesuai lokasi dari frontend)
    const projectCCI = await prisma.cci.findFirst({
      where: { provinsi: { equals: location, mode: 'insensitive' } },
    });

    if (cciReference && projectCCI) {
      estimatedCost = estimatedCost * (projectCCI.cci / cciReference.cci);
    }

    // Adjust for inflation
    const baseYear = Math.min(...rows.map(r => r.year));
    const n = Number(year) - Number(baseYear);
    const r = Number(inflation) / 100;
    if (n > 0) {
      estimatedCost = estimatedCost * Math.pow(1 + r, n);
    }

    // --- Output ---
    res.status(200).json({
      message: 'Estimasi cost berhasil dihitung.',
      data: {
        method,
        estimatedCost: Math.round(estimatedCost),
        r2: r2 !== null ? Number(r2.toFixed(4)) : null,
        r2Interpretation,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to estimate cost', error: error.message });
  }
};
