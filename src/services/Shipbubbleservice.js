const SHIPBUBBLE_BASE_URL = "https://api.shipbubble.com/v1";
const FASHION_WEARS_CATEGORY_ID = 74794423; // confirmed from live account via /debug-categories

// Default box size for shirts/tanktops etc, in CM. Adjust if you ship bulkier items.
const DEFAULT_PACKAGE_DIMENSION = { length: 25, width: 20, height: 8 };

// Cache the sender (warehouse) address_code in memory after first validation,
// so we don't call the paid validate-address endpoint on every request.
let cachedSenderAddressCode = null;

function authHeaders() {
  if (!process.env.SHIPBUBBLE_API_KEY) {
    throw new Error("SHIPBUBBLE_API_KEY is not set in .env");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SHIPBUBBLE_API_KEY}`,
  };
}

async function shipbubbleRequest(path, options = {}) {
  const res = await fetch(`${SHIPBUBBLE_BASE_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || data.status !== "success") {
    const message = data?.message || `Shipbubble request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.details = data;
    throw error;
  }

  return data.data;
}

// Validates an address with Shipbubble and returns its address_code.
async function validateAddress({ name, email, phone, address }) {
  return shipbubbleRequest("/shipping/address/validate", {
    method: "POST",
    body: JSON.stringify({ name, email, phone, address }),
  });
}

// Gets (and caches) the warehouse/sender address_code.
// Reads sender details from env vars, set these once in your .env file.
async function getSenderAddressCode() {
  if (cachedSenderAddressCode) return cachedSenderAddressCode;

  const required = [
    "SHIP_FROM_NAME",
    "SHIP_FROM_EMAIL",
    "SHIP_FROM_PHONE",
    "SHIP_FROM_ADDRESS",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing sender address env vars: ${missing.join(", ")}`);
  }

  const result = await validateAddress({
    name: process.env.SHIP_FROM_NAME,
    email: process.env.SHIP_FROM_EMAIL,
    phone: process.env.SHIP_FROM_PHONE,
    address: process.env.SHIP_FROM_ADDRESS,
  });

  cachedSenderAddressCode = result.address_code;
  return cachedSenderAddressCode;
}

// Converts your cart items array into the shape Shipbubble's rates API expects.
// Expects items like: { product_name, quantity, unit_price, ...(optional) weight }
function buildPackageItems(items) {
  return items.map((item) => ({
    name: item.product_name || item.name,
    description: item.product_name || item.name,
    unit_weight: item.weight_kg || 0.25, // default ~250g per clothing item, adjust as needed
    unit_amount: item.unit_price,
    quantity: item.quantity,
  }));
}

// Main function: given a customer's delivery details + cart items, returns
// courier options with delivery price (rate_card_amount) and delivery_eta.
async function getDeliveryRates({ customer, items, pickupDate }) {
  const senderAddressCode = await getSenderAddressCode();

  const receiver = await validateAddress({
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address, // full street + LGA + state string
  });

  const packageItems = buildPackageItems(items);
  const totalWeight = packageItems.reduce(
    (sum, i) => sum + i.unit_weight * i.quantity,
    0
  );

  const rates = await shipbubbleRequest("/shipping/fetch_rates", {
    method: "POST",
    body: JSON.stringify({
      sender_address_code: senderAddressCode,
      reciever_address_code: receiver.address_code,
      pickup_date: pickupDate || defaultPickupDate(),
      category_id: FASHION_WEARS_CATEGORY_ID,
      package_items: packageItems,
      package_dimension: DEFAULT_PACKAGE_DIMENSION,
    }),
  });

  return {
    request_token: rates.request_token, // save this, needed later to create the shipment
    couriers: rates.couriers.map((c) => ({
      courier_id: c.courier_id,
      courier_name: c.courier_name,
      service_code: c.service_code,
      delivery_price: c.rate_card_amount,
      currency: c.currency,
      delivery_eta: c.delivery_eta, // human readable e.g. "Within 23 hrs"
      delivery_eta_time: c.delivery_eta_time, // actual datetime estimate
      service_type: c.service_type, // "pickup" or "dropoff"
    })),
    cheapest_courier: rates.cheapest_courier?.courier_id,
    fastest_courier: rates.fastest_courier?.courier_id,
    total_weight_kg: totalWeight,
  };
}

// Creates the actual shipment/label with Shipbubble — call this ONLY after
// payment is confirmed. Uses the request_token + courier choice saved on
// the order at checkout time (order.shipbubble_data).
// Returns { shipment_order_id, tracking_url, shipment_status }.
async function createShipment({ request_token, service_code, courier_id }) {
  const result = await shipbubbleRequest("/shipping/labels", {
    method: "POST",
    body: JSON.stringify({ request_token, service_code, courier_id }),
  });

  return {
    shipment_order_id: result.order_id,       // e.g. "SB-2CF48224272"
    tracking_url:      result.tracking_url,
    shipment_status:   result.status,          // e.g. "pending"
  };
}

// Shipment rates requested after 6PM WAT get scheduled for next day by Shipbubble,
// and requests can only be made up to 7 days ahead - so default to tomorrow.
function defaultPickupDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0]; // yyyy-mm-dd
}

module.exports = {
  validateAddress,
  getSenderAddressCode,
  getDeliveryRates,
  createShipment,
};