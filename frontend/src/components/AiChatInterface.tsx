// AiChatInterface.tsx
import { useRef, useState, useEffect } from "react";
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
  FileText,
  Scale,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
const BACKEND_API_URL =
  import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5000";

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

const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem("token");

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
};

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
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // const menuRef = useRef<HTMLDivElement | null>(null);
  // Close 3-dot menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMenu(null);
    };

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    loadConversations(); // Load conversations when component mounts
  }, []);

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || inputValue;
    if (!text.trim()) return;

    const currentConversationId = await ensureConversation(); // ✅ clean
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
      const res = await authFetch(`${BACKEND_API_URL}/api/rag/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: text,
          conversation_id: currentConversationId,
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

  // Helper Function that Ensure conversation exists (create if not) and return ID
  const ensureConversation = async (): Promise<string> => {
    // If already exists → just return it
    if (conversationId) return conversationId;

    // prevent race condition
    if (isTyping) return conversationId!;
    // Otherwise create a new one
    const res = await authFetch(`${BACKEND_API_URL}/api/rag/conversation`, {
      method: "POST",
    });

    const data = await res.json();

    setConversationId(data.conversation_id);
    loadConversations();

    return data.conversation_id;
  };
  // Load conversations
  const loadConversations = async () => {
    const res = await authFetch(`${BACKEND_API_URL}/api/rag/conversations`);
    const data = await res.json();
    setConversations(data);
  };
  // Create new conversation
  //  if no conversation exists
  const createNewChat = async () => {
    setConversationId(null);
    setMessages([...initialMessages]);
    // setMessages(initialMessages);
    loadConversations();
  };
  // Load messages when clicking chat from sidebar
  const loadMessages = async (id: string) => {
    const res = await authFetch(`${BACKEND_API_URL}/api/rag/messages/${id}`);

    const data = await res.json();

    const formatted = data.map((m: any) => ({
      id: Math.random().toString(),
      role: m.role,
      content: m.content,
    }));

    setConversationId(id);
    setMessages(formatted);
  };
  // Delete conversation from sidebar
  const deleteConversation = async (id: string) => {
    await authFetch(`${BACKEND_API_URL}/api/rag/conversation/${id}`, {
      method: "DELETE",
    });
    await loadConversations();

    // If deleted chat is active → reset UI
    if (conversationId === id) {
      createNewChat();
    }
  };
  // Rename conversation
  const renameConversation = async (id: string) => {
    console.log("Renaming", id, "to", newTitle);
    if (!newTitle.trim()) return; // ✅ prevent empty titles
    await authFetch(`${BACKEND_API_URL}/api/rag/conversation/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: newTitle }),
    });

    setEditingChatId(null);
    setNewTitle("");

    await loadConversations();
  };

  // const generateAIResponse = (question: string): string => {
  //   if (
  //     question.toLowerCase().includes("tenant") ||
  //     question.toLowerCase().includes("rent")
  //   ) {
  //     return "As a tenant, you have several important rights:\n\n1. **Right to Habitable Housing**: Your landlord must maintain the property in a safe and livable condition.\n\n2. **Right to Privacy**: Your landlord must provide proper notice (usually 24-48 hours) before entering your rental unit.\n\n3. **Right to Fair Treatment**: You're protected against discrimination based on race, religion, national origin, disability, or family status.\n\n4. **Security Deposit Rights**: Your landlord must return your security deposit (minus legitimate deductions) within a specific timeframe after you move out.\n\n5. **Right to Withhold Rent**: In some cases, if your landlord fails to make necessary repairs, you may have the right to withhold rent or make repairs and deduct the cost.\n\nThese rights vary by state, so I recommend consulting with a local attorney for specific guidance about your situation.";
  //   }
  //   return "I understand your question. Based on current legal standards, here's what you need to know:\n\nThe law in this area has been established through several important court decisions and statutes. Generally speaking, you have certain rights and responsibilities that are protected under law.\n\nI've found some relevant cases and legal references that might help. Would you like me to connect you with a qualified attorney who can provide more specific advice for your situation?";
  // };
  const displayedMessages = messages.length > 0 ? messages : initialMessages;
  return (
    <div className="grid lg:grid-cols-1 gap-6">
      {/* Main Chat Area */}
      <div className="col-span-1">
        <Card className="h-[calc(100vh-7rem)] overflow-hidden">
          <div className="flex h-full">
            {/* LEFT: Conversations Sidebar */}
            <div className="hidden md:flex md:w-56 lg:w-64 border-r bg-[#F8FAFC] flex-col h-full">
              {/* w-full max-w-64 border-r bg-[#F8FAFC] flex flex-col h-full */}
              {/* <div className="hidden md:flex md:w-56 lg:w-64 border-r bg-[#F8FAFC] flex-col h-full"> */}
              <div className="p-3">
                <Button
                  className="w-full bg-[#1E3A8A] text-white"
                  onClick={createNewChat}
                >
                  + New Chat
                </Button>
              </div>

              <ScrollArea className="flex-1 px-2 overflow-y-auto">
                {Array.isArray(conversations) &&
                  conversations.map((chat) => (
                    <div
                      key={chat._id}
                      onClick={() => loadMessages(chat._id)}
                      className={`group flex items-center gap-2 px-3 py-2 mb-2 rounded-full cursor-pointer text-sm ${
                        conversationId === chat._id
                          ? "bg-[#1E3A8A] text-white"
                          : "hover:bg-gray-200"
                      }`}
                    >
                      {/* LEFT : 3-dot menu */}
                      <div className="relative flex items-center">
                        <div className="relative flex items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenu(
                                activeMenu === chat._id ? null : chat._id,
                              );
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-300"
                          >
                            ⋮
                          </button>
                          {activeMenu === chat._id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute left-0 top-8 w-32 bg-white border rounded-md shadow z-10"
                            >
                              <button
                                className="block w-full text-left px-3 py-2 text-black hover:bg-gray-100"
                                onClick={() => {
                                  setEditingChatId(chat._id);
                                  setNewTitle(chat.title || "");
                                  setActiveMenu(null);
                                }}
                              >
                                Rename
                              </button>

                              <button
                                className="block w-full text-left px-3 py-2 hover:bg-red-100 text-red-600"
                                onClick={() => deleteConversation(chat._id)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* LEFT: Title or Input */}
                      <div
                        className="flex-1 truncate"
                        onClick={() => loadMessages(chat._id)}
                      >
                        {editingChatId === chat._id ? (
                          <input
                            className="w-full text-black px-1 bg-transparent outline-none"
                            value={newTitle}
                            autoFocus
                            onChange={(e) => setNewTitle(e.target.value)}
                            onBlur={() => renameConversation(chat._id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                renameConversation(chat._id);
                            }}
                          />
                        ) : (
                          <p className="truncate">{chat.title || "New Chat"}</p>
                        )}
                      </div>
                    </div>
                  ))}
              </ScrollArea>
            </div>

            {/* RIGHT: Chat Area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* HEADER */}
              <CardHeader className="border-b bg-gradient-to-r from-[#1E3A8A] to-[#1E3A8A]/80">
                <div className="flex items-center gap-3">
                  <Button
                  variant="ghost"
                  className="md:hidden text-white"
                  onClick={() => setSidebarOpen(true)}
                >
                  ☰
                </Button>
                  <div className="w-10 h-10 rounded-full bg-[#D4AF37] flex items-center justify-center">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-white">
                      AI Legal Assistant
                    </CardTitle>
                    {/* {(<p className="text-sm text-white/80">
                      Ask your legal questions in simple language
                    </p>) */}

                  </div>
                  <Badge className="bg-white/20 text-white border-white/30">
                    {user?.role} View
                  </Badge>
                </div>
              </CardHeader>

              {/* CHAT CONTENT */}
              <CardContent className="flex-1 p-0 flex flex-col overflow-y-auto">
                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-4">
                    {displayedMessages.map((message) => (
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
                            <p className="text-sm whitespace-pre-wrap">
                              {message.content}
                            </p>
                          </div>
                          {message.references && (
                            <div className="mt-1 space-y-1">
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Legal References:
                              </p>
                              {message.references.map((ref, idx) => (
                                <Card
                                  key={idx}
                                  className="border-l-4 border-l-[#D4AF37]"
                                >
                                  <CardContent className="p-1">
                                    <p className="text-xs">{ref.title}</p>
                                    <p className="text-xs text-gray-500">
                                      {ref.citation}
                                    </p>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )}
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
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="bg-[#1E3A8A] text-white">
                            <Bot className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-gray-100 rounded-lg p-4">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                          </div>
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
              {//Mobile Sidebar Overlay
              sidebarOpen && (
              <div className="fixed inset-0 z-50 flex">
                {/* Overlay */}
                <div
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setSidebarOpen(false)}
                />

                {/* Sidebar */}
                <div className="relative w-64 bg-[#F8FAFC] h-full flex flex-col shadow-lg">
                  <div className="p-3 flex justify-between items-center">
                    <Button
                      className="w-[calc(100%-1rem)] bg-[#1E3A8A] text-white"
                      onClick={createNewChat}
                    >
                      + New Chat
                    </Button>
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="ml-2 text-xl"
                    >
                      ✕
                    </button>
                  </div>

                  <ScrollArea className="flex-1 px-2 overflow-y-auto">
                    {conversations.map((chat) => (
                      <div
                        key={chat._id}
                        onClick={() => {
                          loadMessages(chat._id);
                          setSidebarOpen(false);
                        }}
                        className="px-3 py-2 mb-2 rounded-full cursor-pointer hover:bg-gray-200"
                      >
                        {chat.title || "New Chat"}
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              </div>
            )}
            </div>
          </div>
        </Card>
      </div>
      {/* Sidebar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* Quick Questions */}
        <Card className="md:col-span-2">
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
        {user?.role === "client" && (
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
