// adminCaseController.js
import Judgement from "../models/Judgement.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Python extraction service ─────────────────────────────────────────────────
// Points at your existing FastAPI process (app.py).
// Override via PYTHON_SERVICE_URL env var if the port differs.
const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL || "http://localhost:8001";

/**
 * Fire-and-forget: tell the Python service to extract text from the PDF,
 * enrich the MongoDB document, and update ChromaDB.
 *
 * We don't await this in the HTTP handler so the admin gets an instant
 * response. Extraction logs appear in the FastAPI console.
 *
 * @param {string} absoluteFilePath  - full path to the saved PDF on disk
 * @param {string} mongoDocId        - _id of the Judgement document
 * @param {string} originalFilename  - original upload filename (for parsing)
 * @param {boolean} sync             - set true to wait for extraction (testing)
 */
async function triggerExtraction(absoluteFilePath, mongoDocId, originalFilename, sync = false) {
  const endpoint = sync
    ? `${PYTHON_SERVICE}/extract-case/sync`
    : `${PYTHON_SERVICE}/extract-case`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path:         absoluteFilePath,
        mongo_doc_id:      mongoDocId,
        original_filename: originalFilename,
      }),
      // Give the sync endpoint more time; async endpoint responds instantly
      signal: AbortSignal.timeout(sync ? 120_000 : 10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[triggerExtraction] Python service error (${res.status}): ${text}`);
    } else {
      const data = await res.json();
      console.log(`[triggerExtraction] status=${data.status}  id=${mongoDocId}`);
    }
  } catch (err) {
    // Never crash the Node response – extraction failure is non-fatal here
    // because the basic case record is already saved.
    console.error(`[triggerExtraction] Could not reach Python service: ${err.message}`);
  }
}

// ── GET all cases ─────────────────────────────────────────────────────────────
export const getAllCases = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", category = "" } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { case_name:  { $regex: search, $options: "i" } },
        { court:      { $regex: search, $options: "i" } },
        { citation:   { $regex: search, $options: "i" } },
        { appellant:  { $regex: search, $options: "i" } },
      ];
    }
    if (category) filter.category = { $regex: category, $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [cases, total] = await Promise.all([
      Judgement.find(filter)
        .select("case_name court citation outcome law_code category decision_date pdf_path created_at updated_at")
        .skip(skip)
        .limit(Number(limit))
        .sort({ updated_at: -1 }),
      Judgement.countDocuments(filter),
    ]);

    res.json({ cases, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── GET single case ───────────────────────────────────────────────────────────
export const getCaseById = async (req, res) => {
  try {
    const caseDoc = await Judgement.findById(req.params.id);
    if (!caseDoc) return res.status(404).json({ message: "Case not found" });
    res.json(caseDoc);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── CREATE case (with optional PDF) ──────────────────────────────────────────
export const createCase = async (req, res) => {
  try {
    const {
      case_name, court, citation, outcome, law_code,
      category, decision_date, appellant, respondent,
    } = req.body;

    if (!case_name) return res.status(400).json({ message: "Case name is required" });

    const caseData = {
      case_name, court, citation, outcome, law_code,
      category, decision_date, appellant, respondent,
    };

    if (req.file) {
      caseData.original_filename = req.file.originalname;
      caseData.pdf_path          = `/uploads/cases/${req.file.filename}`;
    }

    // 1. Save the basic record immediately so the admin gets fast feedback
    const caseDoc = await Judgement.create(caseData);

    // 2. If a PDF was uploaded, kick off background extraction
    if (req.file) {
      const absolutePath = path.join(__dirname, "..", "uploads", "cases", req.file.filename);
      // Don't await – response goes back to the admin right away
      triggerExtraction(absolutePath, caseDoc._id.toString(), req.file.originalname);
    }

    res.status(201).json({
      message: "Case created" + (req.file ? " – PDF extraction started in background" : ""),
      case: caseDoc,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── UPDATE case ───────────────────────────────────────────────────────────────
export const updateCase = async (req, res) => {
  try {
    const existing = await Judgement.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Case not found" });

    const updateData = { ...req.body };

    if (req.file) {
      // Delete old PDF from disk if present
      if (existing.pdf_path) {
        const oldPath = path.join(__dirname, "..", existing.pdf_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.original_filename = req.file.originalname;
      updateData.pdf_path          = `/uploads/cases/${req.file.filename}`;
    }

    const caseDoc = await Judgement.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    // If a new PDF was provided, re-extract in background
    if (req.file) {
      const absolutePath = path.join(__dirname, "..", "uploads", "cases", req.file.filename);
      triggerExtraction(absolutePath, caseDoc._id.toString(), req.file.originalname);
    }

    res.json({
      message: "Case updated" + (req.file ? " – PDF re-extraction started in background" : ""),
      case: caseDoc,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── DELETE case ───────────────────────────────────────────────────────────────
export const deleteCase = async (req, res) => {
  try {
    const caseDoc = await Judgement.findByIdAndDelete(req.params.id);
    if (!caseDoc) return res.status(404).json({ message: "Case not found" });

    // Delete PDF from disk
    if (caseDoc.pdf_path) {
      const filePath = path.join(__dirname, "..", caseDoc.pdf_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // Note: ChromaDB chunks are NOT deleted here because ChromaDB doesn't support
    // efficient partial deletes by mongo_id without a full scan.
    // Recommended: run a nightly cleanup job or call collection.delete(where={"mongo_id": id}).
    // For immediate cleanup uncomment the block below and ensure the Python service exposes
    // a DELETE /extract-case/:id endpoint.
    //
    // try {
    //   await fetch(`${PYTHON_SERVICE}/extract-case/${req.params.id}`, { method: "DELETE" });
    // } catch (_) {}

    res.json({ message: "Case deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};