const express  = require("express");
const { z }    = require("zod");
const crypto   = require("crypto");
const router   = express.Router();
const supabase = require("../services/supabase");
const email    = require("../services/email");
const { requireAdmin } = require("../middleware/auth");

function generateCode() {
  return String(crypto.randomInt(100000, 1000000)); // always 6 digits
}

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
// First-time approval only: generates the referral_code and sends
// the welcome email. Use PATCH /:id to suspend/reinstate afterward.
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

  // Reuse the existing code if this affiliate was approved before
  // (e.g. re-approving after a suspension) instead of minting a new one.
  let referral_code = aff.referral_code;
  if (!referral_code) {
    const firstName = aff.full_name.split(" ")[0].toUpperCase().slice(0, 8);
    const suffix    = String(Math.floor(Math.random() * 90) + 10);
    referral_code   = `SMYT-${firstName}${suffix}`;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("affiliates")
    .update({
      status:          "approved",
      referral_code,
      commission_rate: commission_rate || aff.commission_rate || 10,
    })
    .eq("id", affiliate_id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: "Failed to approve affiliate" });

  // Only send the welcome email the first time they're approved
  console.log('Approve check — had referral_code before?', aff.referral_code);
  if (!aff.referral_code) {
    console.log('Sending welcome email to', updated.email);
    email.sendAffiliateWelcome(updated)
      .then(() => console.log('Welcome email sent successfully'))
      .catch(err => console.error('Welcome email FAILED:', err));
  }

  return res.json({ success: true, referral_code });
});

// ────────────────────────────────────────────────────────────
// PATCH /affiliates/:id — Update status and/or commission (Admin)
// Use this to suspend, reinstate to pending, or adjust an existing
// affiliate's commission rate without regenerating their code.
// (Use POST /approve instead for the first-time approve, since that
// route also generates the referral_code and sends the welcome email.)
// ────────────────────────────────────────────────────────────
const PatchSchema = z.object({
  status:          z.enum(["pending", "approved", "suspended"]).optional(),
  commission_rate: z.number().min(0).max(100).optional(),
}).refine(d => d.status !== undefined || d.commission_rate !== undefined, {
  message: "Provide at least one of status or commission_rate",
});

router.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { data: aff, error: fetchErr } = await supabase
    .from("affiliates")
    .select("id, referral_code")
    .eq("id", req.params.id)
    .single();

  if (fetchErr || !aff) return res.status(404).json({ error: "Affiliate not found" });

  // Approving to "approved" via this route requires an existing
  // referral_code — if they've never been approved before, send them
  // through POST /approve instead so a code gets generated.
  if (parsed.data.status === "approved" && !aff.referral_code) {
    return res.status(400).json({ error: "Affiliate has no referral code yet. Use the approve endpoint for first-time approval." });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("affiliates")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: "Failed to update affiliate" });

  return res.json({ success: true, affiliate: updated });
});

// ────────────────────────────────────────────────────────────
// POST /affiliates/request-code — Send a 5-minute dashboard access code
// ────────────────────────────────────────────────────────────
router.post("/request-code", async (req, res) => {
  const { email: userEmail } = req.body;
  if (!userEmail) return res.status(400).json({ error: "email is required" });

  // Always return the same generic response — don't reveal
  // whether the email is registered or approved.
  const generic = { success: true, message: "If this email is registered, a code has been sent." };

  const { data: aff } = await supabase
    .from("affiliates")
    .select("*")
    .eq("email", userEmail.toLowerCase())
    .single();

  if (!aff || aff.status !== "approved") {
    console.log('request-code: no approved affiliate for', userEmail);
    return res.json(generic);
  }

  const code = generateCode();
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error: updateErr } = await supabase
    .from("affiliates")
    .update({ verification_code: code, verification_code_expires_at: expires_at })
    .eq("id", aff.id);

  if (updateErr) {
    console.error("Failed to store verification code:", updateErr);
    return res.status(500).json({ error: "Failed to send code" });
  }

  console.log('Sending verification code to', aff.email);
  email.sendAffiliateVerificationCode(aff, code)
    .then(() => console.log('Verification code email sent successfully'))
    .catch(err => console.error('Verification code email FAILED:', err));

  return res.json(generic);
});

