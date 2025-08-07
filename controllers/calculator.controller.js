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
    const { infrastructure, location, year, inflation, desiredCapacity, method, information } = req.body;
    if (!infrastructure || !location || !year || !desiredCapacity || !method)
      return res.status(400).json({ message: 'Missing required fields.' });

    // Ambil data referensi untuk infrastruktur, dan filter by information jika ada
    let whereClause = {
      infrastructure: { equals: infrastructure, mode: 'insensitive' },
    };
    if (information) {
      whereClause.information = { equals: information, mode: 'insensitive' };
    }

    const rows = await prisma.calculatorTotalCost.findMany({
      where: whereClause,
    });

    if (!rows || rows.length === 0)
      return res.status(404).json({ message: 'No reference data found.' });

    // Prepare data for regression
    const data = rows.map(r => ({
      capacity: Number(r.volume),
      cost: Number(r.totalCost),
      year: r.year,
      location: r.location,
      information: r.information,
    })).filter(d => d.capacity > 0 && d.cost > 0);

    let result, r2 = null, r2Interpretation = null;
    let regressionStep = {};
    let mathFormula = '';
    let regressionData = {};
    let referenceYear = null; // <-- Tambahan

    if (method === 'Linear Regression') {
      if (data.length < 2)
        return res.status(400).json({ message: 'Data terlalu sedikit untuk regresi linear.' });
      // Rumus: y = a + bx
      // a = (Σy - bΣx)/n
      // b = (nΣxy - ΣxΣy)/(nΣx² - (Σx)²)
      result = linearRegression(data, desiredCapacity);
      r2 = calculateRSquared(data, result.predictFn);
      r2Interpretation = interpretRSquared(r2);
      // Step detail
      const n = data.length;
      const sumX = data.reduce((acc, d) => acc + d.capacity, 0);
      const sumY = data.reduce((acc, d) => acc + d.cost, 0);
      const sumXY = data.reduce((acc, d) => acc + d.capacity * d.cost, 0);
      const sumX2 = data.reduce((acc, d) => acc + d.capacity * d.capacity, 0);
      const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const a = (sumY - b * sumX) / n;
      regressionStep = { n, sumX, sumY, sumXY, sumX2, a, b };
      mathFormula = 'y = a + b·x\na = (Σy - b·Σx)/n\nb = (n·Σxy - Σx·Σy)/(n·Σx² - (Σx)²)';
      regressionData = { a, b, estimate: result.estimate };
      // Pilih tahun dari data terdekat ke desiredCapacity
      let closest = data[0];
      let minDiff = Math.abs(desiredCapacity - data[0].capacity);
      for (let i = 1; i < data.length; i++) {
        const diff = Math.abs(desiredCapacity - data[i].capacity);
        if (diff < minDiff) {
          closest = data[i];
          minDiff = diff;
        }
      }
      referenceYear = closest.year;
    } else if (method === 'Log-log Regression') {
      if (data.length < 2)
        return res.status(400).json({ message: 'Data terlalu sedikit untuk regresi log-log.' });
      // Rumus: ln(y) = a + b·ln(x) → y = exp(a)·x^b
      result = logLogRegression(data, desiredCapacity);
      r2 = calculateRSquared(data, result.predictFn);
      r2Interpretation = interpretRSquared(r2);
      // Step detail
      const n = data.length;
      const sumLnX = data.reduce((acc, d) => acc + Math.log(d.capacity), 0);
      const sumLnY = data.reduce((acc, d) => acc + Math.log(d.cost), 0);
      const sumLnXLnY = data.reduce((acc, d) => acc + Math.log(d.capacity) * Math.log(d.cost), 0);
      const sumLnX2 = data.reduce((acc, d) => acc + Math.log(d.capacity) ** 2, 0);
      const b = (n * sumLnXLnY - sumLnX * sumLnY) / (n * sumLnX2 - sumLnX ** 2);
      const a = (sumLnY - b * sumLnX) / n;
      regressionStep = { n, sumLnX, sumLnY, sumLnXLnY, sumLnX2, a, b };
      mathFormula = 'ln(y) = a + b·ln(x)\ny = exp(a)·x^b\na = (Σln(y) - b·Σln(x))/n\nb = (n·Σln(x)ln(y) - Σln(x)·Σln(y))/(n·Σln(x)² - (Σln(x))²)';
      regressionData = { a, b, estimate: result.estimate };
      // Pilih tahun dari data terdekat ke desiredCapacity
      let closest = data[0];
      let minDiff = Math.abs(desiredCapacity - data[0].capacity);
      for (let i = 1; i < data.length; i++) {
        const diff = Math.abs(desiredCapacity - data[i].capacity);
        if (diff < minDiff) {
          closest = data[i];
          minDiff = diff;
        }
      }
      referenceYear = closest.year;
    } else if (method === 'Capacity Factor Method') {
      // Williams Rule: y2 = y1 * (x2/x1)^n, n biasanya 0.65
      result = capacityFactorMethod(data, desiredCapacity);
      r2 = null;
      r2Interpretation = null;
      // Step detail
      const n = 0.65;
      let closest = data[0];
      let minDiff = Math.abs(desiredCapacity - data[0].capacity);
      for (let i = 1; i < data.length; i++) {
        const diff = Math.abs(desiredCapacity - data[i].capacity);
        if (diff < minDiff) {
          closest = data[i];
          minDiff = diff;
        }
      }
      regressionStep = {
        x1: closest.capacity,
        y1: closest.cost,
        x2: desiredCapacity,
        n,
        estimate: result.estimate
      };
      mathFormula = 'y₂ = y₁ × (x₂/x₁)^n\nn = 0.65 (Williams Rule)';
      regressionData = { ...regressionStep };
      referenceYear = regressionStep.x1 ? rows.find(r => Number(r.volume) === regressionStep.x1)?.year : null;
    } else {
      return res.status(400).json({ message: 'Unknown method.' });
    }

    let estimatedCost = result.estimate;
    let stepInflasi = null;
    let stepIKK = null;

    // --- Adjust for inflation first ---
    // Gunakan referenceYear, fallback ke baseYear jika null
    const baseYear = referenceYear || Math.min(...rows.map(r => r.year));
    const nYear = Number(year) - Number(baseYear);
    const rInflasi = Number(inflation) / 100;
    let estimatedCostAfterInflasi = estimatedCost;
    if (nYear > 0) {
      estimatedCostAfterInflasi = estimatedCost * Math.pow(1 + rInflasi, nYear);
      stepInflasi = {
        formula: 'estimatedCost × (1 + r)^n',
        estimatedCost,
        r: rInflasi,
        n: nYear,
        referenceYear: baseYear,
        result: estimatedCostAfterInflasi
      };
    } else {
      stepInflasi = {
        formula: 'estimatedCost × (1 + r)^n',
        estimatedCost,
        r: rInflasi,
        n: nYear,
        referenceYear: baseYear,
        result: estimatedCostAfterInflasi,
        note: 'Tahun sama, tidak ada penyesuaian inflasi'
      };
    }

    // --- Then adjust for CCI/IKK ---
    // Rumus: estimatedCost * (projectCCI.cci / cciReference.cci)
    const cciReference = await prisma.cci.findFirst({
      where: { cci: { gte: 99, lte: 101 } },
    });
    const projectCCI = await prisma.cci.findFirst({
      where: { provinsi: { equals: location, mode: 'insensitive' } },
    });
    const referenceLocation = rows[0]?.location;
    let estimatedCostAfterIKK = estimatedCostAfterInflasi;
    if (
      cciReference &&
      projectCCI &&
      referenceLocation &&
      referenceLocation.toLowerCase() !== location.toLowerCase()
    ) {
      estimatedCostAfterIKK = estimatedCostAfterInflasi * (projectCCI.cci / cciReference.cci);
      stepIKK = {
        formula: 'estimatedCost × (IKK_lokasi_proyek / IKK_lokasi_referensi)',
        estimatedCost: estimatedCostAfterInflasi,
        IKK_lokasi_proyek: projectCCI.cci,
        IKK_lokasi_referensi: cciReference.cci,
        result: estimatedCostAfterIKK
      };
    } else {
      stepIKK = {
        formula: 'estimatedCost × (IKK_lokasi_proyek / IKK_lokasi_referensi)',
        estimatedCost: estimatedCostAfterInflasi,
        note: 'Lokasi sama atau data IKK tidak ditemukan, tidak ada penyesuaian IKK',
        result: estimatedCostAfterIKK
      };
    }

    // --- Output ---
    res.status(200).json({
      message: 'Estimasi cost berhasil dihitung.',
      data: {
        method,
        mathFormula,
        regressionStep,
        regressionData,
        r2: r2 !== null ? Number(r2.toFixed(4)) : null,
        r2Interpretation,
        referenceData: data,
        step: {
          regressionEstimate: estimatedCost,
          inflasi: stepInflasi,
          ikk: stepIKK,
        },
        estimatedCost: Math.round(estimatedCostAfterIKK),
        information: information || null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to estimate cost', error: error.message });
  }
};
