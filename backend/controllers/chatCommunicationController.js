import chatConversation from "../models/chatConversation.js";// MOdel for Message Chat Communication
import chatMessage from "../models/chatMessage.js";// Model for individual messages in a conversation Communication
import User from "../models/User.js";
import fs from "fs";
import path from "path";


// ─── Helpers ──────────────────────────────────────────────────────────────────
const emitToConversation = (req, conversationId, event, data) => {
  const io = req.app.get("io");
  if (io) io.to(conversationId).emit(event, data);
};
// ─── Start or Get Conversation by email ─────────────────────────────────────
// POST /api/conversations/start  { email }
export const startOrGetConversation = async (req, res) => {
  try {
    // Debug logging to trace the request
    // console.log("=== START CONVERSATION HIT ===");
    // console.log("BODY:", req.body);
    // console.log("HEADERS:", req.headers);
    // console.log("USER:", req.user);

    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const otherUser = await User.findOne({ email }).select("-password");
    if (!otherUser) return res.status(404).json({ message: "User not found" });

    if (otherUser._id.toString() === req.user.id)
      return res.status(400).json({ message: "Cannot start conversation with yourself" });

    // Look for existing conversation between the two participants
    let conversation = await chatConversation.findOne({
      participants: { $all: [req.user.id, otherUser._id], $size: 2 },
    }).populate("participants", "-password").populate("lastMessage");

    if (!conversation) {
      conversation = await chatConversation.create({
        participants: [req.user.id, otherUser._id],
      });
      conversation = await conversation.populate("participants", "-password");
    }else{
      // If current user had soft-deleted it, restore it
      await chatConversation.findByIdAndUpdate(conversation._id, {
        $pull: { deletedBy: req.user.id },
      });
    }
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
    console.error(error);
  }
};

// ─── Get all conversations for logged-in user ────────────────────────────────
// GET /api/conversations
export const getConversations = async (req, res) => {
  try {
    const conversations = await chatConversation.find({
      participants: req.user.id,
      deletedBy: { $nin: [req.user.id] }, // exclude soft-deleted
    })
      .populate("participants", "-password")
      .populate("lastMessage")
      .sort({ lastMessageAt: -1 });

    // Attach unread count per conversation
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const unread = await chatMessage.countDocuments({
          conversationId: conv._id,
          sender: { $ne: req.user.id },
          readBy: { $nin: [req.user.id] },
        });
        // Return the per-user nickname if set
        const customName = conv.nicknames?.get(req.user.id) ?? null;
        return { ...conv.toObject(), unread, customName };
      })
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
    console.error(error);
  }
};

// ─── Get messages for a conversation ─────────────────────────────────────────
// GET /api/conversations/:conversationId/messages
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Verify the user is a participant
    const conversation = await chatConversation.findOne({
      _id: conversationId,
      participants: req.user.id,
    });
    if (!conversation)
      return res.status(403).json({ message: "Access denied" });

    const messages = await chatMessage.find({ conversationId })
      .populate("sender", "name email role")
      .sort({ createdAt: 1 });

    // Mark incoming messages as read
    await chatMessage.updateMany(
      {
        conversationId,
        sender: { $ne: req.user.id },
        readBy: { $nin: [req.user.id] },
      },
      { $addToSet: { readBy: req.user.id } }
    );

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// ─── Send a Text message ───────────────────────────────────────────────────────────
// POST /api/conversations/:conversationId/messages  { content, attachment? }
export const sendMessage = async (req, res) => {
try {
    const { conversationId } = req.params;
    const { content } = req.body;
 
    if (!content || !content.trim())
      return res.status(400).json({ message: "Message content is required" });
 
    const conversation = await chatConversation.findOne({
      _id: conversationId,
      participants: req.user.id,
      deletedBy: { $nin: [req.user.id] },
    });
    if (!conversation) return res.status(403).json({ message: "Access denied" });
 
    // If the other participant had deleted, restore for them too
    await chatConversation.findByIdAndUpdate(conversationId, {
      $pull: { deletedBy: { $ne: req.user.id } }, // restore others on new message
    });
 
    const message = await chatMessage.create({
      conversationId,
      sender: req.user.id,
      content: content.trim(),
      readBy: [req.user.id],
    });
 
    await chatConversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastMessageAt: new Date(),
    });
 
    const populated = await message.populate("sender", "name email role");
    emitToConversation(req, conversationId, "newMessage", populated);
 
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// ─── Upload & send a file message ─────────────────────────────────────────────
// POST /api/conversations/:conversationId/upload
// multipart/form-data  field: "file"   optional field: "caption"
export const sendFile = async (req, res) => {
  try {
    const { conversationId } = req.params;
 
    const conversation = await chatConversation.findOne({
      _id: conversationId,
      participants: req.user.id,
      deletedBy: { $nin: [req.user.id] },
    });
    if (!conversation) return res.status(403).json({ message: "Access denied" });
 
    if (!req.file) return res.status(400).json({ message: "No file provided" });
 
    const { originalname, mimetype, size, filename } = req.file;
    const caption = req.body.caption?.trim() || "";
 
    const message = await chatMessage.create({
      conversationId,
      sender: req.user.id,
      content: caption,
      attachment: {
        name:     originalname,
        url:      `/uploads/${filename}`,
        mimeType: mimetype,
        size,
      },
      readBy: [req.user.id],
    });
 
    await chatConversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastMessageAt: new Date(),
    });
 
    const populated = await message.populate("sender", "name email role");
    emitToConversation(req, conversationId, "newMessage", populated);
 
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
 
// ─── Rename (nickname) a conversation ─────────────────────────────────────────
// PATCH /api/conversations/:conversationId/rename  { name }
export const renameConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { name } = req.body;
 
    if (!name || !name.trim())
      return res.status(400).json({ message: "Name is required" });
 
    const conversation = await chatConversation.findOne({
      _id: conversationId,
      participants: req.user.id,
    });
    if (!conversation) return res.status(403).json({ message: "Access denied" });
 
    // Store per-user nickname
    conversation.nicknames.set(req.user.id, name.trim());
    await conversation.save();
 
    // Notify participants
    emitToConversation(req, conversationId, "conversationRenamed", {
      conversationId,
      userId: req.user.id,
      name: name.trim(),
    });
 
    res.json({ message: "Conversation renamed", name: name.trim() });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
 
// ─── Delete (soft) a conversation ─────────────────────────────────────────────
// DELETE /api/conversations/:conversationId
export const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
 
    const conversation = await chatConversation.findOne({
      _id: conversationId,
      participants: req.user.id,
    });
    if (!conversation) return res.status(403).json({ message: "Access denied" });
 
    // Soft-delete: only hides the conversation for this user
    await chatConversation.findByIdAndUpdate(conversationId, {
      $addToSet: { deletedBy: req.user.id },
    });
 
    res.json({ message: "Conversation deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};