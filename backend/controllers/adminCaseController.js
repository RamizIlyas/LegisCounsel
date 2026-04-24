import Judgement from "../models/Judgement.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── GET all cases ─────────────────────────────────────────────────────────────
export const getAllCases = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", category = "" } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { case_name: { $regex: search, $options: "i" } },
        { court: { $regex: search, $options: "i" } },
        { citation: { $regex: search, $options: "i" } },
        { appellant: { $regex: search, $options: "i" } },
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
      caseData.pdf_path = `/uploads/cases/${req.file.filename}`;
    }

    const caseDoc = await Judgement.create(caseData);
    res.status(201).json({ message: "Case created", case: caseDoc });
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
      if (existing.pdf_path) {
        const oldPath = path.join(__dirname, "..", existing.pdf_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.original_filename = req.file.originalname;
      updateData.pdf_path = `/uploads/cases/${req.file.filename}`;
    }

    const caseDoc = await Judgement.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.json({ message: "Case updated", case: caseDoc });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── DELETE case ───────────────────────────────────────────────────────────────
export const deleteCase = async (req, res) => {
  try {
    const caseDoc = await Judgement.findByIdAndDelete(req.params.id);
    if (!caseDoc) return res.status(404).json({ message: "Case not found" });

    if (caseDoc.pdf_path) {
      const filePath = path.join(__dirname, "..", caseDoc.pdf_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    res.json({ message: "Case deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};