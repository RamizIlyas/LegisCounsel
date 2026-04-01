import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    _id: String,
    user_id: String,
    title: String,
    created_at: Date,
    updated_at: Date,
  },
  { collection: "conversations" }
);

export default mongoose.model("Conversation", conversationSchema);