const numberish = (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "");
const requiredFields = ["infrastructure","type","kategoriOpex","item","hargaOpex","volume","satuanVolume","tahun","lokasi","project"];

exports.validateCreate = (req, res, next) => {
  const b = req.body || {};
  for (const f of requiredFields) {
    if (b[f] === undefined || b[f] === null || b[f] === "") {
      return res.status(400).json({ error: `Field ${f} is required` });
    }
  }
  if (!numberish(b.hargaOpex)) return res.status(400).json({ error: "hargaOpex must be number/number-like" });
  if (!numberish(b.volume)) return res.status(400).json({ error: "volume must be number/number-like" });
  if (!(typeof b.tahun === "number" || /^\d+$/.test(String(b.tahun)))) return res.status(400).json({ error: "tahun must be a number" });
  next();
};

exports.validateUpdate = (req, res, next) => {
  const allowed = [...requiredFields, "deskripsi"];
  const keys = Object.keys(req.body || {});
  if (!keys.length) return res.status(400).json({ error: "Empty body" });
  const invalid = keys.filter((k) => !allowed.includes(k));
  if (invalid.length) return res.status(400).json({ error: `Invalid fields: ${invalid.join(", ")}` });
  next();
};
