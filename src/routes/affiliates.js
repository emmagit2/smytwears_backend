const express  = require("express");
const { z }    = require("zod");
const router   = express.Router();
const supabase = require("../services/supabase");
const email    = require("../services/email");
const { requireAdmin } = require("../middleware/auth");

// ────────────────────────────────────────────────────────────
// POST /affiliates — Submit affiliate application
// ────────────────────────────────────────────────────────────
const ApplySchema = z.object({
  full_name:          z.string().min(2),
  email:              z.string().email(),
  phone:              z.string().min(8),
  instagram_handle:   z.string().optional(),
  bank_name:          z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_account_name:  z.string().optional(),
});

router.post("/", async (req, res) => {
  const parsed = ApplySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  // Check duplicate email
  const { data: existing } = await supabase
    .from("affiliates")
    .select("id")
    .eq("email", parsed.data.email)
    .single();

  if (existing) return res.status(409).json({ error: "Email already registered as affiliate" });

  const { data: aff, error } = await supabase
    .from("affiliates")
    .insert({ ...parsed.data, status: "pending" })
    .select()
    .single();

  if (error) {
    console.error("Affiliate insert error:", error);
    return res.status(500).json({ error: "Failed to submit application" });
  }

  email.sendAdminNotification(
    `New Affiliate Application: ${aff.full_name}`,
    `Name: ${aff.full_name}\nEmail: ${aff.email}\nInstagram: ${aff.instagram_handle || "N/A"}`
  ).catch(console.error);

  return res.json({ success: true, message: "Application submitted. We'll review and get back to you." });
});

// ────────────────────────────────────────────────────────────
// POST /affiliates/approve — Approve affiliate (Admin)
// ────────────────────────────────────────────────────────────
router.post("/approve", requireAdmin, async (req, res) => {
  const { affiliate_id, commission_rate } = req.body;
  if (!affiliate_id) return res.status(400).json({ error: "affiliate_id is required" });

  // Generate referral code from name
  const { data: aff, error: fetchErr } = await supabase
    .from("affiliates")
    .select("*")
    .eq("id", affiliate_id)
    .single();

  if (fetchErr || !aff) return res.status(404).json({ error: "Affiliate not found" });

  // Build code: SMYT-FIRSTNAME+2digits
  const firstName    = aff.full_name.split(" ")[0].toUpperCase().slice(0, 8);
  const suffix       = String(Math.floor(Math.random() * 90) + 10);
  const referral_code = `SMYT-${firstName}${suffix}`;

  const { data: updated, error: updateErr } = await supabase
    .from("affiliates")
    .update({
      status:          "approved",
      referral_code,
      commission_rate: commission_rate || 10,
    })
    .eq("id", affiliate_id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: "Failed to approve affiliate" });

  email.sendAffiliateWelcome(updated).catch(console.error);

  return res.json({ success: true, referral_code });
});

// ────────────────────────────────────────────────────────────
// GET /affiliates/stats?code=SMYT-JOHN20 — Dashboard data
// ────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "code is required" });

  const { data: aff, error } = await supabase
    .from("affiliates")
    .select("*")
    .eq("referral_code", code.toUpperCase())
    .single();

  if (error || !aff) return res.status(404).json({ error: "Affiliate not found" });
  if (aff.status !== "approved") return res.status(403).json({ error: "Affiliate not approved" });

  // Fetch last 10 orders with this code
  const { data: orders } = await supabase
    .from("orders")
    .select("order_number,total,status,created_at")
    .eq("affiliate_code", code.toUpperCase())
    .order("created_at", { ascending: false })
    .limit(10);

  const recent_orders = (orders || []).map(o => ({
    order_number: o.order_number,
    total:        o.total,
    status:       o.status,
    commission:   Math.round((aff.commission_rate / 100) * o.total),
    date:         o.created_at,
  }));

  return res.json({
    full_name:         aff.full_name,
    referral_code:     aff.referral_code,
    status:            aff.status,
    commission_rate:   aff.commission_rate,
    total_referrals:   aff.total_referrals,
    total_sales:       aff.total_sales,
    total_earnings:    aff.total_earnings,
    paid_out:          aff.paid_out,
    pending_payout:    aff.total_earnings - aff.paid_out,
    bank_name:         aff.bank_name,
    bank_account_name: aff.bank_account_name,
    bank_account_number: aff.bank_account_number,
    recent_orders,
  });
});

// ────────────────────────────────────────────────────────────
// GET /affiliates — List all affiliates (Admin)
// ────────────────────────────────────────────────────────────
router.get("/", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let query = supabase.from("affiliates").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Failed to fetch affiliates" });
  return res.json(data);
});

// ────────────────────────────────────────────────────────────
// PATCH /affiliates/:id/payout — Mark payout (Admin)
// ────────────────────────────────────────────────────────────
router.patch("/:id/payout", requireAdmin, async (req, res) => {
  const { amount } = req.body;
  if (!amount || isNaN(amount)) return res.status(400).json({ error: "Valid amount is required" });

  const { data: aff } = await supabase
    .from("affiliates")
    .select("paid_out")
    .eq("id", req.params.id)
    .single();

  if (!aff) return res.status(404).json({ error: "Affiliate not found" });

  const { data: updated, error } = await supabase
    .from("affiliates")
    .update({ paid_out: aff.paid_out + Number(amount) })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Failed to update payout" });
  return res.json({ success: true, paid_out: updated.paid_out });
});

module.exports = router;
