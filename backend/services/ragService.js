// const axios = require("axios");
import axios from "axios";

const RAG_API = "http://localhost:8001/ask";

export const askRAG = async (question) => {
  try {
    const response = await axios.post(RAG_API, {
      question,
    });

    return response.data;
  } catch (error) {
    console.error("RAG Error:", error.message);
    throw error;
  }
}

// module.exports = { askRAG };