const express  = require("express");
const router   = express.Router();
const supabase = require("../services/supabase");
const { deleteObject } = require("../services/cloudinary");
const { requireAdmin } = require("../middleware/auth");

// ────────────────────────────────────────────────────────────
// GET /products — List all active products (Public)
// ────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { category, limit = 50, page = 1 } = req.query;
  const from = (Number(page) - 1) * Number(limit);
  const to   = from + Number(limit) - 1;

  let query = supabase
    .from("products")
    .select(`
      *,
      product_images (id, url, key, alt_text, is_primary, sort_order)
    `, { count: "exact" })
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category) query = query.eq("category", category);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: "Failed to fetch products" });

  return res.json({ products: data, total: count, page: Number(page), limit: Number(limit) });
});

// ────────────────────────────────────────────────────────────
// GET /products/:id — Single product (Public)
// ────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const { data: product, error } = await supabase
    .from("products")
    .select(`
      *,
      product_images (id, url, key, alt_text, is_primary, sort_order)
    `)
    .eq("id", req.params.id)
    .eq("is_active", true)
    .single();

  if (error || !product) return res.status(404).json({ error: "Product not found" });
  return res.json(product);
});

// ────────────────────────────────────────────────────────────
// POST /products — Create product (Admin)
// ────────────────────────────────────────────────────────────
router.post("/", requireAdmin, async (req, res) => {
  const {
    name, description, details, care, shipping,
    price, original_price, category, sizes, colors,
    stock, is_new, is_best_seller, in_stock,
  } = req.body;

  if (!name || !price) return res.status(400).json({ error: "name and price are required" });

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      name,
      description,
      details,
      care,
      shipping,
      price:          Number(price),
      original_price: original_price ? Number(original_price) : null,
      category,
      sizes:          Array.isArray(sizes) ? sizes : [],
      colors:         Array.isArray(colors) ? colors : [],
      stock:          Number(stock) || 0,
      is_active:      true,
      is_new:         Boolean(is_new),
      is_best_seller: Boolean(is_best_seller),
      in_stock:       in_stock !== undefined ? Boolean(in_stock) : true,
    })
    .select()
    .single();

  if (error) {
    console.error("Product insert error:", error);
    return res.status(500).json({ error: "Failed to create product" });
  }

  return res.status(201).json(product);
});

// ────────────────────────────────────────────────────────────
// PATCH /products/:id — Update product (Admin)
// ────────────────────────────────────────────────────────────
router.patch("/:id", requireAdmin, async (req, res) => {
  const allowed = [
    "name", "description", "details", "care", "shipping",
    "price", "original_price", "category", "sizes", "colors",
    "stock", "is_active", "is_new", "is_best_seller", "in_stock",
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: "No valid fields to update" });

  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: "Product not found" });
  return res.json(data);
});

// ────────────────────────────────────────────────────────────
// DELETE /products/:id — Soft delete (Admin)
// ────────────────────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", req.params.id);

  if (error) return res.status(404).json({ error: "Product not found" });
  return res.json({ success: true });
});

// ────────────────────────────────────────────────────────────
// POST /products/:id/images/urls — Save Cloudinary URLs (Admin)
// Frontend uploads directly to Cloudinary, then sends URLs here
// ────────────────────────────────────────────────────────────
router.post("/:id/images/urls", requireAdmin, async (req, res) => {
  const images = req.body; // [{ url, key }]

  if (!Array.isArray(images) || !images.length)
    return res.status(400).json({ error: "No images provided" });

  const { id } = req.params;

  // Check product exists
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .single();

  if (!product) return res.status(404).json({ error: "Product not found" });

  const imageRows = images.map((img, i) => ({
    product_id: id,
    url:        img.url,
    key:        img.key,
    alt_text:   null,
    is_primary: i === 0,
    sort_order: i,
  }));

  const { data, error } = await supabase
    .from("product_images")
    .insert(imageRows)
    .select();

  if (error) {
    console.error("Image URL insert error:", error);
    return res.status(500).json({ error: "Failed to save image records" });
  }

  return res.status(201).json({ success: true, images: data });
});

// ────────────────────────────────────────────────────────────
// DELETE /products/:id/images/:imageId — Delete image (Admin)
// ────────────────────────────────────────────────────────────
router.delete("/:id/images/:imageId", requireAdmin, async (req, res) => {
  const { data: img, error } = await supabase
    .from("product_images")
    .select("key")
    .eq("id", req.params.imageId)
    .eq("product_id", req.params.id)
    .single();

  if (error || !img) return res.status(404).json({ error: "Image not found" });

  await deleteObject(img.key);
  await supabase.from("product_images").delete().eq("id", req.params.imageId);

  return res.json({ success: true });
});

module.exports = router;