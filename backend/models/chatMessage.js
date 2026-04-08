import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Text content is optional when a file is attached
    content: { type: String, default: "" },
    attachment: {
      name:     String,   // original filename
      url:      String,   // served URL  e.g. /uploads/abc123.pdf
      mimeType: String,   // e.g. application/pdf, image/png
      size:     Number,   // bytes
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export default mongoose.model("chatMessage", messageSchema);