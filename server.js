const app = require('./app');
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  const { getGebco, getBatnas } = require('./services/bathymetryService');
  // Pre-warm GEBCO reader (first load extracts ZIP + builds Float32Array cache)
  getGebco(-12, 7, 95, 142).then(w => {
    if (w) console.log(`[Startup] GEBCO loaded: ${w.width}×${w.height} px`);
  }).catch(() => {});
  // Pre-warm BATNAS TIF (opens file handle + caches raster metadata; pixels loaded on-demand per window)
  getBatnas(-11, 6, 94, 142).then(w => {
    if (w) console.log(`[Startup] BATNAS ready: ${w.width}×${w.height} px`);
  }).catch(() => {});
});
