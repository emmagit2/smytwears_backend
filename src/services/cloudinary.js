const cloudinary    = require("cloudinary").v2;
const multer        = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { v4: uuidv4 } = require("uuid");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_MB   = 10;

const storage = new CloudinaryStorage({
  cloudinary,
  params: (_req, file) => ({
    folder:          "smyt/products",
    public_id:       uuidv4(),
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
    transformation:  [{ quality: "auto", fetch_format: "auto" }],
  }),
});

const upload = multer({
  storage,
  limits:     { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
  },
});

function getPublicUrl(publicIdOrUrl) {
  if (publicIdOrUrl && publicIdOrUrl.startsWith("http")) {
    return publicIdOrUrl;
  }
  return cloudinary.url(publicIdOrUrl, { secure: true });
}

async function deleteObject(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.warn("Cloudinary delete warning:", err.message);
  }
}

module.exports = { upload, getPublicUrl, deleteObject };