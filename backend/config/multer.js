// multer.js
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── storage factories ─────────────────────────────────────────────────────────

function makeStorage(subfolder) {
  const dest = path.join(__dirname, "..", "uploads", subfolder);
  ensureDir(dest);

  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  });
}

// ── PDF-only filter ────────────────────────────────────────────────────────────

function pdfFilter(_req, file, cb) {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"), false);
  }
}

// ── exported upload instances ─────────────────────────────────────────────────

export const uploadLawPdf = multer({
  storage: makeStorage("laws"),
  fileFilter: pdfFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
}).single("pdf");

export const uploadCasePdf = multer({
  storage: makeStorage("cases"),
  fileFilter: pdfFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
}).single("pdf");