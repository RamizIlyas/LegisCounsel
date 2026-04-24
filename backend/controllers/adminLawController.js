import Law from "../models/Law.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── GET all laws ──────────────────────────────────────────────────────────────
export const getAllLaws = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", category = "" } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { jurisdiction: { $regex: search, $options: "i" } },
        { year: { $regex: search, $options: "i" } },
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
      lawData.pdf_path = `/uploads/laws/${req.file.filename}`;
    }

    const law = await Law.create(lawData);
    res.status(201).json({ message: "Law created", law });
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

    // If a new PDF is uploaded, replace old one
    if (req.file) {
      // Delete old PDF if it exists
      if (existing.pdf_path) {
        const oldPath = path.join(__dirname, "..", existing.pdf_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.original_filename = req.file.originalname;
      updateData.pdf_path = `/uploads/laws/${req.file.filename}`;
    }

    const law = await Law.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.json({ message: "Law updated", law });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ── DELETE law ────────────────────────────────────────────────────────────────
export const deleteLaw = async (req, res) => {
  try {
    const law = await Law.findByIdAndDelete(req.params.id);
    if (!law) return res.status(404).json({ message: "Law not found" });

    // Delete associated PDF file
    if (law.pdf_path) {
      const filePath = path.join(__dirname, "..", law.pdf_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    res.json({ message: "Law deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};