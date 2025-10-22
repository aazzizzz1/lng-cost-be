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

// Helper: Calculate R² with optional transform (e.g., LN for log-log)
// If transformY is provided, R² is computed in the transformed domain (Excel RSQ equivalent).
function calculateRSquared(data, predictFn, { transformY } = {}) {
  const yVals = data.map(d => (transformY ? transformY(d.cost) : d.cost));
  const yHatVals = data.map(d => {
    const yhat = predictFn(d.capacity);
    return transformY ? transformY(yhat) : yhat;
  });

  const meanY = yVals.reduce((acc, y) => acc + y, 0) / yVals.length;
  const ssTot = yVals.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);
  const ssRes = yVals.reduce((acc, y, i) => acc + Math.pow(y - yHatVals[i], 2), 0);
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
/**
 * Ordinary Least Squares Linear Regression
 * Excel-compatible roles:
 *   a = SLOPE(y, x)
 *   b = INTERCEPT(y, x)
 * Prediction:
 *   y_hat = b + a x
 */
function linearRegression(data, x) {
  const n = data.length;
  const sumX = data.reduce((acc, d) => acc + d.capacity, 0);
  const sumY = data.reduce((acc, d) => acc + d.cost, 0);
  const sumXY = data.reduce((acc, d) => acc + d.capacity * d.cost, 0);
  const sumX2 = data.reduce((acc, d) => acc + d.capacity * d.capacity, 0);

  // Excel: slope = SLOPE(y, x), intercept = INTERCEPT(y, x)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // a := slope, b := intercept
  const a = slope;
  const b = intercept;

  return {
    estimate: b + a * x,
    predictFn: (cx) => b + a * cx
  };
}

/**
 * Log-Log Regression (Power Law)
 * Transform:
 *   X = ln(x), Y = ln(y)
 * Excel-compatible roles on transformed data:
 *   a = SLOPE(Y, X)
 *   b = INTERCEPT(Y, X)
 * Back-transform:
 *   y = exp(b) * x^a
 */
function logLogRegression(data, x) {
  const n = data.length;
  const sumLnX = data.reduce((acc, d) => acc + Math.log(d.capacity), 0);
  const sumLnY = data.reduce((acc, d) => acc + Math.log(d.cost), 0);
  const sumLnXLnY = data.reduce((acc, d) => acc + Math.log(d.capacity) * Math.log(d.cost), 0);
  const sumLnX2 = data.reduce((acc, d) => acc + Math.log(d.capacity) ** 2, 0);

  // Excel on ln-space
  const slope = (n * sumLnXLnY - sumLnX * sumLnY) / (n * sumLnX2 - sumLnX ** 2);
  const intercept = (sumLnY - slope * sumLnX) / n;

  // a := slope, b := intercept
  const a = slope;
  const b = intercept;

  return {
    estimate: Math.exp(b) * x ** a,
    predictFn: (cx) => Math.exp(b) * cx ** a
  };
}

