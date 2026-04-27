// adminLawController.js
import Law from "../models/Law.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Python extraction service ─────────────────────────────────────────────────
const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL || "http://localhost:8001";

/**
 * Fire-and-forget: tell the Python service to extract text from the law PDF,
 * enrich the MongoDB document, and update the law_vector_db ChromaDB directory.
 *
 * @param {string} absoluteFilePath  - full path to the saved PDF on disk
 * @param {string} mongoDocId        - _id of the Law document
 * @param {string} originalFilename  - original upload filename (for parsing)
 * @param {boolean} sync             - set true to wait for extraction (testing)
 */
async function triggerLawExtraction(absoluteFilePath, mongoDocId, originalFilename, sync = false) {
  const endpoint = sync
    ? `${PYTHON_SERVICE}/extract-law/sync`
    : `${PYTHON_SERVICE}/extract-law`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path:         absoluteFilePath,
        mongo_doc_id:      mongoDocId,
        original_filename: originalFilename,
      }),
      signal: AbortSignal.timeout(sync ? 120_000 : 10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[triggerLawExtraction] Python service error (${res.status}): ${text}`);
    } else {
      const data = await res.json();
      console.log(`[triggerLawExtraction] status=${data.status}  id=${mongoDocId}`);
    }
  } catch (err) {
    // Never crash the Node response – basic record is already saved.
    console.error(`[triggerLawExtraction] Could not reach Python service: ${err.message}`);
  }
}

// ── GET all laws ──────────────────────────────────────────────────────────────
export const getAllLaws = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", category = "" } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { title:        { $regex: search, $options: "i" } },
        { jurisdiction: { $regex: search, $options: "i" } },
        { year:         { $regex: search, $options: "i" } },
      ];
    }
    if (category) filter.category = { $regex: category, $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [laws, total] = await Promise.all([
      Law.find(filter)
        .select("title category jurisdiction year section_count doc_type pdf_path created_at updated_at")
        .skip(skip)
        .limit(Number(limit))
        .sort({ updated_at: -1 }),
      Law.countDocuments(filter),
    ]);

    res.json({ laws, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── GET single law ────────────────────────────────────────────────────────────
export const getLawById = async (req, res) => {
  try {
    const law = await Law.findById(req.params.id);
    if (!law) return res.status(404).json({ message: "Law not found" });
    res.json(law);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── CREATE law (with optional PDF) ───────────────────────────────────────────
export const createLaw = async (req, res) => {
  try {
    const {
      title, category, jurisdiction, year, doc_type,
      act_number, preamble, enacting_authority,
    } = req.body;

    if (!title) return res.status(400).json({ message: "Title is required" });

    const lawData = {
      title,
      category,
      jurisdiction,
      year,
      doc_type: doc_type || "Statute",
      act_number,
      preamble,
      enacting_authority,
    };

    if (req.file) {
      lawData.original_filename = req.file.originalname;
      lawData.pdf_path          = `/uploads/laws/${req.file.filename}`;
    }

    // 1. Save the basic record immediately so the admin gets fast feedback
    const law = await Law.create(lawData);

    // 2. If a PDF was uploaded, kick off background extraction + indexing
    if (req.file) {
      const absolutePath = path.join(__dirname, "..", "uploads", "laws", req.file.filename);
      triggerLawExtraction(absolutePath, law._id.toString(), req.file.originalname);
    }

    res.status(201).json({
      message: "Law created" + (req.file ? " – PDF extraction started in background" : ""),
      law,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── UPDATE law ────────────────────────────────────────────────────────────────
export const updateLaw = async (req, res) => {
  try {
    const existing = await Law.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Law not found" });

    const updateData = { ...req.body };

    if (req.file) {
      // Delete old PDF from disk if present
      if (existing.pdf_path) {
        const oldPath = path.join(__dirname, "..", existing.pdf_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.original_filename = req.file.originalname;
      updateData.pdf_path          = `/uploads/laws/${req.file.filename}`;
    }

    const law = await Law.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    // If a new PDF was provided, re-extract in background
    if (req.file) {
      const absolutePath = path.join(__dirname, "..", "uploads", "laws", req.file.filename);
      triggerLawExtraction(absolutePath, law._id.toString(), req.file.originalname);
    }

    res.json({
      message: "Law updated" + (req.file ? " – PDF re-extraction started in background" : ""),
      law,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── DELETE law ────────────────────────────────────────────────────────────────
export const deleteLaw = async (req, res) => {
  try {
    const law = await Law.findByIdAndDelete(req.params.id);
    if (!law) return res.status(404).json({ message: "Law not found" });

    // Delete PDF from disk
    if (law.pdf_path) {
      const filePath = path.join(__dirname, "..", law.pdf_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    res.json({ message: "Law deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};