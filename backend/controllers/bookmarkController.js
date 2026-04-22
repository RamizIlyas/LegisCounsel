// controllers/bookmarkController.js
import crypto from "crypto";
import Bookmark from "../models/Bookmark.js";

/** Simple deterministic hash for a message string */
const hashContent = (str) =>
  crypto.createHash("sha256").update(str).digest("hex").slice(0, 32);

// ── POST /api/bookmarks  ─────────────────────────────────────────────────────
export const createBookmark = async (req, res) => {
  try {
    const { content, law_sources, case_sources, conversation_id, note } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ message: "content is required" });
    }

    const content_hash = hashContent(content);

    // upsert so clicking bookmark twice is idempotent
    const bookmark = await Bookmark.findOneAndUpdate(
      { user: req.user._id, content_hash },
      {
        $setOnInsert: {
          user: req.user._id,
          content,
          law_sources:  law_sources  ?? [],
          case_sources: case_sources ?? [],
          conversation_id: conversation_id ?? null,
          content_hash,
          note: note ?? "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json(bookmark);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/bookmarks  ──────────────────────────────────────────────────────
export const getBookmarks = async (req, res) => {
  try {
    const bookmarks = await Bookmark.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(bookmarks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── DELETE /api/bookmarks/:id  ───────────────────────────────────────────────
export const deleteBookmark = async (req, res) => {
  try {
    const bookmark = await Bookmark.findById(req.params.id);

    if (!bookmark) return res.status(404).json({ message: "Bookmark not found" });

    if (bookmark.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await bookmark.deleteOne();
    res.json({ message: "Bookmark removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── DELETE /api/bookmarks/by-hash/:hash  (toggle-off from chat view)  ────────
export const deleteBookmarkByHash = async (req, res) => {
  try {
    const result = await Bookmark.findOneAndDelete({
      user: req.user._id,
      content_hash: req.params.hash,
    });

    if (!result) return res.status(404).json({ message: "Bookmark not found" });
    res.json({ message: "Bookmark removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── PATCH /api/bookmarks/:id  (update note)  ─────────────────────────────────
export const updateBookmarkNote = async (req, res) => {
  try {
    const bookmark = await Bookmark.findById(req.params.id);
    if (!bookmark) return res.status(404).json({ message: "Bookmark not found" });

    if (bookmark.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    bookmark.note = req.body.note ?? bookmark.note;
    await bookmark.save();
    res.json(bookmark);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};