const express      = require("express");
const router       = express.Router();
const nigeriaData  = require("../data/nigeriaLocations.json");
const { getDeliveryRates, getPackageCategories } = require("../services/shipbubbleService");
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

// POST /delivery/rates
// Body: {
//   customer: { name, email, phone, address },  // address = full street + LGA + state string
//   items: [ { product_name, quantity, unit_price, weight_kg? }, ... ]
// }
router.post("/rates", async (req, res) => {
  const { customer, items } = req.body;

  if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address) {
    return res.status(400).json({ error: "customer name, email, phone and address are required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required" });
  }

  try {
    const result = await getDeliveryRates({ customer, items });
    return res.json(result);
  } catch (err) {
    console.error("Shipbubble rates error:", err.message, err.details || "");
    return res.status(502).json({
      error: "Could not fetch delivery rates. Please try again.",
    });
  }
});


// router.get("/debug-categories", async (req, res) => {
//   try {
//     const data = await getPackageCategories();
//     res.json(data);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

module.exports = router;