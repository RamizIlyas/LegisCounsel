import express from "express";
import {
  startOrGetConversation,
  getConversations,
  getMessages,
  sendMessage,
} from "../controllers/chatCommunicationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require a valid JWT
router.use(protect);

// Start or retrieve a conversation with a user by email
router.post("/start", startOrGetConversation);

// List all conversations for the logged-in user
router.get("/", getConversations);

// Get messages in a specific conversation
router.get("/:conversationId/messages", getMessages);

// Send a message to a conversation
router.post("/:conversationId/messages", sendMessage);

export default router;