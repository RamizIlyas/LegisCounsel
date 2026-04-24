// Message.js
// When this model is imorted in its pasth message.js is written in lowercase. 
// This is because the file is named message.js and not Message.js. 
// The import statement is case-sensitive and must match the file name exactly.(BUt it has some issue here)
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation_id: String,
    role: String,
    content: String,
    responseTime: Number,
    case_sources: [
      {
        type: {
          type: String,
        },
        citation: String,
        court: String,
        outcome: String,
        sections: String,
      },
    ],

    law_sources: [
      {
        type: {
          type: String,
        },
        section_number: String,
        section_title: String,
        chapter: String,
      },
    ],
    timestamp: Date,
  },
  { collection: "messages" },
);

export default mongoose.model("Message", messageSchema);