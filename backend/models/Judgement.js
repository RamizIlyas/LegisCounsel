// Judgement.js
import mongoose from "mongoose";

const judgementSchema = new mongoose.Schema(
  {
    original_filename: { type: String },
    advocates: {
      appellant_counsel: [String],
      respondent_counsel: [String],
    },
    all_sections_cited: [String],
    appellant: { type: String },
    case_name: { type: String, required: true },
    case_numbers: [String],
    citation: { type: String },
    court: { type: String },
    decision_date: { type: String },
    document_type: { type: String, default: "court_judgement" },
    full_text: { type: String },
    headnotes: [String],
    judges: [String],
    judgment_text: { type: String },
    law_code: { type: String },
    outcome: { type: String },
    page_count_estimate: { type: Number },
    primary_sections: [String],
    respondent: { type: String },
    word_count: { type: Number },
    category: { type: String }, // for UI filtering
    pdf_path: { type: String }, // path to uploaded PDF
  },
  {
    collection: "judgements",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export default mongoose.model("Judgement", judgementSchema);