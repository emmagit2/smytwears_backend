const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const PRIMARY_HX   = "#8e2424";
const APP_NAME     = process.env.APP_NAME     || "SMYT";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://smytwears.com";

// This MUST be an address on a domain you've verified inside Resend
// (Resend > Domains > smytwears.com > Verified). You do NOT need a real
// mailbox for it — e.g. "SMYT <orders@smytwears.com>" works once the
// domain's DNS records (SPF/DKIM/DMARC) are verified.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || `${APP_NAME} <orders@smytwears.com>`;

const LOGO_URL = "https://media.base44.com/images/public/user_69a93c23df926b837556fde6/764ab1c23_cropped-SMYT-WITH-TAGLINE-RED-TRANSPARENT-1-scaled-1-120x69.png";

// ── Social icons using official simple-icons CDN ─────────────
const SOCIAL_ICONS = `
<table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px;">
  <tr>
    <td style="padding:0 8px;text-align:center;">
      <a href="https://facebook.com/selfmade.smyt" style="text-decoration:none;">
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/facebook.svg"
             alt="Facebook" width="24" height="24"
             style="display:block;margin:0 auto 4px;filter:invert(28%) sepia(89%) saturate(1200%) hue-rotate(200deg) brightness(90%);" />
        <span style="font-size:9px;color:#aaaaaa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Facebook</span>
      </a>
    </td>
    <td style="padding:0 8px;text-align:center;">
      <a href="https://instagram.com/selfmade.smyt" style="text-decoration:none;">
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/instagram.svg"
             alt="Instagram" width="24" height="24"
             style="display:block;margin:0 auto 4px;filter:invert(22%) sepia(80%) saturate(2000%) hue-rotate(290deg) brightness(85%);" />
        <span style="font-size:9px;color:#aaaaaa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Instagram</span>
      </a>
    </td>
    <td style="padding:0 8px;text-align:center;">
      <a href="https://twitter.com/selfmade.smyt" style="text-decoration:none;">
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/x.svg"
             alt="X / Twitter" width="24" height="24"
             style="display:block;margin:0 auto 4px;filter:invert(0%);" />
        <span style="font-size:9px;color:#aaaaaa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">X</span>
      </a>
    </td>
    <td style="padding:0 8px;text-align:center;">
      <a href="https://tiktok.com/@selfmade.smyt" style="text-decoration:none;">
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/tiktok.svg"
             alt="TikTok" width="24" height="24"
             style="display:block;margin:0 auto 4px;filter:invert(0%);" />
        <span style="font-size:9px;color:#aaaaaa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">TikTok</span>
      </a>
    </td>
  </tr>
</table>`;

// ── Base Template ─────────────────────────────────────────────
function baseTemplate(badgeText, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;">

          <!-- HEADER -->
          <tr>
            <td style="background:#ffffff;padding:28px 36px;text-align:center;border-bottom:3px solid ${PRIMARY_HX};">
              <img src="${LOGO_URL}"
                   alt="${APP_NAME} — Self Made You Today"
                   width="120" height="69"
                   style="display:block;margin:0 auto;" />
            </td>
          </tr>

          <!-- HERO BAND -->
          <tr>
            <td style="background:#ffffff;border-bottom:1px solid #f0f0f0;padding:14px 36px;">
              <span style="background:${PRIMARY_HX};color:#ffffff;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border-radius:2px;">${badgeText}</span>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:36px 36px 28px;">
              ${body}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#ffffff;border-top:3px solid ${PRIMARY_HX};padding:28px 36px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">

                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    <img src="${LOGO_URL}"
                         alt="${APP_NAME}"
                         width="80" height="46"
                         style="display:block;margin:0 auto;" />
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    ${SOCIAL_ICONS}
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <a href="${FRONTEND_URL}/shop" style="font-size:12px;color:#888888;text-decoration:none;margin:0 8px;">Shop</a>
                    <a href="${FRONTEND_URL}/track" style="font-size:12px;color:#888888;text-decoration:none;margin:0 8px;">Track Order</a>
                    <a href="${FRONTEND_URL}/contact" style="font-size:12px;color:#888888;text-decoration:none;margin:0 8px;">Contact Us</a>
                    <a href="https://wa.me/2348012345678" style="font-size:12px;color:#888888;text-decoration:none;margin:0 8px;">WhatsApp</a>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="font-size:11px;color:#bbbbbb;line-height:1.9;">
                    &copy; ${new Date().getFullYear()} ${APP_NAME} &mdash; Self Made You Today<br>
                    <a href="${FRONTEND_URL}" style="color:#bbbbbb;">${FRONTEND_URL}</a> &nbsp;&middot;&nbsp;
                    You received this because you have an account or placed an order.<br>
                    <a href="${FRONTEND_URL}/unsubscribe" style="color:#bbbbbb;text-decoration:underline;">Unsubscribe</a>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- BOTTOM STRIPE -->
          <tr><td style="background:${PRIMARY_HX};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Shared snippets ───────────────────────────────────────────
const sectionLabel = (text) =>
  `<p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#aaaaaa;margin:0 0 10px;">${text}</p>`;

const infoBox = (rows) => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #ececec;border-radius:4px;margin:0 0 20px;overflow:hidden;">
  ${rows.map(([label, value, valueStyle]) => `
  <tr>
    <td style="padding:11px 16px;font-size:13px;color:#555555;border-bottom:1px solid #f4f4f4;">${label}</td>
    <td style="padding:11px 16px;font-size:13px;text-align:right;border-bottom:1px solid #f4f4f4;${valueStyle || "color:#111111;font-weight:600;"}">${value}</td>
  </tr>`).join("")}
</table>`;

const ctaButton = (text, url) =>
  `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;">
    <tr>
      <td align="center">
        <a href="${url}" style="display:inline-block;background:${PRIMARY_HX};color:#ffffff;padding:14px 40px;border-radius:3px;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${text}</a>
      </td>
    </tr>
  </table>`;

const divider = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td style="height:1px;background:#eeeeee;font-size:0;">&nbsp;</td></tr></table>`;

// ── Central send helper ─────────────────────────────────────
// Wraps resend.emails.send so every function below has consistent
// error handling and logging instead of repeating try/catch everywhere.
async function send({ to, subject, html, text }) {
  const payload = { from: FROM_EMAIL, to, subject };
  if (html) payload.html = html;
  if (text) payload.text = text;

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    console.error("Resend send error:", error);
    throw new Error(`Failed to send email: ${error.message || error}`);
  }
  return data;
}

