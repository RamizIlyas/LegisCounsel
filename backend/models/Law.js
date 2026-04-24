import mongoose from "mongoose";

const lawSchema = new mongoose.Schema(
  {
    original_filename: { type: String },
    title: { type: String, required: true },
    act_number: { type: String },
    amendments_referenced: [String],
    assent_date: { type: String },
    body_text: { type: String },
    chapter_count: { type: Number, default: 0 },
    chapters: [mongoose.Schema.Types.Mixed],
    commencement_date: { type: String },
    defined_terms: [
      {
        term: String,
        definition: String,
      },
    ],
    doc_type: { type: String, default: "Statute" },
    document_category: { type: String, default: "legislation" },
    enacting_authority: { type: String },
    enactment_date: { type: String },
    file_stem: { type: String },
    full_text: { type: String },
    jurisdiction: { type: String },
    page_count_estimate: { type: Number },
    penalty_clauses: [String],
    preamble: { type: String },
    related_laws: [String],
    schedules: [String],
    section_count: { type: Number, default: 0 },
    sections: [
      {
        number: String,
        heading: String,
        position: Number,
      },
    ],
    table_of_contents: [String],
    word_count: { type: Number },
    year: { type: String },
    category: { type: String }, // for UI filtering (Civil Law, Criminal Law, etc.)
    pdf_path: { type: String }, // path to uploaded PDF
  },
  {
    collection: "laws",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export default mongoose.model("Law", lawSchema);