// ragRoutes.js
// Handles routes related to Retrieval-Augmented Generation (RAG) interactions, 
// including conversation management and message handling.
import express from "express";

import { protect } from "../controllers/authMiddleware.js";
import {
  createConversation as createAiChatConvo,
  renameConversation as renameAiChatConvo,
  deleteConversation as deleteAiChatConvo,
  getConversations as getAiChatConversations,
  getMessages as getAiChatMessages,
  askRAGController
} from "../controllers/ragController.js";


// RAG Routes
const router = express.Router();
router.use(protect); // If All routes require authentication

// Create Conversation Route
router.post("/conversation", createAiChatConvo);
// Rename Conversation
router.put("/conversation/:id", renameAiChatConvo);
// Delete Conversation
router.delete("/conversation/:id", deleteAiChatConvo);
// Get All Conversations for a user
router.get("/conversations", getAiChatConversations);
// Get messages for a Conversation
router.get("/messages/:id", getAiChatMessages);
// Ask RAG Route
router.post("/ask", askRAGController);

export default router;