// ── Order Confirmation ────────────────────────────────────────
async function sendOrderConfirmation(order) {
  const itemRows = order.items.map(i => `
  <tr>
    <td style="padding:10px 0;font-size:13px;color:#333333;border-bottom:1px dashed #ececec;vertical-align:top;">
      <div style="font-weight:500;">${i.product_name}</div>
      <div style="font-size:12px;color:#999999;margin-top:2px;">
        ${[i.size, i.color].filter(Boolean).join(" / ")} &nbsp;&times;&nbsp; ${i.quantity}
      </div>
    </td>
    <td style="padding:10px 0;font-size:13px;font-weight:600;color:#111111;text-align:right;border-bottom:1px dashed #ececec;vertical-align:top;">
      &#8358;${Number(i.price * i.quantity).toLocaleString()}
    </td>
  </tr>`).join("");

  const bankSection = order.payment_method === "bank_transfer" ? `
    ${divider}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf8f8;border:1px solid rgba(142,36,36,0.15);border-left:3px solid ${PRIMARY_HX};border-radius:0 4px 4px 0;margin:0 0 16px;">
      <tr><td style="padding:18px 20px;">
        <p style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${PRIMARY_HX};margin:0 0 12px;">Bank Transfer Details</p>
        ${[
          ["Bank", "Zenith Bank"],
          ["Account Name", "Self Made You Today Ltd"],
          ["Account Number", "1234567890"],
          ["Amount", `&#8358;${Number(order.total).toLocaleString()}`],
          ["Reference", order.order_number],
        ].map(([l, v]) => `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid rgba(142,36,36,0.08);">
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#555555;">${l}</td>
            <td style="padding:5px 0;font-size:13px;font-weight:600;color:#111111;text-align:right;">${v}</td>
          </tr>
        </table>`).join("")}
      </td></tr>
    </table>
    <p style="font-size:13px;color:#888888;margin:0 0 16px;">Use your order number as the transfer narration. Your order will be confirmed once payment is received.</p>
  ` : "";

  const body = `
    <p style="font-size:15px;color:#333333;line-height:1.75;margin:0 0 20px;">
      Hi <strong style="color:#111111;">${order.customer_name}</strong>, your order is confirmed and is being prepared for delivery.
    </p>
    ${sectionLabel("Order details")}
    ${infoBox([
      ["Order number", order.order_number],
      ["Status", `<span style="background:#fff7ed;color:#c2530a;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.5px;">Processing</span>`, ""],
      ["Delivery to", order.delivery_state],
    ])}
    ${sectionLabel("Items ordered")}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
      ${itemRows}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;">
      <tr>
        <td style="font-size:13px;color:#999999;padding:6px 0;">Delivery fee</td>
        <td style="font-size:13px;color:#999999;text-align:right;padding:6px 0;">&#8358;${Number(order.delivery_fee).toLocaleString()}</td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PRIMARY_HX};border-radius:3px;">
      <tr>
        <td style="padding:14px 16px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;">Total</td>
        <td style="padding:14px 16px;font-size:18px;font-weight:800;color:#ffffff;text-align:right;">&#8358;${Number(order.total).toLocaleString()}</td>
      </tr>
    </table>
    ${bankSection}
    ${divider}
    ${ctaButton("Track My Order", `${FRONTEND_URL}/track?order=${order.order_number}`)}
  `;

  return send({
    to:      order.customer_email,
    subject: `Order Confirmed — ${order.order_number}`,
    html:    baseTemplate("Order Confirmed", body),
  });
}

// ── Order Status Update ───────────────────────────────────────
const STATUS_COPY = {
  confirmed:        { emoji: "✅", label: "Payment Confirmed",  msg: "Your payment has been confirmed and your order is being prepared." },
  shipped:          { emoji: "🚚", label: "Order Shipped",      msg: "Your order is on its way!" },
  out_for_delivery: { emoji: "📦", label: "Out for Delivery",   msg: "Your order is out for delivery today." },
  delivered:        { emoji: "🎉", label: "Order Delivered",    msg: "Your order has been delivered. Enjoy!" },
  cancelled:        { emoji: "❌", label: "Order Cancelled",    msg: "Your order has been cancelled. Contact us if you have questions." },
};

async function sendOrderStatusUpdate(order) {
  const { emoji, label, msg } = STATUS_COPY[order.status] || { emoji: "📋", label: "Status Updated", msg: "Your order status has been updated." };

  const trackingBlock = order.tracking_info ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border-left:3px solid ${PRIMARY_HX};border-radius:0 4px 4px 0;margin:0 0 20px;">
      <tr><td style="padding:16px 20px;font-size:13px;color:#444444;line-height:1.7;">${order.tracking_info}</td></tr>
    </table>` : "";

  const body = `
    <p style="font-size:15px;color:#333333;line-height:1.75;margin:0 0 8px;">
      Hi <strong style="color:#111111;">${order.customer_name}</strong>,
    </p>
    <p style="font-size:22px;margin:0 0 8px;">${emoji}</p>
    <p style="font-size:18px;font-weight:700;color:#111111;letter-spacing:0.5px;margin:0 0 12px;">${label}</p>
    <p style="font-size:15px;color:#555555;line-height:1.75;margin:0 0 20px;">${msg}</p>
    ${trackingBlock}
    ${infoBox([["Order", order.order_number]])}
    ${ctaButton("Track My Order", `${FRONTEND_URL}/track?order=${order.order_number}`)}
  `;

  return send({
    to:      order.customer_email,
    subject: `${emoji} ${label} — ${order.order_number}`,
    html:    baseTemplate(label, body),
  });
}

