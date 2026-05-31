const express  = require("express");
const router   = express.Router();
const supabase = require("../services/supabase");
const paystack = require("../services/paystack");
const email    = require("../services/email");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: mark an order as paid and send emails
// Used by both /verify and /webhook to avoid duplication
// ─────────────────────────────────────────────────────────────────────────────
async function markOrderPaid(orderNumber, reference, amountNaira = null) {
  const { data: order, error } = await supabase
    .from("orders")
    .update({
      payment_status:    "paid",
      status:            "confirmed",
      payment_reference: reference,
    })
    .eq("order_number", orderNumber.toUpperCase())
    .eq("payment_status", "pending")   // ← idempotency guard: only update if still pending
    .select()
    .single();

  // .eq("payment_status", "pending") returns null if already paid — that's intentional
  if (error || !order) return null;

  // Emails (non-blocking)
  email.sendPaymentConfirmation(order).catch(console.error);

  if (amountNaira !== null) {
    email
      .sendAdminNotification(
        `Payment Received: ${reference}`,
        `Order: ${reference}\nAmount: ₦${amountNaira.toLocaleString()}\nCustomer: ${order.customer_email}`
      )
      .catch(console.error);
  }

  return order;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /payments/initialize
// Fallback: called if /orders didn't return a paystack_url (e.g. Paystack was
// briefly down when the order was placed, or the client needs a fresh link).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/initialize", async (req, res) => {
  const { order_number } = req.body;
  if (!order_number) return res.status(400).json({ error: "order_number is required" });

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", order_number.toUpperCase())
    .single();

  if (error || !order)               return res.status(404).json({ error: "Order not found" });
  if (order.payment_status === "paid") return res.status(400).json({ error: "Order already paid" });
  if (order.payment_method !== "card") return res.status(400).json({ error: "Order is not a card payment" });

  try {
    const tx = await paystack.initializeTransaction({
      email:     order.customer_email,
      amount:    order.total,          // naira — paystack.js handles kobo conversion
      reference: order.order_number,
      metadata:  {
        order_id:      order.id,
        order_number:  order.order_number,
        customer_name: order.customer_name,
      },
    });

    return res.json({
      success:           true,
      authorization_url: tx.authorization_url,
      access_code:       tx.access_code,
      reference:         tx.reference,
    });
  } catch (err) {
    console.error("Paystack init error:", err.message);
    return res.status(502).json({ error: "Failed to initialize payment" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /payments/verify?reference=SMYT-XXXXXX
// Called by the frontend after Paystack redirects back.
// The webhook usually fires first — markOrderPaid is idempotent so double
// processing is safe.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/verify", async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ error: "reference is required" });

  let tx;
  try {
    tx = await paystack.verifyTransaction(reference);
  } catch (err) {
    console.error("Paystack verify error:", err.message);
    return res.status(502).json({ error: "Verification failed" });
  }

  if (tx.status !== "success") {
    return res.json({ success: false, status: tx.status });
  }

  const order = await markOrderPaid(reference, reference);

  // order will be null if the webhook already processed it — that's fine
  return res.json({
    success:      true,
    status:       "paid",
    order_number: reference.toUpperCase(),
    already_paid: order === null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /payments/webhook
// Register this URL in your Paystack dashboard:
//   https://yourdomain.com/payments/webhook
//
// IMPORTANT: this route needs express.raw() BEFORE json() parses the body,
// so that we can verify the HMAC signature on the raw bytes. Make sure your
// app.js mounts this router BEFORE app.use(express.json()).
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["x-paystack-signature"];

    // Verify signature before touching the body
    let valid;
    try {
      valid = paystack.verifyWebhookSignature(req.body, signature);
    } catch (err) {
      console.error("Webhook signature check error:", err.message);
      return res.status(500).end();
    }

    if (!valid) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    // Parse body
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    // Acknowledge immediately — Paystack retries if it doesn't get 200 fast
    res.sendStatus(200);

    // Process asynchronously after responding
    if (event.event === "charge.success") {
      const ref         = event.data.reference;
      const amountNaira = event.data.amount / 100; // kobo → naira

      try {
        await markOrderPaid(ref, ref, amountNaira);
      } catch (err) {
        console.error("Webhook order update error:", err.message);
      }
    }
  }
);

module.exports = router;