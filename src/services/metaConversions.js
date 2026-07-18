const crypto = require("crypto");
const axios = require("axios");

const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE;
const API_VERSION = process.env.META_API_VERSION || "v23.0";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const GRAPH_URL = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;

// Hash PII using SHA-256 (required by Meta)
function hash(value = "") {
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex");
}

// Convert Nigerian phone numbers to E.164 format (without +)
function normalizePhone(phone = "") {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return "234" + digits.slice(1);

  return digits;
}

/**
 * Sends a Purchase event to Meta Conversions API
 * @param {Object} order
 * @param {Object} req
 */
async function sendPurchaseEvent(order, req = {}) {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn("[MetaCAPI] Missing META_PIXEL_ID or META_ACCESS_TOKEN");
    return;
  }

  const items = Array.isArray(order.items) ? order.items : [];

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: order.order_number,
        action_source: "website",
        event_source_url: `${FRONTEND_URL}/order-confirmation?order=${order.order_number}`,

        user_data: {
          em: order.customer_email
            ? [hash(order.customer_email)]
            : undefined,

          ph: order.customer_phone
            ? [hash(normalizePhone(order.customer_phone))]
            : undefined,

          client_ip_address:
            req.ip || req.headers?.["x-forwarded-for"],

          client_user_agent:
            req.headers?.["user-agent"],

          fbp: order.fbp || undefined,
          fbc: order.fbc || undefined,
        },

        custom_data: {
          currency: "NGN",
          value: Number(order.total),
          content_type: "product",
          content_ids: items.map((i) => String(i.product_id)),
          num_items: items.reduce(
            (sum, item) => sum + Number(item.quantity),
            0
          ),
        },
      },
    ],

    // Makes the event appear in Meta Test Events
    ...(TEST_EVENT_CODE && {
      test_event_code: TEST_EVENT_CODE,
    }),
  };

  console.log("====================================");
  console.log("[MetaCAPI] Sending Purchase Event");
  console.log("Graph URL:", GRAPH_URL);
  console.log("Pixel ID:", PIXEL_ID);
  console.log("Order:", order.order_number);
  console.log("Payload:");
  console.dir(payload, { depth: null });
  console.log("====================================");

  try {
    const response = await axios.post(GRAPH_URL, payload, {
      params: {
        access_token: ACCESS_TOKEN,
      },
    });

    console.log("✅ [MetaCAPI] Purchase event sent successfully");
    console.log(response.data);

    return response.data;
  } catch (err) {
    console.error("❌ [MetaCAPI] Purchase event failed");

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Response:", err.response.data);
    } else {
      console.error(err.message);
    }

    return null;
  }
}

module.exports = {
  sendPurchaseEvent,
};