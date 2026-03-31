import express from "express";
const router = express.Router();
// const {  } = require("../services/ragService");
import { askRAG} from "../services/ragService.js";

router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    const result = await askRAG(question);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "RAG failed" });
  }
});

export default router;
// module.exports = router;