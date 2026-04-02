import Case from "../models/Case.js";

// CREATE
export const createCase = async (req, res) => {
  try {
    const newCase = new Case({
      ...req.body,
      user: req.user._id // ✅ correct for your middleware
    });

    const saved = await newCase.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ALL
export const getCases = async (req, res) => {
  try {
    const cases = await Case.find({ user: req.user._id })
      .sort({ createdAt: -1 });

    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE
export const deleteCase = async (req, res) => {
  try {
    const caseItem = await Case.findById(req.params.id);

    if (!caseItem) {
      return res.status(404).json({ message: "Case not found" });
    }

    if (caseItem.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await caseItem.deleteOne();

    res.json({ message: "Case deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE
export const updateCase = async (req, res) => {
  try {
    const caseItem = await Case.findById(req.params.id);

    if (!caseItem) {
      return res.status(404).json({ message: "Case not found" });
    }

    if (caseItem.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    Object.assign(caseItem, req.body);
    await caseItem.save();

    res.json(caseItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};