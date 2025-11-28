const prisma = require("../config/db");
const XLSX = require("xlsx");

// Helpers
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function parseNumber(val) {
  if (typeof val === "number") return val;
  if (val === null || val === undefined) return 0;
  let s = String(val).trim().replace(/\s/g, "");
  // Remove currency/other symbols
  s = s.replace(/[^0-9,.\-]/g, "");
  // If both comma and dot exist, assume dot = thousands, comma = decimal
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    // Only comma exists -> decimal
    s = s.replace(",", ".");
  } else {
    // Only dot(s) exist. If more than one, treat all but last as thousands.
    const parts = s.split(".");
    if (parts.length > 2) s = parts.slice(0, -1).join("") + "." + parts.at(-1);
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// CRUD
exports.getAll = async (req, res) => {
  try {
    const data = await prisma.opex.findMany({ orderBy: { id: "asc" } });
    res.json({ message: "OPEX fetched", data });
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch OPEX", error: e.message, data: [] });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id", data: null });
    const row = await prisma.opex.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: "Not found", data: null });
    res.json({ message: "OPEX retrieved", data: row });
  } catch (e) {
    res.status(500).json({ message: "Failed to get OPEX", error: e.message, data: null });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = req.body;
    payload.hargaOpex = parseNumber(payload.hargaOpex);
    payload.volume = parseNumber(payload.volume);
    payload.tahun = Number(payload.tahun);
    const created = await prisma.opex.create({ data: payload });
    res.status(201).json({ message: "OPEX created", data: created });
  } catch (e) {
    res.status(400).json({ message: "Failed to create OPEX", error: e.message, data: null });
  }
};

exports.updateById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id", data: null });
    const data = { ...req.body };
    if (data.hargaOpex !== undefined) data.hargaOpex = parseNumber(data.hargaOpex);
    if (data.volume !== undefined) data.volume = parseNumber(data.volume);
    if (data.tahun !== undefined) data.tahun = Number(data.tahun);
    const updated = await prisma.opex.update({ where: { id }, data });
    res.json({ message: "OPEX updated", data: updated });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ message: "Not found", data: null });
    res.status(500).json({ message: "Failed to update OPEX", error: e.message, data: null });
  }
};

exports.deleteById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });
    await prisma.opex.delete({ where: { id } });
    res.json({ message: "OPEX deleted", data: { id } });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ message: "Not found", data: null });
    res.status(500).json({ message: "Failed to delete OPEX", error: e.message });
  }
};

exports.deleteAll = async (_req, res) => {
  try {
    const r = await prisma.opex.deleteMany();
    res.json({ message: "All OPEX deleted", data: { count: r.count } });
  } catch (e) {
    res.status(500).json({ message: "Failed to delete OPEX", error: e.message });
  }
};

// Excel upload
exports.uploadExcel = async (req, res) => {
  try {
    const buffer = req.file?.buffer;
    if (!buffer) return res.status(400).json({ message: "No file uploaded", data: null });

    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!rows.length) return res.status(400).json({ message: "Excel is empty", data: null });

    const headers = rows[0].map((h) => norm(h));
    // Header variants
    const want = {
      infrastructure: ["infrastructure"],
      type: ["type"],
      kategoriOpex: ["kategori", "kategoriopex", "kategori_opex", "categoryopex"],
      item: ["item"],
      deskripsi: ["deskripsi", "description"],
      hargaOpex: ["hargaopex", "totalopex", "totalopexusdyear", "totalopexusdyr", "totalopexusdperyear", "totalopexusd", "totalopexyear", "totalopexusdyear"],
      volume: ["volume"],
      satuanVolume: ["satuanvolume", "unitvolume", "satuan_vol", "satuan"],
      tahun: ["tahun", "year"],
      lokasi: ["lokasi", "location"],
      project: ["project", "proyek"],
    };
    const colIdx = {};
    for (const [key, variants] of Object.entries(want)) {
      const idx = headers.findIndex((h) => variants.includes(h));
      if (idx >= 0) colIdx[key] = idx;
    }

    const required = ["infrastructure", "type", "kategoriOpex", "item", "hargaOpex", "volume", "satuanVolume", "tahun", "lokasi", "project"];
    const missing = required.filter((k) => colIdx[k] === undefined);
    if (missing.length) {
      return res.status(400).json({ message: `Missing required columns: ${missing.join(", ")}`, data: null });
    }

    const data = [];
    const skipped = [];
    rows.slice(1).forEach((r, i) => {
      const idxExcel = i + 2;
      const get = (k) => r[colIdx[k]];
      const payload = {
        infrastructure: get("infrastructure"),
        type: get("type"),
        kategoriOpex: get("kategoriOpex"),
        item: get("item"),
        deskripsi: colIdx.deskripsi !== undefined ? get("deskripsi") ?? null : null,
        hargaOpex: parseNumber(get("hargaOpex")),
        volume: parseNumber(get("volume")),
        satuanVolume: String(get("satuanVolume") ?? "").trim(),
        tahun: Number(get("tahun")) || new Date().getFullYear(),
        lokasi: String(get("lokasi") ?? "").trim(),
        project: String(get("project") ?? "").trim(),
      };

      const hasAll = required.every((k) => payload[k] !== undefined && payload[k] !== "" && payload[k] !== null);
      if (!hasAll || !Number.isFinite(payload.hargaOpex) || !Number.isFinite(payload.volume)) {
        skipped.push(idxExcel);
        return;
      }
      data.push(payload);
    });

    if (data.length) {
      await prisma.opex.createMany({ data, skipDuplicates: false });
    }

    res.json({ message: "OPEX uploaded", data: { count: data.length, skippedRows: skipped } });
  } catch (e) {
    console.error("Upload OPEX error:", e);
    res.status(500).json({ message: "Failed to upload OPEX", error: e.message, data: null });
  }
};
