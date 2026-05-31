-- ═══════════════════════════════════════════════════════════════
--  SMYT DATABASE SCHEMA — Supabase / PostgreSQL
--  Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ───────────────────────────────────────────────────────────────
-- TABLE: affiliates
-- ───────────────────────────────────────────────────────────────
CREATE TABLE affiliates (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name           TEXT NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  phone               TEXT,
  instagram_handle    TEXT,
  referral_code       TEXT UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'suspended')),
  commission_rate     NUMERIC(5,2) NOT NULL DEFAULT 10,
  total_referrals     INTEGER NOT NULL DEFAULT 0,
  total_sales         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earnings      NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_out            NUMERIC(12,2) NOT NULL DEFAULT 0,
  bank_name           TEXT,
  bank_account_number TEXT,
  bank_account_name   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────
-- TABLE: products
-- ───────────────────────────────────────────────────────────────
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(12,2) NOT NULL,
  category      TEXT,
  sizes         TEXT[] DEFAULT '{}',          -- e.g. ['S','M','L','XL']
  colors        TEXT[] DEFAULT '{}',          -- e.g. ['Black','White']
  stock         INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────
-- TABLE: product_images
-- ───────────────────────────────────────────────────────────────
CREATE TABLE product_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,       -- Cloudflare R2 public URL
  key         TEXT NOT NULL,       -- R2 object key (for deletion)
  alt_text    TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────
-- TABLE: orders
-- ───────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number      TEXT UNIQUE NOT NULL,           -- e.g. SMYT-A1B2C3
  customer_name     TEXT NOT NULL,
  customer_email    TEXT NOT NULL,
  customer_phone    TEXT NOT NULL,
  delivery_address  TEXT NOT NULL,
  delivery_state    TEXT NOT NULL,
  delivery_method   TEXT NOT NULL DEFAULT 'standard'
                      CHECK (delivery_method IN ('standard', 'express')),
  items             JSONB NOT NULL DEFAULT '[]',    -- [{product_id, product_name, size, color, quantity, price}]
  subtotal          NUMERIC(12,2) NOT NULL,
  delivery_fee      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL,
  payment_method    TEXT NOT NULL
                      CHECK (payment_method IN ('bank_transfer', 'card', 'pay_on_delivery')),
  payment_status    TEXT NOT NULL DEFAULT 'pending'
                      CHECK (payment_status IN ('pending', 'paid', 'failed')),
  payment_reference TEXT,                           -- Paystack ref or bank ref
  status            TEXT NOT NULL DEFAULT 'processing'
                      CHECK (status IN ('processing','confirmed','shipped','out_for_delivery','delivered','cancelled')),
  tracking_info     TEXT,
  affiliate_code    TEXT REFERENCES affiliates(referral_code),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────
-- TABLE: contact_messages
-- ───────────────────────────────────────────────────────────────
CREATE TABLE contact_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  subject    TEXT NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────
-- INDEXES
-- ───────────────────────────────────────────────────────────────
CREATE INDEX idx_orders_order_number    ON orders(order_number);
CREATE INDEX idx_orders_customer_email  ON orders(customer_email);
CREATE INDEX idx_orders_status          ON orders(status);
CREATE INDEX idx_orders_affiliate_code  ON orders(affiliate_code);
CREATE INDEX idx_orders_created_at      ON orders(created_at DESC);
CREATE INDEX idx_affiliates_referral    ON affiliates(referral_code);
CREATE INDEX idx_affiliates_email       ON affiliates(email);
CREATE INDEX idx_product_images_product ON product_images(product_id);

-- ───────────────────────────────────────────────────────────────
-- FUNCTION: auto-update updated_at
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_affiliates_updated_at
  BEFORE UPDATE ON affiliates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ───────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (optional — disable if using service role only)
-- ───────────────────────────────────────────────────────────────
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
