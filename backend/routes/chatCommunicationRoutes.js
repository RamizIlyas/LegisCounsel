import express from "express";
import multer from "multer";
import path from "path";
import {v4 as uuidv4} from "uuid";
import {
  startOrGetConversation,
  getConversations,
  getMessages,
  sendMessage,
  sendFile,
  renameConversation,
  deleteConversation,
} from "../controllers/chatCommunicationController.js";
import { protect } from "../controllers/authMiddleware.js";

// ─── Multer config ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
 
const fileFilter = (req, file, cb) => {
  // Allow common file types
  const allowed = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/zip",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${file.mimetype}" is not allowed`), false);
  }
};
 
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});
 
// ─── Router ───────────────────────────────────────────────────────────────────

const router = express.Router();

// All routes require a valid JWT
router.use(protect);
// ─── Start or get existing conversation between 2 users
router.post("/start",                                     startOrGetConversation);
// ─── Get all conversations for the current user
router.get("/",                                           getConversations);
// ─── Get all messages in a conversation 
router.get("/:conversationId/messages",                   getMessages);
// ─── Send a new message in a conversation 
router.post("/:conversationId/messages",                  sendMessage);
// ─── Send a file in a conversation 
router.post("/:conversationId/upload", upload.single("file"), sendFile);
// ─── Rename conversation (per-user)
router.patch("/:conversationId/rename",                   renameConversation);
// ─── Soft-delete conversation for current user
router.delete("/:conversationId",                         deleteConversation);

export default router;