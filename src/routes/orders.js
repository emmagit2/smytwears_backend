const express  = require("express");
const { z }    = require("zod");
const router   = express.Router();
const supabase = require("../services/supabase");
const email    = require("../services/email");
const paystack = require("../services/paystack");
const { requireAdmin } = require("../middleware/auth");
const { nanoid }       = require("nanoid");

// ─── Constants ────────────────────────────────────────────────────────────────

const FREE_DELIVERY_THRESHOLD = 50000; // naira

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOrderNumber() {
  return "SMYT-" + nanoid(6).toUpperCase();
}

/**
 * Zone-aware base delivery fee — must mirror the frontend logic exactly.
 * @param {string} state        - Full state name (e.g. "Lagos", "FCT")
 * @param {string} deliveryMethod - "standard" | "express"
 * @param {number} subtotal     - Order subtotal in naira
 */
function calcDeliveryFee(state = "", deliveryMethod = "standard", subtotal = 0) {
  if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;

  const s = state.toLowerCase().trim();

  // Base fee by zone
  let baseFee;
  if (s === "lagos")                baseFee = 2500;
  else if (s === "fct" || s === "abuja") baseFee = 3000;
  else                              baseFee = 3500;

  // Express surcharge — Lagos is cheaper (proximity / same-day feasibility)
  if (deliveryMethod === "express") {
    baseFee += s === "lagos" ? 1200 : 2500;
  }

  return baseFee;
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const OrderItemSchema = z.object({
  product_id:   z.union([z.string(), z.number()]),
  product_name: z.string(),
  size:         z.string().optional(),
  color:        z.string().optional(),
  quantity:     z.number().int().positive(),
  unit_price:   z.number().positive(),
});

const PlaceOrderSchema = z.object({
  customer_name:    z.string().min(2),
  customer_email:   z.string().email(),
  customer_phone:   z.string().min(8),
  delivery_address: z.string().min(5),
  delivery_state:   z.string().min(2),
  delivery_method:  z.enum(["standard", "express"]).default("standard"),
  payment_method:   z.enum(["bank_transfer", "card", "pay_on_delivery"]),
  items:            z.array(OrderItemSchema).min(1),
  affiliate_code:   z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /orders — Place a new order
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const parsed = PlaceOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error:   "Validation failed",
      details: parsed.error.flatten(),
    });
  }

  const data = parsed.data;

  // ── Affiliate validation ────────────────────────────────────────────────────
  let affiliateId   = null;
  let affiliateData = null;

  if (data.affiliate_code) {
    const { data: aff, error } = await supabase
      .from("affiliates")
      .select("id, status, commission_rate, total_referrals, total_sales, total_earnings")
      .eq("referral_code", data.affiliate_code)
      .single();

    if (error || !aff || aff.status !== "approved") {
      return res.status(400).json({ error: "Invalid or unapproved affiliate code" });
    }

    affiliateId   = aff.id;
    affiliateData = aff;
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subtotal    = data.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const deliveryFee = calcDeliveryFee(data.delivery_state, data.delivery_method, subtotal);
  const total       = subtotal + deliveryFee;
  const orderNumber = generateOrderNumber();

  // ── Insert order ────────────────────────────────────────────────────────────
  const { data: order, error: insertError } = await supabase
    .from("orders")
    .insert({
      order_number:     orderNumber,
      customer_name:    data.customer_name,
      customer_email:   data.customer_email,
      customer_phone:   data.customer_phone,
      delivery_address: data.delivery_address,
      delivery_state:   data.delivery_state,
      delivery_method:  data.delivery_method,
      items:            data.items,
      subtotal,
      delivery_fee:     deliveryFee,
      total,
      payment_method:   data.payment_method,
      affiliate_code:   data.affiliate_code || null,
      status:           "processing",
      payment_status:   "pending",
    })
    .select()
    .single();

  if (insertError) {
    console.error("Order insert error:", insertError);
    return res.status(500).json({ error: "Failed to create order" });
  }

  // ── Update affiliate stats (fire-and-forget) ────────────────────────────────
  if (affiliateId && affiliateData) {
    const commission = (affiliateData.commission_rate / 100) * total;
    supabase
      .from("affiliates")
      .update({
        total_referrals: affiliateData.total_referrals + 1,
        total_sales:     affiliateData.total_sales + total,
        total_earnings:  affiliateData.total_earnings + commission,
      })
      .eq("id", affiliateId)
      .then()
      .catch((err) => console.error("Affiliate update error:", err));
  }

  // ── Initialize Paystack for card payments ───────────────────────────────────
  let paystackUrl = null;

  if (data.payment_method === "card") {
    try {
      const tx = await paystack.initializeTransaction({
        email:     data.customer_email,
        amount:    total,          // naira — paystack.js converts to kobo
        reference: orderNumber,
        metadata:  {
          order_id:      order.id,
          order_number:  orderNumber,
          customer_name: data.customer_name,
        },
      });
      paystackUrl = tx.authorization_url;
    } catch (err) {
      console.error("Paystack init error:", err.message);
      // Non-fatal — frontend can fall back to /payments/initialize
    }
  }

  // ── Emails (non-blocking) ───────────────────────────────────────────────────
  email.sendOrderConfirmation(order).catch(console.error);
  email
    .sendAdminNotification(
      `New Order: ${orderNumber}`,
      `Customer: ${data.customer_name}\nTotal: ₦${total.toLocaleString()}\nPayment: ${data.payment_method}`
    )
    .catch(console.error);

  return res.status(201).json({
    success:      true,
    order_number: orderNumber,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    ...(paystackUrl && { paystack_url: paystackUrl }),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /orders/track?order_number=SMYT-XXXXXX
// Public — returns only safe fields
// ─────────────────────────────────────────────────────────────────────────────
router.get("/track", async (req, res) => {
  const { order_number } = req.query;
  if (!order_number) return res.status(400).json({ error: "order_number is required" });

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "order_number, status, payment_status, customer_name, delivery_state, items, total, created_at, updated_at, tracking_info"
    )
    .eq("order_number", order_number.toUpperCase())
    .single();

  if (error || !order) return res.status(404).json({ error: "Order not found" });

  return res.json({
    order_number:   order.order_number,
    status:         order.status,
    payment_status: order.payment_status,
    customer_name:  order.customer_name,
    delivery_state: order.delivery_state,
    items_count:    Array.isArray(order.items) ? order.items.length : 0,
    total:          order.total,
    tracking_info:  order.tracking_info || null,
    created_date:   order.created_at,
    updated_date:   order.updated_at,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /orders/status — Update order status (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const VALID_STATUSES = ["confirmed", "shipped", "out_for_delivery", "delivered", "cancelled"];

router.post("/status", requireAdmin, async (req, res) => {
  const { order_id, status, tracking_info } = req.body;

  if (!order_id)                    return res.status(400).json({ error: "order_id is required" });
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  const { data: order, error } = await supabase
    .from("orders")
    .update({ status, ...(tracking_info && { tracking_info }) })
    .eq("id", order_id)
    .select()
    .single();

  if (error || !order) return res.status(404).json({ error: "Order not found" });

  email.sendOrderStatusUpdate(order).catch(console.error);

  return res.json({
    success:      true,
    status:       order.status,
    order_number: order.order_number,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /orders/payment — Confirm bank transfer (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/payment", requireAdmin, async (req, res) => {
  const { order_id, payment_reference } = req.body;
  if (!order_id || !payment_reference) {
    return res.status(400).json({ error: "order_id and payment_reference are required" });
  }

  const { data: order, error } = await supabase
    .from("orders")
    .update({
      payment_status:    "paid",
      status:            "confirmed",
      payment_reference,
    })
    .eq("id", order_id)
    .select()
    .single();

  if (error || !order) return res.status(404).json({ error: "Order not found" });

  email.sendPaymentConfirmation(order).catch(console.error);

  return res.json({ success: true, order_number: order.order_number });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /orders — List all orders (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", requireAdmin, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const from = (Number(page) - 1) * Number(limit);
  const to   = from + Number(limit) - 1;

  let query = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: "Failed to fetch orders" });

  return res.json({
    orders: data,
    total:  count,
    page:   Number(page),
    limit:  Number(limit),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /orders/:id — Single order (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", requireAdmin, async (req, res) => {
  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !order) return res.status(404).json({ error: "Order not found" });
  return res.json(order);
});

module.exports = router;