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

    // Per-user custom chat name  →  { "<userId>": "My Custom Name" }
    nicknames: {
      type: Map,
      of: String,
      default: {},
    },
    // Soft-delete: stores IDs of users who deleted this conversation for themselves
    deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },

  { timestamps: true },
);

// Ensure a conversation between 2 users is unique
conversationSchema.index({ participants: 1 });

export default mongoose.model("chatConversation", conversationSchema);
