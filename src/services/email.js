const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const BRAND_COLOR  = "#1a1a1a";
const ACCENT_COLOR = "#f5a623";
const APP_NAME     = process.env.APP_NAME || "SMYT";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://selfmadeyoutoday.com";

function baseTemplate(title, body) {
  return `
  <!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f4;margin:0;padding:0;}
    .wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;}
    .header{background:${BRAND_COLOR};padding:28px 32px;text-align:center;}
    .header h1{color:#fff;margin:0;font-size:22px;letter-spacing:2px;}
    .body{padding:32px;}
    .body p{color:#444;line-height:1.7;margin:0 0 16px;}
    .highlight{background:#fafafa;border-left:4px solid ${ACCENT_COLOR};padding:16px 20px;border-radius:4px;margin:20px 0;}
    .highlight p{margin:4px 0;font-size:14px;}
    .btn{display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin:8px 0;}
    .footer{background:#f9f9f9;padding:20px 32px;font-size:12px;color:#999;text-align:center;border-top:1px solid #eee;}
  </style></head><body>
  <div class="wrap">
    <div class="header"><h1>${APP_NAME}</h1></div>
    <div class="body">${body}</div>
    <div class="footer">© ${new Date().getFullYear()} ${APP_NAME} — Self Made You Today<br>
      <a href="${FRONTEND_URL}" style="color:#999;">${FRONTEND_URL}</a>
    </div>
  </div></body></html>`;
}

// ── Order Confirmation ────────────────────────────────────────
async function sendOrderConfirmation(order) {
  const itemRows = order.items.map(i =>
    `<p>• ${i.product_name} (${i.size || ""}/${i.color || ""}) × ${i.quantity} — ₦${Number(i.price * i.quantity).toLocaleString()}</p>`
  ).join("");

  const bankSection = order.payment_method === "bank_transfer" ? `
    <div class="highlight">
      <p><strong>Bank Transfer Details</strong></p>
      <p>Bank: <strong>Zenith Bank</strong></p>
      <p>Account Name: <strong>Self Made You Today Ltd</strong></p>
      <p>Account Number: <strong>1234567890</strong></p>
      <p>Amount: <strong>₦${Number(order.total).toLocaleString()}</strong></p>
      <p>Reference: <strong>${order.order_number}</strong></p>
    </div>
    <p>Use your order number as the transfer narration. Your order will be confirmed once payment is received.</p>
  ` : "";

  const body = `
    <p>Hi <strong>${order.customer_name}</strong>, thank you for your order! 🎉</p>
    <div class="highlight">
      <p>Order Number: <strong>${order.order_number}</strong></p>
      <p>Status: <strong>Processing</strong></p>
      <p>Delivery to: ${order.delivery_state}</p>
    </div>
    <p><strong>Items Ordered:</strong></p>
    ${itemRows}
    <p>Delivery Fee: ₦${Number(order.delivery_fee).toLocaleString()}</p>
    <p><strong>Total: ₦${Number(order.total).toLocaleString()}</strong></p>
    ${bankSection}
    <a href="${FRONTEND_URL}/track?order=${order.order_number}" class="btn">Track My Order</a>
  `;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to:      order.customer_email,
    subject: `Order Confirmed — ${order.order_number}`,
    html:    baseTemplate("Order Confirmation", body),
  });
}

// ── Order Status Update ───────────────────────────────────────
const STATUS_COPY = {
  confirmed:        { emoji: "✅", msg: "Your payment has been confirmed and your order is being prepared." },
  shipped:          { emoji: "🚚", msg: "Your order is on its way!" },
  out_for_delivery: { emoji: "📦", msg: "Your order is out for delivery today." },
  delivered:        { emoji: "🎉", msg: "Your order has been delivered. Enjoy!" },
  cancelled:        { emoji: "❌", msg: "Your order has been cancelled. Contact us if you have questions." },
};

