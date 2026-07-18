require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");

const ordersRouter     = require("./routes/orders");
const affiliatesRouter = require("./routes/affiliates");
const productsRouter   = require("./routes/products");
const paymentsRouter   = require("./routes/payments");
const contactRouter    = require("./routes/contact");
const deliveryRouter   = require("./routes/delivery");
const webhooksRouter   = require("./routes/webhook");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests, please try again later." },
});
app.use(limiter);

const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      20,
  message: { error: "Order limit reached. Please try again later." },
});

// ── Webhooks — MUST be mounted before express.json() ────────────
// Both Paystack and Shipbubble webhooks need the raw, unparsed request
// body to verify their HMAC signatures. If express.json() runs first,
// it consumes the body stream and signature verification breaks.
app.use("/payments/webhook", express.raw({ type: "application/json" }));
app.use("/webhook", webhooksRouter);

// ── Body parsing (everything else) ──────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Routes ────────────────────────────────────────────────────
app.use("/orders",     orderLimiter, ordersRouter);
app.use("/affiliates", affiliatesRouter);
app.use("/products",   productsRouter);
app.use("/payments",   paymentsRouter);
app.use("/contact",    contactRouter);
app.use("/delivery",   deliveryRouter);

// ── Health check ──────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "SMYT API", timestamp: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Max 5MB per image." });
  }
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  SMYT API running on port ${PORT}`);
  console.log(`📦  Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗  Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;