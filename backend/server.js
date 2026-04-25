// server.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs";

// DB
import connectDB from "./config/db.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import ragRoutes from "./routes/ragRoutes.js";
import caseRoutes from "./routes/caseRoutes.js";
import communicationRoutes from "./routes/chatCommunicationRoutes.js";
import bookmarkRoutes from "./routes/bookmarkRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure uploads directories exist
["uploads", "uploads/laws", "uploads/cases"].forEach((dir) => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const app = express();
const httpServer = createServer(app);

// ─── Connect DB ──────────────────────────────────────────────────────────────
connectDB();

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new Server(httpServer, { cors: { origin: "*" } });
app.set("io", io);

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinConversation", (id) => socket.join(id));
  socket.on("leaveConversation", (id) => socket.leave(id));
  socket.on("disconnect", () => console.log("Socket disconnected:", socket.id));
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Static uploads ───────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/conversations", communicationRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/admin", adminRoutes); // ← all admin CRUD lives here
app.use("/api/users", userRoutes); // ← user profile + password management routes

// ─── Error handler (Multer + general) ────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({ message: "File too large (max 20 MB)" });
  if (err.message?.includes("Only PDF"))
    return res.status(400).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));