// Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation_id: String,
    role: String,
    content: String,
    timestamp: Date,
  },
  { collection: "messages" }
);

export default mongoose.model("Message", messageSchema);