async function sendOrderStatusUpdate(order) {
  const { emoji, msg } = STATUS_COPY[order.status] || { emoji: "📋", msg: "Your order status has been updated." };
  const trackingBlock  = order.tracking_info
    ? `<div class="highlight"><p>${order.tracking_info}</p></div>`
    : "";

  const body = `
    <p>Hi <strong>${order.customer_name}</strong>,</p>
    <p>${emoji} <strong>${order.status.replace(/_/g, " ").toUpperCase()}</strong></p>
    <p>${msg}</p>
    ${trackingBlock}
    <div class="highlight">
      <p>Order: <strong>${order.order_number}</strong></p>
    </div>
    <a href="${FRONTEND_URL}/track?order=${order.order_number}" class="btn">Track My Order</a>
  `;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to:      order.customer_email,
    subject: `${emoji} Order Update — ${order.order_number}`,
    html:    baseTemplate("Order Update", body),
  });
}

// ── Payment Confirmation ──────────────────────────────────────
async function sendPaymentConfirmation(order) {
  const body = `
    <p>Hi <strong>${order.customer_name}</strong>,</p>
    <p>We've confirmed your payment for order <strong>${order.order_number}</strong>. 🎉</p>
    <div class="highlight">
      <p>Amount Paid: <strong>₦${Number(order.total).toLocaleString()}</strong></p>
      <p>Reference: <strong>${order.payment_reference}</strong></p>
    </div>
    <p>Your order is now being prepared for delivery.</p>
    <a href="${FRONTEND_URL}/track?order=${order.order_number}" class="btn">Track My Order</a>
  `;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to:      order.customer_email,
    subject: `Payment Confirmed — ${order.order_number}`,
    html:    baseTemplate("Payment Confirmed", body),
  });
}

// ── Affiliate Welcome ─────────────────────────────────────────
async function sendAffiliateWelcome(affiliate) {
  const body = `
    <p>Hi <strong>${affiliate.full_name}</strong>,</p>
    <p>Welcome to the SMYT Affiliate Programme! 🚀 Your application has been approved.</p>
    <div class="highlight">
      <p>Your Referral Code: <strong style="font-size:20px;letter-spacing:2px;">${affiliate.referral_code}</strong></p>
      <p>Commission Rate: <strong>${affiliate.commission_rate}%</strong></p>
    </div>
    <p><strong>How to earn:</strong></p>
    <p>1. Share your referral code with your audience.<br>
       2. When a customer uses your code at checkout, you earn ${affiliate.commission_rate}% of the order value.<br>
       3. Log in to your dashboard to track earnings and request payouts.</p>
    <a href="${FRONTEND_URL}/affiliate?code=${affiliate.referral_code}" class="btn">View My Dashboard</a>
    <p>Questions? Reply to this email or reach us on WhatsApp.</p>
  `;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to:      affiliate.email,
    subject: `🎉 You're approved! Your SMYT referral code is here`,
    html:    baseTemplate("Affiliate Approved", body),
  });
}

// ── Contact Form Auto-reply ───────────────────────────────────
async function sendContactAutoReply(contact) {
  const body = `
    <p>Hi <strong>${contact.name}</strong>,</p>
    <p>Thanks for reaching out! We've received your message and will get back to you within 24 hours.</p>
    <div class="highlight">
      <p>Subject: ${contact.subject}</p>
      <p>Message: ${contact.message}</p>
    </div>
    <p>You can also reach us directly:</p>
    <p>📱 <a href="https://wa.me/2348012345678">WhatsApp Us</a></p>
    <p>🛍️ <a href="${FRONTEND_URL}">Visit Our Store</a></p>
  `;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to:      contact.email,
    subject: `We got your message, ${contact.name}!`,
    html:    baseTemplate("Message Received", body),
  });
}

// ── Admin Notification ────────────────────────────────────────
async function sendAdminNotification(subject, text) {
  await transporter.sendMail({
    from:    `"${APP_NAME} System" <${process.env.SMTP_USER}>`,
    to:      process.env.ADMIN_EMAIL,
    subject,
    text,
  });
}

module.exports = {
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendPaymentConfirmation,
  sendAffiliateWelcome,
  sendContactAutoReply,
  sendAdminNotification,
};
