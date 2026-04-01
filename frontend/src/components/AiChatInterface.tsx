// AiChatInterface.tsx
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { ScrollArea } from "./ui/scroll-area";
import {
  Send,
  Bot,
  User,
  // FileText,
  Scale,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  references?: { title: string; citation: string }[];
}

const initialMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Hello! I'm your AI legal assistant. You can ask me questions about legal matters in simple language, and I'll help you understand the relevant laws and precedents. How can I help you today?",
  },
];

const quickQuestions = [
  "What are my rights as a tenant?",
  "How does small claims court work?",
  "What is breach of contract?",
  "Explain employment discrimination laws",
];

interface AiChatInterfaceProps {
  onConnectWithLawyer?: () => void;
  onRoleSwitch?: () => void;
}

export function AiChatInterface({
  onConnectWithLawyer,
  onRoleSwitch,
}: AiChatInterfaceProps) {
  // All The States
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const { user } = useAuth();

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || inputValue;
    if (!text.trim()) return;

    // const userMessage = {
    //   id: Date.now().toString(),
    //   role: 'user',
    //   content: text
    // };
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    try {
      const res = await fetch("http://localhost:5000/api/rag/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: text,
          conversation_id: conversationId,
          // question: text,
          // // Include conversation history for better context in follow-up questions
          // history:messages.map((m)=>({
          //   role: m.role,
          //   content: m.content
          // }))
        }),
      });

      const data = await res.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        references: data.sources?.map((s: any) => ({
          title: s.section_title || "Legal Section",
          citation: `Section ${s.section_number}`,
        })),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "⚠️ Error connecting to AI service",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };
  // Load conversations
  const loadConversations = async () => {
    const res = await fetch("http://localhost:5000/api/rag/conversations");
    const data = await res.json();
    setConversations(data);
  };
  // Create new conversation when component mounts
  //  if no conversation exists
  const createNewChat = async () => {
    const res = await fetch("http://localhost:5000/api/rag/conversation", {
      method: "POST",
    });

    const data = await res.json();

    setConversationId(data.conversation_id);
    setMessages(initialMessages);

    loadConversations();
  };
  // Load messages when clicking chat from sidebar
  const loadMessages = async (id: string) => {
    const res = await fetch(`http://localhost:5000/api/rag/messages/${id}`);

    const data = await res.json();

    const formatted = data.map((m: any) => ({
      id: Math.random().toString(),
      role: m.role,
      content: m.content,
    }));

    setConversationId(id);
    setMessages(formatted);
  };
  useEffect(() => {
    loadConversations();
    createNewChat();
  }, []);

  // const generateAIResponse = (question: string): string => {
  //   if (
  //     question.toLowerCase().includes("tenant") ||
  //     question.toLowerCase().includes("rent")
  //   ) {
  //     return "As a tenant, you have several important rights:\n\n1. **Right to Habitable Housing**: Your landlord must maintain the property in a safe and livable condition.\n\n2. **Right to Privacy**: Your landlord must provide proper notice (usually 24-48 hours) before entering your rental unit.\n\n3. **Right to Fair Treatment**: You're protected against discrimination based on race, religion, national origin, disability, or family status.\n\n4. **Security Deposit Rights**: Your landlord must return your security deposit (minus legitimate deductions) within a specific timeframe after you move out.\n\n5. **Right to Withhold Rent**: In some cases, if your landlord fails to make necessary repairs, you may have the right to withhold rent or make repairs and deduct the cost.\n\nThese rights vary by state, so I recommend consulting with a local attorney for specific guidance about your situation.";
  //   }
  //   return "I understand your question. Based on current legal standards, here's what you need to know:\n\nThe law in this area has been established through several important court decisions and statutes. Generally speaking, you have certain rights and responsibilities that are protected under law.\n\nI've found some relevant cases and legal references that might help. Would you like me to connect you with a qualified attorney who can provide more specific advice for your situation?";
  // };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Main Chat Area */}
      <div className="lg:col-span-2">
        <Card className="h-[calc(100vh-12rem)]">
          <div className="flex h-full">
            {/* LEFT: Conversations Sidebar */}
            <div className="w-64 border-r bg-[#F8FAFC] flex flex-col">
              <div className="p-3">
                <Button
                  className="w-full bg-[#1E3A8A] text-white"
                  onClick={createNewChat}
                >
                  + New Chat
                </Button>
              </div>

              <ScrollArea className="flex-1 px-2">
                {Array.isArray(conversations) &&
                conversations.map((chat) => (
                  <div
                    key={chat._id}
                    onClick={() => loadMessages(chat._id)}
                    className={`p-2 rounded cursor-pointer mb-2 text-sm ${
                      conversationId === chat._id
                        ? "bg-[#1E3A8A] text-white"
                        : "hover:bg-gray-200"
                    }`}
                  >
                    <p className="truncate">{chat.title || "New Chat"}</p>
                  </div>
                ))}
              </ScrollArea>
            </div>

            {/* RIGHT: Chat Area */}
            <div className="flex-1 flex flex-col">
              {/* HEADER */}
              <CardHeader className="border-b bg-gradient-to-r from-[#1E3A8A] to-[#1E3A8A]/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#D4AF37] flex items-center justify-center">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-white">
                      AI Legal Assistant
                    </CardTitle>
                    <p className="text-sm text-white/80">
                      Ask your legal questions in simple language
                    </p>
                  </div>
                  <Badge className="bg-white/20 text-white border-white/30">
                    {user?.role} View
                  </Badge>
                </div>
              </CardHeader>

              {/* CHAT CONTENT */}
              <CardContent className="flex-1 p-0 flex flex-col">
                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${
                          message.role === "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        {message.role === "assistant" && (
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-[#1E3A8A] text-white">
                              <Bot className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}

                        <div className="max-w-[80%]">
                          <div
                            className={`rounded-lg p-4 ${
                              message.role === "user"
                                ? "bg-[#1E3A8A] text-white"
                                : "bg-gray-100"
                            }`}
                          >
                            {message.content}
                          </div>
                        </div>

                        {message.role === "user" && (
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-[#D4AF37] text-white">
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}

                    {isTyping && (
                      <div className="flex gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-[#1E3A8A] text-white">
                            <Bot className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-gray-100 rounded-lg p-4">
                          typing...
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* INPUT */}
                <div className="p-4 border-t bg-white">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ask your legal question..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) =>
                        e.key === "Enter" && handleSendMessage()
                      }
                    />
                    <Button
                      onClick={() => handleSendMessage()}
                      className="bg-[#1E3A8A]"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </div>
          </div>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Quick Questions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#D4AF37]" />
              Quick Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickQuestions.map((question, idx) => (
              <Button
                key={idx}
                variant="outline"
                className="w-full justify-start text-left h-auto py-3 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
                onClick={() => handleSendMessage(question)}
              >
                <MessageCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="text-sm text-wrap">{question}</span>
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Help Card */}
        {user?.role === "Client" && (
          <Card className="border-2 border-[#D4AF37]/20 bg-[#D4AF37]/5">
            <CardHeader>
              <CardTitle className="text-[#1E293B]">Need a Lawyer?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                While I can provide general legal information, consulting with a
                qualified attorney is recommended for specific legal advice.
              </p>
              <Button
                className="w-full bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white"
                onClick={onConnectWithLawyer}
              >
                <Scale className="mr-2 h-4 w-4" />
                Connect with a Lawyer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[#1E293B]">How This Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex gap-2">
                <span className="text-[#1E3A8A]">•</span>
                <span>Ask questions in plain English</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#1E3A8A]">•</span>
                <span>Get simplified explanations</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#1E3A8A]">•</span>
                <span>See relevant case references</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#1E3A8A]">•</span>
                <span>Connect with lawyers when needed</span>
              </li>
            </ul>
            {onRoleSwitch && (
              <Button
                variant="link"
                className="text-[#1E3A8A] p-0 mt-4"
                onClick={onRoleSwitch}
              >
                Switch to detailed lawyer view →
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
