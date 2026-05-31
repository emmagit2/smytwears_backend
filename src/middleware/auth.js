const supabase = require("../services/supabase");

const requireAdmin = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.replace("Bearer ", "").trim();
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) {
      return res.status(403).json({ error: "Profile not found" });
    }
    if (profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.user    = user;
    req.profile = profile;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Authentication error" });
  }
};

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.replace("Bearer ", "").trim();
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Authentication error" });
  }
};

module.exports = { requireAdmin, requireAuth };