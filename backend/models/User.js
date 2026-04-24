import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["lawyer", "client", "admin"], required: true },
    status: { type: String, enum: ["active", "pending", "inactive"], default: "active" },
    mobile: { type: String},
    location: { type: String },
    firm: { type: String },
  },
  { timestamps: true, collection: "users" }
);

export default mongoose.model("User", userSchema);