const axios  = require("axios");
const crypto = require("crypto");

const PAYSTACK_BASE = "https://api.paystack.co";

// Lazily read secret so missing env vars surface at call-time, not import-time
const secret = () => {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
};

const http = () =>
  axios.create({
    baseURL: PAYSTACK_BASE,
    headers: {
      Authorization:  `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// initializeTransaction
// amount should be in NAIRA — we convert to kobo internally
// ─────────────────────────────────────────────────────────────────────────────
async function initializeTransaction({ email, amount, reference, metadata, callback_url }) {
  const { data } = await http().post("/transaction/initialize", {
    email,
    amount:       Math.round(amount * 100), // naira → kobo
    reference,
    metadata,
    callback_url: callback_url || `${process.env.FRONTEND_URL}/payment/callback`,
    channels:     ["card", "bank", "ussd", "mobile_money", "bank_transfer"],
  });
  return data.data; // { authorization_url, access_code, reference }
}

// ─────────────────────────────────────────────────────────────────────────────
// verifyTransaction
// Returns the full Paystack transaction object
// ─────────────────────────────────────────────────────────────────────────────
async function verifyTransaction(reference) {
  const { data } = await http().get(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  return data.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// verifyWebhookSignature
// rawBody must be the raw Buffer (use express.raw middleware before this)
// ─────────────────────────────────────────────────────────────────────────────
function verifyWebhookSignature(rawBody, signature) {
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("PAYSTACK_WEBHOOK_SECRET is not set");
  if (!signature) return false;

  const hash = crypto
    .createHmac("sha512", webhookSecret)
    .update(rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

// ─────────────────────────────────────────────────────────────────────────────
// listTransactions (admin use)
// ─────────────────────────────────────────────────────────────────────────────
async function listTransactions({ page = 1, perPage = 50, status } = {}) {
  const params = { page, perPage };
  if (status) params.status = status;
  const { data } = await http().get("/transaction", { params });
  return data.data;
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  listTransactions,
};