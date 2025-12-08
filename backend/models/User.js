import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["lawyer", "client", "admin"], required: true }
  },
  { collection: "users" } // explicitly set collection name
);
console.log("User model schema defined");
export default mongoose.model("User", userSchema);
