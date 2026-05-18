const app = require('./app');
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Pre-warm GEBCO reader (first load reads 95 MB file)
  const { getGebco } = require('./services/bathymetryService');
  getGebco(-12, 7, 95, 142).then(w => {
    if (w) console.log(`[Startup] GEBCO loaded: ${w.width}×${w.height} px`);
  }).catch(() => {});
});