/**
 * Capacity Factor (Scale-Up) Method
 * Choose closest reference (x1, y1) to desired x2:
 *   y2 = y1 * (x2 / x1)^n
 * where n is an empirical scaling exponent (here constant n = 0.65).
 * Returns estimate and predictFn (constant for fixed x2 in this implementation).
 */
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
    const { infrastructure, location, year, inflation, desiredCapacity, method, information, verbose: bodyVerbose } = req.body;
    const verbose = bodyVerbose === true || req.query.verbose === '1';
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

    // Prepare original data
    const originalData = rows.map(r => ({
      capacity: Number(r.volume),
      cost: Number(r.totalCost),
      year: Number(r.year),
      location: r.location,
      information: r.information,
    })).filter(d => d.capacity > 0 && d.cost > 0);

    if (!originalData.length)
      return res.status(400).json({ message: 'Reference data invalid.' });

    // ---------------------------------------------------------
    // 1. INFLASI (disesuaikan per baris ke target year)
    // ---------------------------------------------------------
    const targetYearNum = Number(year);
    const rInflasi = Number(inflation) / 100 || 0;

    const dataAfterInflasi = originalData.map(d => {
      const nYear = targetYearNum - d.year;
      // Support inflate (nYear > 0) and deflate (nYear < 0)
      const factor = Math.pow(1 + rInflasi, nYear);
      return {
        ...d,
        cost: d.cost * factor,
        _inflasi: {
          fromYear: d.year,
          toYear: targetYearNum,
          n: nYear,
          r: rInflasi,
          factor
        }
      };
    });

    // Ringkasan inflasi
    const stepInflasi = {
      formula: 'cost × (1 + r)^n (n bisa negatif)',
      targetYear: targetYearNum,
      r: rInflasi,
      applied: rInflasi !== 0 && dataAfterInflasi.some(d => d._inflasi.n !== 0),
      note: rInflasi === 0 ? 'Inflasi = 0 atau tidak diberikan' : undefined
    };

    // ---------------------------------------------------------
    // 2. IKK (CCI) – sesuaikan biaya ke lokasi proyek
    // ---------------------------------------------------------
    // Default CCI reference and target location to 100 if not found (align with project logic)
    const cciReferenceRec = await prisma.cci.findFirst({
      where: { cci: { gte: 100, lte: 100 } },
    });
    const projectCCIRec = await prisma.cci.findFirst({
      where: { provinsi: { equals: location, mode: 'insensitive' } },
    });
    const refCCIVal = cciReferenceRec?.cci ?? 100;
    const projectCCIVal = projectCCIRec?.cci ?? 100;

    const distinctOriginLocations = [
      ...new Set(dataAfterInflasi.map(d => (d.location || '').trim()).filter(Boolean))
    ];
    let originCCIMap = {};
    if (distinctOriginLocations.length) {
      const originCCIRecords = await prisma.cci.findMany({
        where: { provinsi: { in: distinctOriginLocations } },
      });
      originCCIMap = originCCIRecords.reduce((acc, rec) => {
        acc[rec.provinsi.toLowerCase()] = rec.cci;
        return acc;
      }, {});
    }

    const dataAfterIKK = dataAfterInflasi.map(d => {
      // Default origin CCI to 100 if not found
      const originCCIVal = originCCIMap[d.location?.toLowerCase()] ?? 100;

      // Factors (benchmark first, then to project). All values are defined (default=100).
      const toBenchmarkFactor = refCCIVal / originCCIVal;     // CCI_reference / CCI_origin
      const toProjectFactor = projectCCIVal / refCCIVal;      // CCI_project / CCI_reference
      const totalIKKFactor = projectCCIVal / originCCIVal;    // == toBenchmarkFactor * toProjectFactor

      const costBenchmark = d.cost * toBenchmarkFactor;
      const finalCost = d.cost * totalIKKFactor;

      return {
        ...d,
        cost: finalCost,
        _ikk: {
          fromLocation: d.location,
          toLocation: location,
          originCCI: originCCIVal,
          referenceCCI: refCCIVal,
          projectCCI: projectCCIVal,
          toBenchmarkFactor,
          toProjectFactor,
          factor: totalIKKFactor,
          costBenchmark,
          overInflated: totalIKKFactor > 10
        }
      };
    });

    const stepIKK = {
      formula: 'cost_project = cost_inflasi × (CCI_project / CCI_origin)',
      viaBenchmark: 'costBenchmark = cost_inflasi × (CCI_reference / CCI_origin); lalu × (CCI_project / CCI_reference)',
      applied: dataAfterIKK.some(d => d._ikk.factor !== 1),
      projectCCI: projectCCIVal,
      referenceCCI: refCCIVal
    };

    // Data untuk metode (ringan)
    const data = dataAfterIKK.map(d => ({
      capacity: d.capacity,
      cost: d.cost,
      year: d.year,
      location: d.location,
      information: d.information
    }));

    // ---------------------------------------------------------
    // 3. METODE (regresi / capacity factor)
    // ---------------------------------------------------------
    let result, r2 = null, r2Interpretation = null;
    let regressionStep = {};
    let mathFormula = '';
    let regressionData = {};
    let methodCalculation;

    if (method === 'Linear Regression') {
      if (data.length < 2)
        return res.status(400).json({ message: 'Data terlalu sedikit untuk regresi linear.' });

      result = linearRegression(data, desiredCapacity);
      r2 = calculateRSquared(data, result.predictFn);
      r2Interpretation = interpretRSquared(r2);

      const n = data.length;
      const sumX = data.reduce((acc, d) => acc + d.capacity, 0);
      const sumY = data.reduce((acc, d) => acc + d.cost, 0);
      const sumXY = data.reduce((acc, d) => acc + d.capacity * d.cost, 0);
      const sumX2 = data.reduce((acc, d) => acc + d.capacity * d.capacity, 0);

      // Excel roles: a=SLOPE, b=INTERCEPT
      const a = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const b = (sumY - a * sumX) / n;

      regressionStep = { n, sumX, sumY, sumXY, sumX2, a, b };
      mathFormula = 'y = b + a·x';
      regressionData = { a, b, estimate: result.estimate };
      methodCalculation = {
        type: 'linear',
        formula: 'y = b + a*x',
        variables: { a, b, x: desiredCapacity },
        estimateBeforeRounding: result.estimate
      };
    } else if (method === 'Log-log Regression') {
      if (data.length < 2)
        return res.status(400).json({ message: 'Data terlalu sedikit untuk regresi log-log.' });

      result = logLogRegression(data, desiredCapacity);
      // Compute R² in ln-space to match Excel: RSQ(LN(y), LN(x))
      r2 = calculateRSquared(data, result.predictFn, { transformY: Math.log });
      r2Interpretation = interpretRSquared(r2);

      const n = data.length;
      const sumLnX = data.reduce((acc, d) => acc + Math.log(d.capacity), 0);
      const sumLnY = data.reduce((acc, d) => acc + Math.log(d.cost), 0);
      const sumLnXLnY = data.reduce((acc, d) => acc + Math.log(d.capacity) * Math.log(d.cost), 0);
      const sumLnX2 = data.reduce((acc, d) => acc + Math.log(d.capacity) ** 2, 0);

      const a = (n * sumLnXLnY - sumLnX * sumLnY) / (n * sumLnX2 - sumLnX ** 2);
      const b = (sumLnY - a * sumLnX) / n;

      regressionStep = { n, sumLnX, sumLnY, sumLnXLnY, sumLnX2, a, b };
      mathFormula = 'ln(y) = b + a·ln(x) → y = exp(b)·x^a';
      // Add Excel hint for R² in ln-space
      regressionData = { a, b, estimate: result.estimate, r2Excel: 'RSQ(LN(y), LN(x))' };
      methodCalculation = {
        type: 'loglog',
        formula: 'ln(y)=b + a ln(x) -> y = exp(b)*x^a',
        variables: {
          a,
          b,
          x: desiredCapacity,
          expB: Math.exp(b),
          xPowA: Math.pow(desiredCapacity, a)
        },
        estimateBeforeRounding: result.estimate
      };
    } else if (method === 'Capacity Factor Method') {
      result = capacityFactorMethod(data, desiredCapacity);
      const nConst = 0.65;
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
        n: nConst,
        estimate: result.estimate
      };
      mathFormula = 'y₂ = y₁ × (x₂/x₁)^n (n=0.65)';
      regressionData = { ...regressionStep };
      methodCalculation = {
        type: 'capacityFactor',
        formula: 'y2 = y1 * (x2/x1)^n',
        variables: {
          x1: regressionStep.x1,
          y1: regressionStep.y1,
          x2: regressionStep.x2,
          n: regressionStep.n,
          ratio: regressionStep.x2 / regressionStep.x1,
          ratioPow: Math.pow(regressionStep.x2 / regressionStep.x1, regressionStep.n)
        },
        estimateBeforeRounding: result.estimate
      };
    } else {
      return res.status(400).json({ message: 'Unknown method.' });
    }

    const estimatedCost = result.estimate;

    // RINGKAS faktor rata-rata (untuk ringkasan sederhana)
    const avgIKKFactor = Number(
      (dataAfterIKK.reduce((acc, d) => acc + (d._ikk.factor || 1), 0) / dataAfterIKK.length).toFixed(4)
    );
    const avgInflasiFactor = Number(
      (dataAfterInflasi.reduce((acc, d) => acc + (d._inflasi.factor || 1), 0) / dataAfterInflasi.length).toFixed(4)
    );

    // Tambahan: rata-rata biaya setelah inflasi & setelah IKK
    const avgCostAfterInflasi = Number(
      (dataAfterInflasi.reduce((acc, d) => acc + d.cost, 0) / dataAfterInflasi.length).toFixed(2)
    );
    const avgCostAfterIKK = Number(
      (dataAfterIKK.reduce((acc, d) => acc + d.cost, 0) / dataAfterIKK.length).toFixed(2)
    );

    // Sisipkan ke object step detail (akan ikut di verbose)
    stepInflasi.avgCost = avgCostAfterInflasi;
    stepIKK.avgCost = avgCostAfterIKK;

    // Data referensi ringkas untuk simple mode
    const referenceDataOriginalSimple = originalData.map(d => ({
      capacity: d.capacity,
      cost: d.cost,
      year: d.year,
      location: d.location,
      information: d.information
    }));
    const referenceDataAdjustedSimple = data.map(d => ({
      capacity: d.capacity,
      cost: d.cost,
      year: d.year,
      location: d.location,
      information: d.information
    }));

    // Bangun payload sederhana (default)
    const basePayload = {
      method,
      mathFormula,
      estimatedCost,
      r2: r2 !== null ? Number(r2.toFixed(4)) : null,
      r2Interpretation,
      referenceCount: originalData.length,
      adjustedReferenceCount: data.length,
      inputs: {
        infrastructure,
        location,
        year: targetYearNum,
        desiredCapacity,
        inflationRate: rInflasi
      },
      step: {
        inflasi: {
          applied: stepInflasi.applied,
          avgFactor: avgInflasiFactor,
          avgCost: avgCostAfterInflasi // harga setelah inflasi
        },
        ikk: {
          applied: stepIKK.applied,
          avgFactor: avgIKKFactor,
          avgCost: avgCostAfterIKK // harga setelah IKK
        },
        method: {
          name: method,
          calculation: methodCalculation // detail formula ditampilkan di simple mode
        }
      },
      // Ditambahkan: data referensi yang digunakan untuk perhitungan
      referenceDataOriginal: referenceDataOriginalSimple,
      referenceDataAdjusted: referenceDataAdjustedSimple,
      information: information || null
    };

    if (!verbose) {
      return res.status(200).json({
        message: 'Estimasi cost berhasil dihitung (simple mode).',
        data: basePayload
      });
    }

    // ---------------------------------------------------------
    // VERBOSE MODE (bangun detail hanya jika diminta)
    // ---------------------------------------------------------
    // Optimized lookup map to avoid O(n^2)
    const key = (d) => `${d.capacity}|${d.year}|${d.location}`;
    const originalCostMap = {};
    originalData.forEach(o => { originalCostMap[key(o)] = o.cost; });

    const inflasiData = dataAfterInflasi.map(d => ({
      capacity: d.capacity,
      year: d.year,
      location: d.location,
      originalCost: originalCostMap[key(d)],
      costAfterInflasi: d.cost,
      inflasiFactor: d._inflasi.factor,
      nYear: d._inflasi.n,
      r: d._inflasi.r
    }));

    const inflasiMap = {};
    inflasiData.forEach(r => { inflasiMap[key(r)] = r; });

    const ikkData = dataAfterIKK.map(d => {
      const k = key(d);
      return {
        capacity: d.capacity,
        year: d.year,
        location: d.location,
        costAfterInflasi: inflasiMap[k]?.costAfterInflasi,
        costBenchmark: d._ikk.costBenchmark,
        costAfterIKK: d.cost,
        ikkFactor: d._ikk.factor,
        originCCI: d._ikk.originCCI,
        referenceCCI: d._ikk.referenceCCI,
        projectCCI: d._ikk.projectCCI,
        toBenchmarkFactor: d._ikk.toBenchmarkFactor,
        toProjectFactor: d._ikk.toProjectFactor
      };
    });

    // FIX: perbaiki syntax map
    const auditPenyesuaian = ikkData.map(row => {
      const infl = inflasiMap[`${row.capacity}|${row.year}|${row.location}`];
      return {
        capacity: row.capacity,
        year: row.year,
        location: row.location,
        originalCost: infl?.originalCost,
        costAfterInflasi: row.costAfterInflasi,
        costBenchmark: row.costBenchmark,
        costAfterIKK: row.costAfterIKK,
        inflasiFactor: infl?.inflasiFactor,
        toBenchmarkFactor: row.toBenchmarkFactor,
        toProjectFactor: row.toProjectFactor,
        ikkFactor: row.ikkFactor,
        originCCI: row.originCCI,
        referenceCCI: row.referenceCCI,
        projectCCI: row.projectCCI
      };
    });

    res.status(200).json({
      message: 'Estimasi cost berhasil dihitung (verbose mode).',
      data: {
        ...basePayload,
        regressionStep,
        regressionData,
        referenceDataOriginal: originalData,
        referenceDataAfterInflasi: inflasiData,
        referenceDataAfterIKK: ikkData,
        auditPenyesuaian,
        referenceDataAdjusted: data,
        step: {
          inflasi: stepInflasi,
          ikk: stepIKK,
          method: {
            name: method,
            estimateBeforeRounding: result.estimate,
            calculation: methodCalculation // juga tampil di verbose
          }
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to estimate cost', error: error.message });
  }
};