// ────────────────────────────────────────────────────────────
// POST /affiliates/verify-code — Verify code, return dashboard data
// ────────────────────────────────────────────────────────────
router.post("/verify-code", async (req, res) => {
  const { email: userEmail, code } = req.body;
  if (!userEmail || !code) return res.status(400).json({ error: "email and code are required" });

  const { data: aff, error } = await supabase
    .from("affiliates")
    .select("*")
    .eq("email", userEmail.toLowerCase())
    .single();

  if (error || !aff) return res.status(400).json({ error: "Invalid or expired code" });

  const expired = !aff.verification_code_expires_at || new Date(aff.verification_code_expires_at) < new Date();
  if (!aff.verification_code || aff.verification_code !== code || expired) {
    return res.status(400).json({ error: "Invalid or expired code" });
  }

  // One-time use — clear it immediately so it can't be reused
  await supabase
    .from("affiliates")
    .update({ verification_code: null, verification_code_expires_at: null })
    .eq("id", aff.id);

  const { data: orders } = await supabase
    .from("orders")
    .select("order_number,total,status,created_at")
    .eq("affiliate_code", aff.referral_code)
    .order("created_at", { ascending: false })
    .limit(10);

  const recent_orders = (orders || []).map(o => ({
    order_number: o.order_number,
    total:        o.total,
    status:       o.status,
    commission:   Math.round((aff.commission_rate / 100) * o.total),
    date:         o.created_at,
  }));

  // NOTE: id and bank_verified are included below — the frontend needs
  // aff.id to call /affiliates/:id/bank-details, and bank_verified to
  // decide whether to show the bank details form or the saved details.
  return res.json({
    id:                  aff.id,
    full_name:           aff.full_name,
    referral_code:       aff.referral_code,
    status:              aff.status,
    commission_rate:     aff.commission_rate,
    total_referrals:     aff.total_referrals,
    total_sales:         aff.total_sales,
    total_earnings:      aff.total_earnings,
    paid_out:            aff.paid_out,
    pending_payout:      aff.total_earnings - aff.paid_out,
    bank_name:           aff.bank_name,
    bank_account_name:   aff.bank_account_name,
    bank_account_number: aff.bank_account_number,
    bank_verified:       aff.bank_verified,
    recent_orders,
  });
});

// ────────────────────────────────────────────────────────────
// GET /affiliates/check?email=... — Used by Navbar to decide
// whether to show the "My Affiliate Dashboard" link
// ────────────────────────────────────────────────────────────
router.get("/check", async (req, res) => {
  const { email: userEmail } = req.query;
  if (!userEmail) return res.status(400).json({ error: "email is required" });

  const { data: aff } = await supabase
    .from("affiliates")
    .select("status")
    .eq("email", userEmail.toLowerCase())
    .single();

  return res.json({ isAffiliate: !!aff && aff.status === "approved" });
});

// ────────────────────────────────────────────────────────────
// GET /affiliates/stats?code=SMYT-JOHN20 — Dashboard data
// (kept for backward compatibility / admin lookup by code)
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
    id:                aff.id,
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
    bank_verified:     aff.bank_verified,
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

// ────────────────────────────────────────────────────────────
// POST /affiliates/:id/bank-details — Verify + save payout account
// Resolves the account with Paystack first (so we always store the
// bank's own name for the account, not whatever the user typed), then
// marks bank_verified = true. affiliate id comes from the URL param,
// not the body, and this route is relative — it's already mounted
// under /affiliates by app.js, so the path here must NOT repeat
// "/affiliates" or every request 404s.
// ────────────────────────────────────────────────────────────
router.post("/:id/bank-details", async (req, res) => {
  const { id } = req.params;
  const { bank_code, bank_name, account_number } = req.body;

  if (!bank_code || !bank_name || !account_number) {
    return res.status(400).json({ error: "bank_code, bank_name, and account_number are required." });
  }

  try {
    const resolveRes = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const resolved = await resolveRes.json();

    if (!resolved.status) {
      return res.status(400).json({ error: "Could not verify this account number." });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("affiliates")
      .update({
        bank_code,
        bank_name,
        bank_account_number: account_number,
        bank_account_name:   resolved.data.account_name,
        bank_verified:       true,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr || !updated) {
      console.error("Bank details update error:", updateErr);
      return res.status(500).json({ error: "Failed to save bank details." });
    }

    return res.json(updated);
  } catch (err) {
    console.error("Bank verification error:", err);
    return res.status(500).json({ error: "Verification service unavailable. Please try again shortly." });
  }
});

module.exports = router;