const express      = require("express");
const router       = express.Router();
const nigeriaData  = require("../data/nigeriaLocations.json");

// GET /delivery/states
router.get("/states", (req, res) => {
  const states = nigeriaData.map(s => ({
    name:  s.state,
    alias: s.state.toLowerCase().replace(/\s+/g, '-'),
  }));
  return res.json(states);
});

// GET /delivery/lgas/:state
router.get("/lgas/:state", (req, res) => {
  const found = nigeriaData.find(s =>
    s.state.toLowerCase() === req.params.state.toLowerCase().replace(/-/g, ' ')
  );
  if (!found) return res.status(404).json({ error: "State not found" });
  const lgas = found.lgas.map(l => ({ name: l.name }));
  return res.json(lgas);
});

// GET /delivery/wards/:state/:lga
router.get("/wards/:state/:lga", (req, res) => {
  const found = nigeriaData.find(s =>
    s.state.toLowerCase() === req.params.state.toLowerCase().replace(/-/g, ' ')
  );
  if (!found) return res.status(404).json({ error: "State not found" });

  const lga = found.lgas.find(l =>
    l.name.toLowerCase() === req.params.lga.toLowerCase().replace(/-/g, ' ')
  );
  if (!lga) return res.status(404).json({ error: "LGA not found" });

  const wards = (lga.wards || []).map(w => ({ name: w.name }));
  return res.json(wards);
});

module.exports = router;