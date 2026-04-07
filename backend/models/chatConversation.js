import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Ensure a conversation between 2 users is unique
conversationSchema.index({ participants: 1 });

export default mongoose.model("chatConversation", conversationSchema);