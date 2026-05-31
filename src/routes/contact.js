const express  = require("express");
const { z }    = require("zod");
const router   = express.Router();
const supabase = require("../services/supabase");
const email    = require("../services/email");

const ContactSchema = z.object({
  name:    z.string().min(2),
  email:   z.string().email(),
  phone:   z.string().optional(),
  subject: z.enum([
    "order-inquiry", "return-request", "product-question",
    "affiliate-inquiry", "general", "complaint"
  ]),
  message: z.string().min(10).max(2000),
});

// POST /contact
router.post("/", async (req, res) => {
  const parsed = ContactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { name, email: userEmail, phone, subject, message } = parsed.data;

  // Save to DB
  await supabase.from("contact_messages").insert({ name, email: userEmail, phone, subject, message });

  // Auto-reply + forward to admin (non-blocking)
  email.sendContactAutoReply({ name, email: userEmail, subject, message }).catch(console.error);
  email.sendAdminNotification(
    `Contact Form: ${subject} from ${name}`,
    `Name: ${name}\nEmail: ${userEmail}\nPhone: ${phone || "N/A"}\nSubject: ${subject}\n\n${message}`
  ).catch(console.error);

  return res.json({ success: true });
});

module.exports = router;