// ── Payment Confirmation ──────────────────────────────────────
async function sendPaymentConfirmation(order) {
  const body = `
    <p style="font-size:15px;color:#333333;line-height:1.75;margin:0 0 20px;">
      Hi <strong style="color:#111111;">${order.customer_name}</strong>,
      we've confirmed your payment for order <strong>${order.order_number}</strong>.
    </p>
    ${infoBox([
      ["Amount Paid", `&#8358;${Number(order.total).toLocaleString()}`],
      ["Reference",   order.payment_reference],
    ])}
    <p style="font-size:15px;color:#555555;line-height:1.75;margin:0 0 20px;">
      Your order is now being prepared for delivery.
    </p>
    ${ctaButton("Track My Order", `${FRONTEND_URL}/track?order=${order.order_number}`)}
  `;

  return send({
    to:      order.customer_email,
    subject: `Payment Confirmed — ${order.order_number}`,
    html:    baseTemplate("Payment Confirmed", body),
  });
}

// ── Affiliate Welcome ─────────────────────────────────────────
async function sendAffiliateWelcome(affiliate) {
  const body = `
    <p style="font-size:15px;color:#333333;line-height:1.75;margin:0 0 16px;">
      Hi <strong style="color:#111111;">${affiliate.full_name}</strong>,
      welcome to the SMYT Affiliate Programme! Your application has been approved.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf8f8;border:1px solid rgba(142,36,36,0.15);border-left:3px solid ${PRIMARY_HX};border-radius:0 4px 4px 0;margin:0 0 24px;">
      <tr><td style="padding:20px;">
        <p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${PRIMARY_HX};margin:0 0 12px;">Your Referral Code</p>
        <p style="font-size:28px;font-weight:800;letter-spacing:4px;color:#111111;margin:0 0 12px;">${affiliate.referral_code}</p>
        <p style="font-size:13px;color:#555555;margin:0;">Commission Rate: <strong style="color:#111111;">${affiliate.commission_rate}%</strong> per order</p>
      </td></tr>
    </table>
    ${sectionLabel("How to earn")}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${["Share your referral code with your audience.",
         `When a customer uses your code at checkout, you earn ${affiliate.commission_rate}% of the order value.`,
         "Log in to your dashboard to track earnings and request payouts."
        ].map((step, i) => `
      <tr>
        <td style="padding:8px 0;vertical-align:top;width:28px;">
          <span style="display:inline-block;background:${PRIMARY_HX};color:#ffffff;font-size:11px;font-weight:700;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;">${i + 1}</span>
        </td>
        <td style="padding:8px 0 8px 8px;font-size:14px;color:#444444;line-height:1.7;">${step}</td>
      </tr>`).join("")}
    </table>
    ${ctaButton("View My Dashboard", `${FRONTEND_URL}/affiliate/dashboard`)}
    <p style="font-size:13px;color:#888888;margin:20px 0 0;text-align:center;">
      Questions? Reply to this email or reach us on
      <a href="https://wa.me/2348012345678" style="color:${PRIMARY_HX};">WhatsApp</a>.
    </p>
  `;

  return send({
    to:      affiliate.email,
    subject: `You're approved! Your SMYT referral code is here`,
    html:    baseTemplate("Affiliate Approved", body),
  });
}

