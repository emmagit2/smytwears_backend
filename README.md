# SMYT Backend API

> Node.js + Express · Supabase (Postgres) · Cloudflare R2 · Paystack

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | Supabase (PostgreSQL) |
| Image Storage | Cloudflare R2 (S3-compatible) |
| Payments | Paystack |
| Email | Nodemailer (Gmail SMTP) |
| Validation | Zod |

---

## Setup

### 1. Clone & Install

```bash
git clone <your-repo>
cd smyt-backend
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
# Fill in all values in .env
```

### 3. Supabase — Run the Schema

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Open **SQL Editor**
3. Paste and run the contents of `supabase-schema.sql`

### 4. Cloudflare R2 — Bucket Setup

1. Go to **Cloudflare Dashboard → R2**
2. Create a bucket named `smyt-images`
3. Enable **Public Access** on the bucket (to serve images publicly)
4. Go to **R2 → Manage R2 API Tokens** → Create token with Object Read & Write
5. Copy `Account ID`, `Access Key ID`, `Secret Access Key`
6. Set `R2_PUBLIC_URL` to your bucket's public URL (e.g. `https://pub-abc123.r2.dev`)

### 5. Paystack — Webhook

1. Go to **Paystack Dashboard → Settings → Webhooks**
2. Add your webhook URL: `https://yourdomain.com/payments/webhook`
3. Copy your webhook secret to `PAYSTACK_WEBHOOK_SECRET` in `.env`

### 6. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

---

## API Reference

### Base URL
```
https://yourdomain.com
```

### Admin Authentication
All admin endpoints require the header:
```
X-Admin-Key: your-admin-key
```

---

### Orders

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/orders` | Public | Place a new order |
| GET | `/orders/track?order_number=SMYT-XXXXXX` | Public | Track order |
| POST | `/orders/status` | Admin | Update order status |
| POST | `/orders/payment` | Admin | Confirm bank transfer |
| GET | `/orders` | Admin | List all orders |
| GET | `/orders/:id` | Admin | Get single order |

#### POST /orders — Place Order
```json
{
  "customer_name": "Emeka Okafor",
  "customer_email": "emeka@email.com",
  "customer_phone": "08012345678",
  "delivery_address": "12 Awolowo Road, Ikoyi",
  "delivery_state": "Lagos",
  "delivery_method": "standard",
  "payment_method": "card",
  "items": [
    {
      "product_id": "uuid-here",
      "product_name": "Movement Hoodie — Black",
      "size": "L",
      "color": "Black",
      "quantity": 1,
      "price": 45000
    }
  ],
  "affiliate_code": "SMYT-JOHN20"
}
```

**Response:**
```json
{
  "success": true,
  "order_number": "SMYT-A1B2C3",
  "total": 47500,
  "delivery_fee": 2500,
  "paystack_url": "https://checkout.paystack.com/..."
}
```

> For `payment_method: "card"`, the response includes `paystack_url`. Redirect the customer there.

#### POST /orders/status — Update Status (Admin)
```json
{
  "order_id": "uuid-here",
  "status": "shipped",
  "tracking_info": "Driver on the way, call 08012345678"
}
```
Valid statuses: `confirmed` · `shipped` · `out_for_delivery` · `delivered` · `cancelled`

---

### Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/payments/initialize` | Public | Initialize Paystack for existing order |
| GET | `/payments/verify?reference=SMYT-XXXXXX` | Public | Verify payment after redirect |
| POST | `/payments/webhook` | Paystack | Paystack webhook (auto-confirms payment) |

#### Card Payment Flow
1. Place order with `payment_method: "card"` → get `paystack_url`
2. Redirect customer to `paystack_url`
3. Paystack redirects back to `FRONTEND_URL/payment/callback?reference=SMYT-XXXXXX`
4. Call `GET /payments/verify?reference=SMYT-XXXXXX` to confirm

---

### Products

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/products` | Public | List products |
| GET | `/products/:id` | Public | Get product |
| POST | `/products` | Admin | Create product |
| PATCH | `/products/:id` | Admin | Update product |
| DELETE | `/products/:id` | Admin | Soft delete |
| POST | `/products/:id/images` | Admin | Upload images (multipart) |
| DELETE | `/products/:id/images/:imageId` | Admin | Delete image |

#### POST /products/:id/images — Upload Images
- Content-Type: `multipart/form-data`
- Field name: `images` (up to 5 files)
- Optional fields: `is_primary=true`, `alt_text=...`
- Max size: 5MB per file
- Supported: JPEG, PNG, WebP, GIF

---

### Affiliates

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/affiliates` | Public | Apply as affiliate |
| POST | `/affiliates/approve` | Admin | Approve affiliate |
| GET | `/affiliates/stats?code=SMYT-JOHN20` | Public | Dashboard data |
| GET | `/affiliates` | Admin | List affiliates |
| PATCH | `/affiliates/:id/payout` | Admin | Record payout |

---

### Contact

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/contact` | Public | Submit contact form |

```json
{
  "name": "Emeka",
  "email": "emeka@email.com",
  "phone": "08012345678",
  "subject": "order-inquiry",
  "message": "I want to know the status of my order."
}
```
Subjects: `order-inquiry` · `return-request` · `product-question` · `affiliate-inquiry` · `general` · `complaint`

---

## Delivery Fee Logic

| Condition | Fee |
|-----------|-----|
| Order total ≥ ₦50,000 | FREE |
| Standard delivery | ₦2,500 |
| Express delivery | ₦5,000 |

---

## Deployment

### Railway / Render / Fly.io
```bash
# Set all env vars in dashboard, then:
npm start
```

### PM2 (VPS)
```bash
npm install -g pm2
pm2 start src/index.js --name smyt-api
pm2 save
pm2 startup
```

---

## Project Structure

```
smyt-backend/
├── src/
│   ├── index.js              # Express app entry
│   ├── middleware/
│   │   └── auth.js           # Admin key auth
│   ├── routes/
│   │   ├── orders.js         # Order CRUD + tracking
│   │   ├── affiliates.js     # Affiliate programme
│   │   ├── products.js       # Product + R2 images
│   │   ├── payments.js       # Paystack + webhook
│   │   └── contact.js        # Contact form
│   └── services/
│       ├── supabase.js       # Supabase client
│       ├── r2.js             # Cloudflare R2 + multer
│       ├── paystack.js       # Paystack API
│       └── email.js          # Nodemailer templates
├── supabase-schema.sql       # Run in Supabase SQL Editor
├── .env.example              # Copy to .env
└── package.json
```
