const express = require("express");
const router = express.Router();
const { askRAG } = require("../services/ragService");

router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    const result = await askRAG(question);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "RAG failed" });
  }
});

module.exports = router;