// ── Affiliate Dashboard Access Code ─────────────────────────────
async function sendAffiliateVerificationCode(affiliate, code) {
  const body = `
    <p style="font-size:15px;color:#333333;line-height:1.75;margin:0 0 20px;">
      Hi <strong style="color:#111111;">${affiliate.full_name}</strong>, use the code below to access your affiliate dashboard.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf8f8;border:1px solid rgba(142,36,36,0.15);border-left:3px solid ${PRIMARY_HX};border-radius:0 4px 4px 0;margin:0 0 20px;">
      <tr><td style="padding:24px;text-align:center;">
        <p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${PRIMARY_HX};margin:0 0 12px;">Your Verification Code</p>
        <p style="font-size:36px;font-weight:800;letter-spacing:10px;color:#111111;margin:0;">${code}</p>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#888888;margin:0 0 20px;">
      This code expires in <strong>5 minutes</strong>. If you didn't request this, you can safely ignore this email.
    </p>
  `;

  return send({
    to:      affiliate.email,
    subject: `Your SMYT affiliate access code: ${code}`,
    html:    baseTemplate("Verify Access", body),
  });
}

// ── Contact Form Auto-reply ───────────────────────────────────
async function sendContactAutoReply(contact) {
  const body = `
    <p style="font-size:15px;color:#333333;line-height:1.75;margin:0 0 16px;">
      Hi <strong style="color:#111111;">${contact.name}</strong>,
      thanks for reaching out! We've received your message and will get back to you within 24 hours.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid #ececec;border-radius:4px;margin:0 0 24px;">
      <tr><td style="padding:18px 20px;">
        <p style="font-size:13px;color:#555555;margin:0 0 8px;"><strong style="color:#111111;">Subject:</strong> ${contact.subject}</p>
        <p style="font-size:13px;color:#555555;margin:0;line-height:1.7;"><strong style="color:#111111;">Message:</strong> ${contact.message}</p>
      </td></tr>
    </table>
    <p style="font-size:14px;color:#555555;margin:0 0 12px;">You can also reach us directly:</p>
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:4px 0;">
          <a href="https://wa.me/2348012345678" style="font-size:14px;color:${PRIMARY_HX};text-decoration:none;">&#128241; WhatsApp Us</a>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 0;">
          <a href="${FRONTEND_URL}" style="font-size:14px;color:${PRIMARY_HX};text-decoration:none;">&#128717; Visit Our Store</a>
        </td>
      </tr>
    </table>
  `;

  return send({
    to:      contact.email,
    subject: `We got your message, ${contact.name}!`,
    html:    baseTemplate("Message Received", body),
  });
}

// ── Admin Notification ────────────────────────────────────────
async function sendAdminNotification(subject, text) {
  return send({
    to: process.env.ADMIN_EMAIL,
    subject,
    text,
  });
}

module.exports = {
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendPaymentConfirmation,
  sendAffiliateWelcome,
  sendAffiliateVerificationCode,
  sendContactAutoReply,
  sendAdminNotification,
};