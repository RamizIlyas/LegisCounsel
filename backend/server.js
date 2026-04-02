import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import ragRoutes from "./routes/ragRoutes.js";
import caseRoutes from "./routes/caseRoutes.js";
const app = express();

// Connect DB
connectDB();

app.use(cors());
app.use(express.json());
// const ragRoutes = require("./routes/ragRoutes");


// Routes
app.use("/api/auth", authRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/cases", caseRoutes);
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
