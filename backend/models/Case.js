import mongoose from "mongoose";

const caseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  client: { type: String, required: true },
  caseType: { type: String, required: true },
  status: {
    type: String,
    enum: ["active", "pending", "closed"],
    default: "active"
  },
  nextHearing: { type: Date },
  filedDate: { type: Date, default: Date.now },

  // 🔥 LINK TO USER
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }

}, { timestamps: true });

export default mongoose.model("Case", caseSchema);