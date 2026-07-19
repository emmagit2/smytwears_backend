const express  = require("express");
const { z }    = require("zod");
const router   = express.Router();
const supabase = require("../services/supabase");
const email    = require("../services/email");
const paystack = require("../services/paystack");
const { requireAdmin } = require("../middleware/auth");
const { nanoid }       = require("nanoid");
const { creditAffiliateForOrder } = require("../services/affiliateCredit");
const { sendPurchaseEvent }       = require("../services/metaConversions");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOrderNumber() {
  return "SMYT-" + nanoid(6).toUpperCase();
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

// Shipbubble courier choice, captured at checkout from the /delivery/rates
// response. request_token expires after 7 days, and is what's used later
// to actually create the shipment once payment is confirmed.
const ShippingSchema = z.object({
  request_token: z.string(),
  courier_id:    z.union([z.string(), z.number()]),
  service_code:  z.string(),
}).optional();

const PlaceOrderSchema = z.object({
  customer_name:    z.string().min(2),
  customer_email:   z.string().email(),
  customer_phone:   z.string().min(8),
  delivery_address: z.string().min(5),
  delivery_state:   z.string().min(2),
  delivery_method:  z.string().default("standard"), // now holds the courier name, e.g. "Dellyman"
  delivery_fee:     z.number().nonnegative(),        // real Shipbubble price from checkout, trusted as-is
  payment_method:   z.enum(["bank_transfer", "card", "pay_on_delivery"]),
  items:            z.array(OrderItemSchema).min(1),
  shipping:         ShippingSchema,
  affiliate_code:   z.string().optional(),
  // Meta browser cookies, forwarded from Checkout.jsx — used later by
  // metaConversions.js to attach fbp/fbc to the server-side Purchase event
  // once payment is confirmed. Nullish (not just optional) since the
  // frontend sends an explicit `null` — not `undefined` — when a visitor
  // doesn't have these cookies yet (e.g. first-party cookies blocked, or
  // no Pixel init yet), and Zod's .optional() alone rejects null.
  fbp:              z.string().nullish(),
  fbc:              z.string().nullish(),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /orders — Place a new order
// NOTE: affiliate_code is validated and stored on the order here, but the
// affiliate's stats are NOT updated at this point — only once payment is
// actually confirmed. For card orders that happens in payments.js
// (markOrderPaid, called from /verify and /webhook). For bank transfers it
// happens below in POST /payment. This avoids crediting affiliates for
// orders that are never actually paid for.
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

  // ── Affiliate validation only — no stats update here ───────────────────────
  if (data.affiliate_code) {
    const { data: aff, error } = await supabase
      .from("affiliates")
      .select("id, status")
      .eq("referral_code", data.affiliate_code)
      .single();

    if (error || !aff || aff.status !== "approved") {
      return res.status(400).json({ error: "Invalid or unapproved affiliate code" });
    }
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  // delivery_fee now comes straight from the real Shipbubble rate the
  // customer saw and picked at checkout — not recalculated here, so what
  // they were charged always matches what they were shown.
  const subtotal    = data.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const deliveryFee = data.delivery_fee;
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
      affiliate_credited: false,
      fbp:              data.fbp || null,
      fbc:              data.fbc || null,
      status:           "processing",
      payment_status:   "pending",
      // Courier choice from checkout — request_token, courier_id, service_code.
      // shipment_order_id / tracking_url / shipment_status get filled in later,
      // in payments.js, once payment is confirmed and the real shipment is created.
      ...(data.shipping && {
        shipbubble_data: {
          request_token: data.shipping.request_token,
          courier_id:    data.shipping.courier_id,
          courier_name:  data.delivery_method,
          service_code:  data.shipping.service_code,
        },
      }),
    })
    .select()
    .single();

  if (insertError) {
    console.error("Order insert error:", insertError);
    return res.status(500).json({ error: "Failed to create order" });
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
      "order_number, status, payment_status, customer_name, delivery_state, items, total, created_at, updated_at, tracking_info, shipbubble_data"
    )
    .eq("order_number", order_number.toUpperCase())
    .single();

  if (error || !order) return res.status(404).json({ error: "Order not found" });

  // Pixel-safe subset for client-side conversion tracking — product_id +
  // quantity only. Deliberately excludes name/size/color/unit_price so this
  // public, unauthenticated endpoint doesn't leak full order line-item detail
  // to anyone who knows/guesses an order number.
  const pixelItems = Array.isArray(order.items)
    ? order.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }))
    : [];

  // Only expose the customer-facing subset of shipbubble_data — never the
  // internal request_token.
  const shipping = order.shipbubble_data
    ? {
        courier_name:  order.shipbubble_data.courier_name,
        tracking_url:  order.shipbubble_data.shipment_tracking_url || null,
        shipment_status: order.shipbubble_data.shipment_status || null,
      }
    : null;

  return res.json({
    order_number:   order.order_number,
    status:         order.status,
    payment_status: order.payment_status,
    customer_name:  order.customer_name,
    delivery_state: order.delivery_state,
    items_count:    Array.isArray(order.items) ? order.items.length : 0,
    pixel_items:    pixelItems,
    total:          order.total,
    tracking_info:  order.tracking_info || null,
    shipping,
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
// Payment confirmed here, so it's the right place to credit the referring
// affiliate (if any) for this order, and to fire the server-side Meta
// Conversions API Purchase event (deduplicated against the browser Pixel
// event via event_id = order_number).
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

  creditAffiliateForOrder(order).catch(err => console.error("Affiliate credit error:", err));
  sendPurchaseEvent(order, req).catch(err => console.error("Meta CAPI error:", err));

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

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /orders/:order_number/update — Update status / payment_status (Admin)
// If this route is used to manually mark payment_status as "paid" (e.g.
// correcting a record), it also credits the affiliate and fires the Meta
// CAPI Purchase event — same as /payment.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:order_number/update", requireAdmin, async (req, res) => {
  const { status, payment_status, tracking_info } = req.body;

  const updates = {};
  if (status)         updates.status         = status;
  if (payment_status) updates.payment_status = payment_status;
  if (tracking_info !== undefined) updates.tracking_info = tracking_info;

  const { data: order, error } = await supabase
    .from("orders")
    .update(updates)
    .eq("order_number", req.params.order_number.toUpperCase())
    .select()
    .single();

  if (error || !order) return res.status(404).json({ error: "Order not found" });

  if (payment_status === "paid") {
    creditAffiliateForOrder(order).catch(err => console.error("Affiliate credit error:", err));
    sendPurchaseEvent(order, req).catch(err => console.error("Meta CAPI error:", err));
  }

  email.sendOrderStatusUpdate(order).catch(console.error);

  return res.json({ success: true, order_number: order.order_number });
});

module.exports = router;