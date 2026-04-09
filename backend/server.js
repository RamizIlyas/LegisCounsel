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


const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
 

const app = express();
const httpServer = createServer(app);

// ─── Connect DB ─────────────────────────────────────────────
connectDB(); // your custom connection (preferred)

// ─── Socket.IO Setup ───────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// Make io accessible in controllers
app.set("io", io);

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinConversation", (conversationId) => {
    socket.join(conversationId);
    console.log(`Joined room: ${conversationId}`);
  });

  socket.on("leaveConversation", (conversationId) => {
    socket.leave(conversationId);
    console.log(`Left room: ${conversationId}`);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// ─── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────
// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/conversations", communicationRoutes);

// ─── Multer error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({ message: "File too large (max 20 MB)" });
  if (err.message?.includes("not allowed"))
    return res.status(400).json({ message: err.message });
  next(err);
});

// ─── Start Server ─────────────────────────────────────────
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});