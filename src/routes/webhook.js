const express  = require("express");
const crypto   = require("crypto");
const router   = express.Router();
const supabase = require("../services/supabase");
const email    = require("../services/email");

// ─────────────────────────────────────────────────────────────────────────────
// Maps Shipbubble's package status strings to your own order status values.
// Shipbubble's exact wording can vary slightly by courier, so this matches
// loosely (case-insensitive, substring match) rather than exact equality.
// ─────────────────────────────────────────────────────────────────────────────
function mapShipbubbleStatusToOrderStatus(shipbubbleStatus = "") {
  const s = shipbubbleStatus.toLowerCase();

  if (s.includes("delivered"))         return "delivered";
  if (s.includes("out for delivery"))  return "out_for_delivery";
  if (s.includes("transit") || s.includes("picked up") || s.includes("in-transit")) return "shipped";
  if (s.includes("cancel"))            return "cancelled";

  return null; // unrecognized status — don't overwrite existing order status
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhooks/shipbubble
// Register this URL in your Shipbubble dashboard under webhook settings:
//   https://yourdomain.com/webhooks/shipbubble
//
// IMPORTANT: like the Paystack webhook, this needs express.raw() BEFORE
// json() parses the body, so we can verify the HMAC signature on the raw
// bytes. Mount this router in app.js BEFORE app.use(express.json()).
//
// Shipbubble signs each payload with HMAC-SHA512 using your account's
// SECRET_KEY (from Shipbubble dashboard → Settings → Webhooks — this may be
// a different value from your SHIPBUBBLE_API_KEY, check your dashboard).
// Add it to .env as SHIPBUBBLE_WEBHOOK_SECRET.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/shipbubble",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["x-ship-signature"];

    if (!process.env.SHIPBUBBLE_WEBHOOK_SECRET) {
      console.error("SHIPBUBBLE_WEBHOOK_SECRET is not set in .env");
      return res.status(500).end();
    }

    // Verify signature before touching the body
    const expectedSignature = crypto
      .createHmac("sha512", process.env.SHIPBUBBLE_WEBHOOK_SECRET)
      .update(req.body) // raw bytes, not parsed JSON
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("Shipbubble webhook: invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse body
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    // Acknowledge immediately — Shipbubble retries every 5 min for 5 tries
    // if it doesn't get a fast 200.
    res.sendStatus(200);

    // Process asynchronously after responding
    try {
      const shipmentOrderId = event.order_id;   // "SB-xxxx"
      const rawStatus       = event.status || event.package_status?.[event.package_status.length - 1]?.status;

      if (!shipmentOrderId || !rawStatus) return;

      // Find the order this shipment belongs to, via the shipment_order_id
      // we saved onto shipbubble_data when the shipment was created.
      const { data: order, error } = await supabase
        .from("orders")
        .select("*")
        .eq("shipbubble_data->>shipment_order_id", shipmentOrderId)
        .single();

      if (error || !order) {
        console.warn(`Shipbubble webhook: no order found for shipment ${shipmentOrderId}`);
        return;
      }

      const newStatus = mapShipbubbleStatusToOrderStatus(rawStatus);

      const updates = {
        shipbubble_data: {
          ...order.shipbubble_data,
          shipment_status: rawStatus,
        },
      };
      // Only overwrite the order's main status if we recognized this
      // Shipbubble status and it represents forward progress — never
      // downgrade an already-delivered order, for example.
      if (newStatus) updates.status = newStatus;

      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order.id)
        .select()
        .single();

      if (updateError) {
        console.error("Shipbubble webhook: failed to update order:", updateError);
        return;
      }

      // Notify the customer by email when status actually changed
      if (newStatus && newStatus !== order.status) {
        email.sendOrderStatusUpdate(updated).catch(console.error);
      }
    } catch (err) {
      console.error("Shipbubble webhook processing error:", err.message);
    }
  }
);

module.exports = router;