// test-email.js
require("dotenv").config();
const { sendOrderConfirmation } = require("./src/services/email");
sendOrderConfirmation({
  customer_name:  "Test User",
  customer_email: "selfmadeyoutoday@gmail.com",
  order_number:   "ORD-001",
  delivery_state: "Lagos",
  delivery_fee:   2000,
  total:          47000,
  payment_method: "bank_transfer",
  items: [
    {
      product_name: "SMYT Hoodie",
      size:         "XL",
      color:        "Black",
      quantity:     2,
      price:        22500,
    }
  ]
})
.then(() => console.log("✅ Email sent! Check your inbox"))
.catch((err) => console.error("❌ Failed:", err));