// Communication.tsx  — wired to real backend
import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "./DashboardLayout";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import {
  Send,
  Paperclip,
  Search,
  MoreVertical,
  Phone,
  Video,
  User,
  Circle,
  Plus,
  X,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import {
  getConversations,
  startConversation,
  getMessages,
  sendMessage,
} from "../services/chatCommunicationService.ts";
import type { Page, UserRole } from "../App";

interface CommunicationProps {
  userRole: UserRole;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

// Shapes returned by the backend
interface BackendUser {
  _id: string;
  name: string;
  email: string;
  role: "lawyer" | "client" | "admin";
}

interface BackendConversation {
  _id: string;
  participants: BackendUser[];
  lastMessage?: { content: string; createdAt: string };
  lastMessageAt: string;
  unread: number;
}

interface BackendMessage {
  _id: string;
  sender: BackendUser;
  content: string;
  createdAt: string;
  attachment?: { name: string; url: string; type: string };
}

const SOCKET_URL = "http://localhost:5000";

export function Communication({ userRole, onNavigate, onLogout }: CommunicationProps) {
  const currentUser: BackendUser = JSON.parse(localStorage.getItem("user") || "{}");

  const [conversations, setConversations] = useState<BackendConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<BackendConversation | null>(null);
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // "Start conversation" modal
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ─── Socket.IO setup ────────────────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(SOCKET_URL);
    return () => { socketRef.current?.disconnect(); };
  }, []);

  // Join/leave socket room when conversation changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !selectedConv) return;

    socket.emit("joinConversation", selectedConv._id);

    const handler = (msg: BackendMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    socket.on("newMessage", handler);

    return () => {
      socket.emit("leaveConversation", selectedConv._id);
      socket.off("newMessage", handler);
    };
  }, [selectedConv]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Load conversations ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await getConversations();
        setConversations(data);
        if (data.length > 0) selectConversation(data[0]);
      } catch {
        setError("Failed to load conversations");
      }
    })();
  }, []);

  // ─── Select conversation & load messages ────────────────────────────────────
  const selectConversation = async (conv: BackendConversation) => {
    setSelectedConv(conv);
    setMessages([]);
    setLoading(true);
    try {
      const msgs = await getMessages(conv._id);
      setMessages(msgs);
      // Clear unread badge locally
      setConversations((prev) =>
        prev.map((c) => (c._id === conv._id ? { ...c, unread: 0 } : c))
      );
    } catch {
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  // ─── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputValue.trim() || !selectedConv) return;
    const text = inputValue.trim();
    setInputValue("");
    try {
      await sendMessage(selectedConv._id, text);
      // Socket.IO will push the new message back via "newMessage" event
    } catch {
      setError("Failed to send message");
    }
  };

  // ─── Start new conversation ─────────────────────────────────────────────────
  const handleStartConversation = async () => {
    if (!newEmail.trim()) return;
    setModalLoading(true);
    setModalError("");
    try {
      const conv = await startConversation(newEmail.trim());
      // Merge into list if not already there
      setConversations((prev) => {
        const exists = prev.find((c) => c._id === conv._id);
        return exists ? prev : [conv, ...prev];
      });
      setShowModal(false);
      setNewEmail("");
      selectConversation(conv);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "User not found";
      setModalError(message);
    } finally {
      setModalLoading(false);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const getOtherParticipant = (conv: BackendConversation): BackendUser => {
    return conv.participants.find((p) => p._id !== currentUser._id) ?? conv.participants[0];
  };

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const filteredConvs = conversations.filter((conv) => {
    const other = getOtherParticipant(conv);
    return other.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout
      userRole={userRole}
      currentPage="communication"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      {/* <Card className=" h-[calc(100vh-14rem)] overflow-y-auto"> */}
      {/* Start Conversation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[#1E293B] font-semibold">New Conversation</h3>
              <button onClick={() => { setShowModal(false); setModalError(""); setNewEmail(""); }}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Enter the email address of the person you want to message.
            </p>
            <Input
              placeholder="user@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartConversation()}
              className="mb-2"
            />
            {modalError && <p className="text-xs text-red-500 mb-2">{modalError}</p>}
            <Button
              onClick={handleStartConversation}
              disabled={modalLoading}
              className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
            >
              {modalLoading ? "Finding user…" : "Start Conversation"}
            </Button>
          </div>
        </div>
      )}

      <Card className="h-[calc(100vh-9rem)] overflow-hidden">
        <div className="grid md:grid-cols-[320px,1fr] h-full">
          {/* ── Contacts Sidebar ─────────────────────────────────────────── */}
          <div className="border-r">{/*flex flex-col*/}
            <div className="flex gap-4">
              {/* Whole left side New Convo + Chats */}
              <div >
            {/* Messages Box on left Side with start conversation + button */}
                <CardHeader className="border-b ">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-[#1E293B]">Messages</CardTitle>
                    <Button
                      size="icon"
                      variant="outline"
                      title="Start new conversation"
                      onClick={() => setShowModal(true)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search contacts…"
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </CardHeader>

                {/* Left Side All Chats Section */}
                <ScrollArea className=" h-[calc(100%-9rem)] flex-1">{/*flex-1*/}
                  <div className="p-2 ">
                    {filteredConvs.length === 0 && (
                      <p className="text-xs text-gray-400 text-center mt-6">
                        No conversations yet. Click <strong>+</strong> to start one.
                      </p>
                    )}
                    {filteredConvs.map((conv) => {
                      const other = getOtherParticipant(conv);
                      const isActive = selectedConv?._id === conv._id;
                      return (
                        <button
                          key={conv._id}
                          onClick={() => selectConversation(conv)}
                          className={`w-full p-3 rounded-lg flex items-center gap-3 mb-1 transition-colors text-left ${isActive
                              ? "bg-[#1E3A8A]/10 border border-[#1E3A8A]/20"
                              : "hover:bg-gray-100"
                            }`}
                        > 
                        <div className="relative">
                          <Avatar>
                            <AvatarFallback
                              className={`${other.role === "lawyer" ? "bg-[#1E3A8A]" : "bg-[#D4AF37]"
                                } text-white`}
                            >
                              {initials(other.name)}
                            </AvatarFallback>
                          </Avatar>
                        </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-0.5">
                              <h4 className="text-sm font-medium truncate">{other.name}</h4>
                              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                {new Date(conv.lastMessageAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              {conv.lastMessage?.content ?? "No messages yet"}
                            </p>
                          </div>
                          {conv.unread > 0 && (
                            <Badge className="bg-[#D4AF37] text-white text-xs">{conv.unread}</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
              <Card className="flex-1 border-l">{/*flex flex-col*/}
                {/* ── Chat Area ────────────────────────────────────────────────── */}
                {selectedConv ? (
                  <div className="flex flex-col overflow-y-auto">{/*h-full overflow-auto*/}
                    {/* Header */}
                    {(() => {
                      const other = getOtherParticipant(selectedConv);
                      return (
                        <div className="border-b p-4 bg-white">{/* flex justify-between items-center*/}
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <Avatar>
                                  <AvatarFallback
                                    className={`${other.role === "lawyer" ? "bg-[#1E3A8A]" : "bg-[#D4AF37]"
                                      } text-white`}
                                  >
                                    {initials(other.name)}
                                  </AvatarFallback>
                                </Avatar>
                                {/* {other.online && (
                            <Circle className="absolute bottom-0 right-0 h-3 w-3 fill-green-500 text-green-500 border-2 border-white rounded-full" />
                          )} */}
                              </div>
                              <div>
                                <h3 className="font-semibold text-[#1E293B]">{other.name}</h3>
                                <p className="text-xs text-gray-500 capitalize">{other.role}</p>
                              </div>
                            </div> 
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon"><Phone className="h-5 w-5 text-gray-600" /></Button>
                            <Button variant="ghost" size="icon"><Video className="h-5 w-5 text-gray-600" /></Button>
                            <Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5 text-gray-600" /></Button>
                          </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Messages */}
                    <ScrollArea className="min-h-75 max-h-75 flex-1 p-6 bg-gray-100 overflow-y-auto">
                      {loading && (
                        <p className="text-xs text-center text-gray-400">Loading messages…</p>
                      )}
                      <div className="space-y-4">
                        {messages.map((msg) => {
                          const isMe = msg.sender._id === currentUser._id;
                          return (
                            <div
                              key={msg._id}
                              className={`flex gap-3 ${isMe ? "justify-end" : "justify-start"}`}
                            >
                              {!isMe && (
                                <Avatar className="h-8 w-8 flex-shrink-0">
                                  <AvatarFallback className="bg-[#D4AF37] text-white text-xs">
                                    {initials(msg.sender.name)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <div className="max-w-[70%]">
                                <div
                                  className={`rounded-lg p-4 ${isMe
                                      ? "bg-[#1E3A8A] text-white"
                                      : "bg-white text-gray-800 border"
                                    }`}
                                >
                                  <p className="text-sm">{msg.content}</p>
                                  {msg.attachment && (
                                    <div
                                      className={`mt-2 p-2 rounded border ${isMe
                                          ? "bg-white/10 border-white/20"
                                          : "bg-gray-50 border-gray-200"
                                        }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <Paperclip className="h-4 w-4" />
                                        <span className="text-sm">{msg.attachment.name}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <p
                                  className={`text-xs text-gray-500 mt-1 ${isMe ? "text-right" : "text-left"
                                    }`}
                                >
                                  {new Date(msg.createdAt).toLocaleTimeString("en-US", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </p>
                              </div>
                              {isMe && (
                                <Avatar className="h-8 w-8 flex-shrink-0">
                                  <AvatarFallback className="bg-[#1E3A8A] text-white">
                                    <User className="h-4 w-4" />
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          );
                        })}
                        {/* <div ref={bottomRef} /> */}
                      </div>
                    </ScrollArea>

                    {/* Input */}
                    <div className="p-4 bg-white border-t">
                      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
                      <div className="flex gap-2">
                        <Button variant="outline" size="icon">
                          <Paperclip className="h-5 w-5 text-gray-600" />
                        </Button>
                        <Input
                          placeholder="Type your message…"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSend()}
                          className="flex-1"
                        />
                        <Button onClick={handleSend} className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90">
                          <Send className="h-5 w-5" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        All communications are encrypted and confidential
                      </p>
                    </div>
                  </div>

          ): (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a conversation or start a new one
          </div>
          )}
          </Card>
        </div>
        </div>
        </div>
      </Card>
      {/* </Card> */}
    </DashboardLayout>
  );
}