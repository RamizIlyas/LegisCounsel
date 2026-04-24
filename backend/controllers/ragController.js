import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import { v4 as uuidv4 } from "uuid";
import { askRAG} from "../../frontend/src/services/ragService.js";

// Create Ai Conversation
export const createConversation = async (req, res) => {
  try {
    const user_id = req.user.id; // Get user ID from protected middleware

    const conversation_id = uuidv4();

    await Conversation.create({
      _id: conversation_id,
      user_id,
      title: "New Chat",
      created_at: new Date(),
      updated_at: new Date(),
    });

    res.json({ conversation_id });
  } catch (err) {
    res.status(500).json({ error: "Failed to create Conversation" });
  }
};

// Rename Ai Conversation
export const renameConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    console.log("Renaming", id, "to", title);

    const updated = await Conversation.findOneAndUpdate(
      { _id: id },
      { title, updated_at: new Date() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to rename conversation" });
  }
};
// Delete Ai Conversation
export const deleteConversation =  async (req, res) => {
  try {
    const { id } = req.params;

    await Conversation.deleteOne({ _id: id });
    await Message.deleteMany({ conversation_id: id }); // cleanup messages

    res.json({ message: "Conversation deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete conversation" });
  }
};
// Get All Ai Conversations for a user
export const getConversations = async (req, res) => {
  try {
    const user_id = req.user.id;

    // const chats = await Conversation.find({ user_id }).sort({
    //   updated_at: -1,
    const chats = await Conversation
      .find({user_id});
      // .sort({ updated_at: -1 });

    res.json(chats);

  } catch (err) {
    res.status(500).json({ error: "Failed to load Conversations" });
  }
}; 
// Get messages for a Conversation
export const getMessages = async (req, res) => {
  try {
    const messages = await Message.find({
      conversation_id: req.params.id,
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages" });
  }
};
// Ask RAG Route
export const askRAGController = async (req, res) => {
  try {
    const { question, conversation_id ,user_role} = req.body;
    // 1. Load history from DB
    const historyDocs = await Message.find({
      conversation_id,
    }).sort({ timestamp: 1 });

    const history = historyDocs.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 2. Call RAG service
    const start = performance.now();
    
    const result = await askRAG(question, history,user_role);// This goes to askRag() in frontend/src/services/ragService.js
    const answer = result.answer;
    const case_sources = result.case_sources || [];
    const law_sources = result.law_sources || [];
    
    const end = performance.now()
    const responseTimeMs = end - start; 
    // console.log(`Response time: ${responseTimeMs} ms`);
    // console.log("RAG result:", result); // Debug log for RAG result

    // 3. Save user message
    await Message.create({
      conversation_id,
      role: "user",
      content: question,
      timestamp: new Date(),
    });
    // 4. Save assistant message
    await Message.create({
      conversation_id,
      role: "assistant",
      content: answer,
      case_sources: case_sources,
      law_sources: law_sources,
      responseTime: responseTimeMs,
      timestamp: new Date(),
    });
    // 5. Update conversation timestamp
    await Conversation.updateOne(
      { _id: conversation_id },
      { updated_at: new Date() }
    );
    // 6. Auto title (first message only)
    if (history.length === 0) {
      await Conversation.updateOne(
        { _id: conversation_id },
        { title: question.slice(0, 40) }
      );
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "RAG failed" });
    console.error(err);
  }
};