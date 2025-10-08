const XLSX = require('xlsx');
const prisma = require('../config/db');
const parseExcelNumber = require('../utils/parseExcelNumber');

const cleanNumber = (val) => parseExcelNumber(val);

// REFACTORED: now expects unitPrices with projectId ready
const syncUnitPriceToConstruction = async (unitPrices) => {
  for (const unitPrice of unitPrices) {
    if (!unitPrice.projectId) continue; // safety
    await prisma.constructionCost.create({
      data: {
        workcode: unitPrice.workcode,
        uraian: unitPrice.uraian,
        specification: unitPrice.specification || 'n/a',
        qty: unitPrice.qty,
        satuan: unitPrice.satuan,
        hargaSatuan: unitPrice.hargaSatuan,
        totalHarga: unitPrice.totalHarga,
        aaceClass: unitPrice.aaceClass,
        accuracyLow: unitPrice.accuracyLow,
        accuracyHigh: unitPrice.accuracyHigh,
        tahun: unitPrice.tahun,
        infrastruktur: unitPrice.infrastruktur || unitPrice.tipe,
        volume: unitPrice.volume,
        satuanVolume: unitPrice.satuanVolume,
        kelompok: unitPrice.kelompok,
        kelompokDetail: unitPrice.kelompokDetail,
        lokasi: unitPrice.lokasi,
        tipe: unitPrice.tipe,
        projectId: unitPrice.projectId,
      },
    });
  }
};

// NEW: helper to sanitize fields (hindari error Unknown argument)
const sanitizeUnitPriceRow = (row, allowProjectId = true) => {
  const allowed = new Set([
    'workcode','uraian','specification','qty','satuan','hargaSatuan','totalHarga',
    'aaceClass','accuracyLow','accuracyHigh','tahun','infrastruktur','volume',
    'satuanVolume','kelompok','kelompokDetail','proyek','lokasi','tipe'
  ]);
  if (allowProjectId) allowed.add('projectId');
  const out = {};
  for (const k of Object.keys(row)) if (allowed.has(k) && row[k] !== undefined) out[k] = row[k];
  return out;
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
      if (!row['item']) { skippedRows.push(idx + 2); return; }
      const qty = parseExcelNumber(row['qty']);
      const hargaSatuan = cleanNumber(row['cost']);
      const specRaw = row['specification'];
      const specification = (typeof specRaw === 'string' && specRaw.trim()) ? specRaw.trim() : 'n/a';
      unitPrices.push({
        workcode: row['work code'] || '',
        uraian: row['item'] || 'Unknown',
        specification,
        qty,
        satuan: row['satuan'] || '',
        hargaSatuan,
        totalHarga: cleanNumber(qty * hargaSatuan),
        aaceClass: parseInt(row['aace class']) || 0,
        accuracyLow: parseFloat(String(row['low']).replace(',', '.').replace('%', '')) || 0,
        accuracyHigh: parseFloat(String(row['high']).replace(',', '.').replace('%', '')) || 0,
        tahun: parseInt(row['year']) || new Date().getFullYear(),
        infrastruktur: row['infrastructure'] || '',
        volume: cleanNumber(row['volume']),
        satuanVolume: row['satuan volume'] || '',
        kelompok: row['group 1'] || '',
        kelompokDetail: row['group 1.1'] || '',
        proyek: row['project'] || '',
        lokasi: row['location'] || '',
        tipe: row['type'] || '',
      });
    });

    // NEW: resolve/create projects per (proyek, volume)
    const groupMap = new Map();
    for (const up of unitPrices) {
      if (!up.proyek || up.volume == null) continue;
      const key = `${up.proyek.toLowerCase().trim()}|${up.volume}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(up);
    }

    for (const [key, list] of groupMap.entries()) {
      const sample = list[0];
      let project = await prisma.project.findFirst({
        where: {
          name: { equals: sample.proyek, mode: 'insensitive' },
          volume: sample.volume
        },
        select: { id: true }
      });
      if (!project) {
        const totalHarga = list.reduce((s, i) => s + (i.totalHarga || 0), 0);
        const avgAACE = list.length
          ? list.reduce((s, i) => s + (i.aaceClass || 0), 0) / list.length
          : 0;
        project = await prisma.project.create({
          data: {
            name: sample.proyek,
            infrastruktur: sample.tipe || sample.infrastruktur || 'Unknown',
            lokasi: sample.lokasi || 'Unknown',
            tahun: sample.tahun,
            kategori: 'Auto-generated',
            levelAACE: Math.round(avgAACE),
            harga: Math.round(totalHarga),
            volume: sample.volume,
            inflasi: 0
          },
          select: { id: true }
        });
      }
      list.forEach(u => { u.projectId = project.id; });
    }

    if (unitPrices.length) {
      // NEW: first attempt with projectId (schema baru)
      let rows = unitPrices.map(r => sanitizeUnitPriceRow(r, true));
      try {
        await prisma.unitPrice.createMany({ data: rows, skipDuplicates: true });
      } catch (err) {
        // Fallback jika prisma client lama (belum migrate/generate) -> retry tanpa projectId
        if (String(err.message).includes('Unknown argument `projectId`')) {
          console.warn('[upload] projectId not in current Prisma client. Retrying without projectId.');
          rows = unitPrices.map(r => {
            const s = sanitizeUnitPriceRow(r, false);
            return s;
          });
          await prisma.unitPrice.createMany({ data: rows, skipDuplicates: true });
        } else {
          throw err;
        }
      }
      await syncUnitPriceToConstruction(unitPrices);
    }

    res.status(200).json({ message: 'Data uploaded successfully.', count: unitPrices.length, skippedRows });
  } catch (error) {
    console.error('Upload Excel Error:', error);
    res.status(500).json({ error: error.message });
  }
};
