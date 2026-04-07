import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { createServer } from "http";
import { Server } from "socket.io";

// DB
import connectDB from "./config/db.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import ragRoutes from "./routes/ragRoutes.js";
import caseRoutes from "./routes/caseRoutes.js";
import communicationRoutes from "./routes/chatCommunicationRoutes.js";

const app = express();
const httpServer = createServer(app);

// ─── Connect DB ─────────────────────────────────────────────
connectDB(); // your custom connection (preferred)

// OPTIONAL: If you want fallback or direct mongoose usage
// const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/legalapp";
// mongoose.connect(MONGO_URI)
//   .then(() => console.log("MongoDB connected"))
//   .catch(err => console.error("MongoDB error:", err));

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
app.use("/api/auth", authRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/conversations", communicationRoutes);

// ─── Start Server ─────────────────────────────────────────
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});