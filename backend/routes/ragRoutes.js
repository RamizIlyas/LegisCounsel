import express from "express";
const router = express.Router();
// const {  } = require("../services/ragService");
import { askRAG} from "../services/ragService.js";

router.post("/ask", async (req, res) => {
  try {
    const { question, history } = req.body;

    const result = await askRAG(question, history);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "RAG failed" });
  }
});

export default router;
// module.exports = router;