const supabase = require("./supabase");

/**
 * Credits an affiliate for a confirmed sale — call this ONLY once payment
 * has actually been confirmed:
 *   - orders.js  POST /payment           (admin confirms bank transfer)
 *   - orders.js  PATCH /:order_number/update  (admin manually sets payment_status: "paid")
 *   - payments.js markOrderPaid()        (Paystack /verify and /webhook)
 *
 * Never call this at order placement time — the order may never actually
 * get paid for (declined card, abandoned checkout, etc).
 *
 * Guards against double-crediting the same order (e.g. webhook firing twice,
 * or both /verify and /webhook processing the same payment) by checking
 * order.affiliate_credited, which is set true the first time this runs.
 *
 * Requires an `affiliate_credited boolean default false` column on `orders`.
 */
async function creditAffiliateForOrder(order) {
  if (!order.affiliate_code) return;
  if (order.affiliate_credited) return; // already credited — avoid double-counting

  const { data: aff, error: affErr } = await supabase
    .from("affiliates")
    .select("id, commission_rate, total_referrals, total_sales, total_earnings")
    .eq("referral_code", order.affiliate_code)
    .eq("status", "approved")
    .single();

  if (affErr || !aff) {
    console.error("Affiliate credit skipped — affiliate not found or not approved:", order.affiliate_code);
    return;
  }

  const commission = (aff.commission_rate / 100) * order.total;

  const { error: updateErr } = await supabase
    .from("affiliates")
    .update({
      total_referrals: aff.total_referrals + 1,
      total_sales:      aff.total_sales + order.total,
      total_earnings:   aff.total_earnings + commission,
    })
    .eq("id", aff.id);

  if (updateErr) {
    console.error("Affiliate credit failed:", updateErr);
    return;
  }

  // Mark this order as credited so a retried webhook, a /verify call after
  // the webhook already ran, or a repeated admin action can never credit
  // the same order twice.
  const { error: flagErr } = await supabase
    .from("orders")
    .update({ affiliate_credited: true })
    .eq("id", order.id);

  if (flagErr) {
    console.error("Failed to set affiliate_credited flag:", flagErr);
  }
}

module.exports = { creditAffiliateForOrder };