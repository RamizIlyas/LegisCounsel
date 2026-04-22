// models/Bookmark.js
import mongoose from "mongoose";

const lawSourceSchema = new mongoose.Schema({
  type: { type: String, default: "law" },
  section_number: String,
  section_title: String,
  chapter: String,
}, { _id: false });

const caseSourceSchema = new mongoose.Schema({
  type: { type: String, default: "case" },
  citation: String,
  court: String,
  outcome: String,
  sections: String,
}, { _id: false });

const bookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: { type: String, required: true },
    law_sources:  { type: [lawSourceSchema],  default: [] },
    case_sources: { type: [caseSourceSchema], default: [] },
    conversation_id: { type: String, default: null },
    // stable fingerprint so the UI can check "is this message bookmarked?"
    // without relying on volatile client-side IDs
    content_hash: { type: String, required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// One bookmark per (user, content_hash) pair — prevents duplicates
bookmarkSchema.index({ user: 1, content_hash: 1 }, { unique: true });

export default mongoose.model("Bookmark", bookmarkSchema);