// ragService.js
// const axios = require("axios");
import axios from "axios";

const RAG_API = "http://localhost:8001/ask";

export const askRAG = async (question, history,user_role) => {
  try {
    // console.log("Calling RAG with:", { question, history,user_role});
    const response = await axios.post(RAG_API, {
      question,
      history,
      user_role
    });

    return response.data;
  } catch (error) {
    console.error("RAG Error:", error.message);
    throw error;
  }
};