import express from "express";
const router = express.Router();
import { askRAG} from "../services/ragService.js";
// import Conversation from "backend/models/Conversation.js"; // Adjust the import path as needed
import Message from "../models/message.js";
import { v4 as uuidv4 } from "uuid";
import Conversation from "../models/conversation.js";
import { protect } from "../controllers/authMiddleware.js";

// Create Conversation Route
router.post("/Conversation", protect, async (req, res) => {
  try {
    const user_id = req.user.id; // Get user ID from protected middleware

    const conversation_id = uuidv4();

    await Conversation.create({
      _id: conversation_id,
      user_id,
      title: "New Chat",
      created_at: new Date(),
      updated_at: new Date(),
    });

    res.json({ conversation_id });
  } catch (err) {
    res.status(500).json({ error: "Failed to create Conversation" });
  }
});
// Get All Conversations for a user
router.get("/Conversations", protect, async (req, res) => {
  try {
    const user_id = req.user.id;

    // const chats = await Conversation.find({ user_id }).sort({
    //   updated_at: -1,
    const chats = await Conversation
      .find({user_id});
      // .sort({ updated_at: -1 });

    res.json(chats);

  } catch (err) {
    res.status(500).json({ error: "Failed to load Conversations" });
  }
});
// Get messages for a Conversation
router.get("/messages/:id", protect, async (req, res) => {
  try {
    const messages = await Message.find({
      conversation_id: req.params.id,
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages" });
  }
});
// Ask RAG Route
router.post("/ask", protect, async (req, res) => {
  try {
    const { question, conversation_id } = req.body;

    // 1. Load history from DB
    const historyDocs = await Message.find({
      conversation_id,
    }).sort({ timestamp: 1 });

    const history = historyDocs.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 2. Call RAG service
    const result = await askRAG(question, history);
    const answer = result.answer;

    // 3. Save user message
    await Message.create({
      conversation_id,
      role: "user",
      content: question,
      timestamp: new Date(),
    });
    // 4. Save assistant message
    await Message.create({
      conversation_id,
      role: "assistant",
      content: answer,
      timestamp: new Date(),
    });
    // 5. Update conversation timestamp
    await Conversation.updateOne(
      { _id: conversation_id },
      { updated_at: new Date() }
    );
    // 6. Auto title (first message only)
    if (history.length === 0) {
      await Conversation.updateOne(
        { _id: conversation_id },
        { title: question.slice(0, 40) }
      );
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "RAG failed" });
    console.error(err);
  }
});

export default router;
// module.exports = router;