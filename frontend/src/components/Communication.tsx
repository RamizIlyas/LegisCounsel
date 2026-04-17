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
  Plus,
  X,
  Pencil,
  Trash2,
  Check,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import {
  getConversations,
  startConversation,
  getMessages,
  sendMessage,
  sendFile,
  renameConversation,
  deleteConversation,
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
  customName?: string | null;
}

interface BackendMessage {
  _id: string;
  sender: BackendUser;
  content: string;
  createdAt: string;
  attachment?: { name: string; url: string; mimeType: string; size: number };
}
const SOCKET_URL = import.meta.env.VITE_BACKEND_API_URL ||"http://localhost:5000";

export function Communication({
  userRole,
  onNavigate,
  onLogout,
}: CommunicationProps) {
  const currentUser: BackendUser = JSON.parse(
    localStorage.getItem("user") || "{}",
  );
  const currentUserId = currentUser._id || (currentUser as any).id;

  const [conversations, setConversations] = useState<BackendConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<BackendConversation | null>(
    null,
  );
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

  // ── Rename inline ──
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── Context menu ──
  const [menuConvId, setMenuConvId] = useState<string | null>(null);

  // ── File upload ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [filePreview, setFilePreview] = useState<{
    file: File;
    previewUrl?: string;
  } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ─── Socket.IO setup ────────────────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(SOCKET_URL);
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Join/leave socket room when conversation changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !selectedConv) return;
    socket.emit("joinConversation", selectedConv._id);

    const onMessage = (msg: BackendMessage) =>
      setMessages((prev) => [...prev, msg]);

    const onRenamed = ({
      conversationId,
      name,
    }: {
      conversationId: string;
      name: string;
    }) =>
      setConversations((prev) =>
        prev.map((c) =>
          c._id === conversationId ? { ...c, customName: name } : c,
        ),
      );

    socket.on("newMessage", onMessage);
    socket.on("conversationRenamed", onRenamed);

    return () => {
      socket.emit("leaveConversation", selectedConv._id);
      socket.off("newMessage", onMessage);
      socket.off("conversationRenamed", onRenamed);
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
        // console.log("Fetched conversations: Coversations Gotten", data);
        // console.log("Full localStorage user:", JSON.parse(localStorage.getItem("user") || "{}"));
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
        prev.map((c) => (c._id === conv._id ? { ...c, unread: 0 } : c)),
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
  // ─── File upload flow ──────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    setFilePreview({
      file,
      previewUrl: isImage ? URL.createObjectURL(file) : undefined,
    });
    // reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleFileSend = async () => {
    if (!filePreview || !selectedConv) return;
    setUploadingFile(true);
    try {
      await sendFile(
        selectedConv._id,
        filePreview.file,
        inputValue.trim() || undefined,
      );
      setFilePreview(null);
      setInputValue("");
    } catch (err) {
      console.error("Error uploading file:", err);
      setError("Failed to upload file");
    } finally {
      setUploadingFile(false);
    }
  };

  const cancelFilePreview = () => {
    if (filePreview?.previewUrl) URL.revokeObjectURL(filePreview.previewUrl);
    setFilePreview(null);
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
      await selectConversation(conv);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "User not found";
      setModalError(message);
    } finally {
      setModalLoading(false);
    }
  };

  // ─── Rename ────────────────────────────────────────────────────────────────
  const startRename = (conv: BackendConversation) => {
    setRenamingId(conv._id);
    setRenameValue(conv.customName ?? getOtherParticipant(conv).name);
    setMenuConvId(null);
  };

  const commitRename = async (convId: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await renameConversation(convId, renameValue.trim());
      setConversations((prev) =>
        prev.map((c) =>
          c._id === convId ? { ...c, customName: renameValue.trim() } : c,
        ),
      );
      if (selectedConv?._id === convId)
        setSelectedConv((sc) =>
          sc ? { ...sc, customName: renameValue.trim() } : sc,
        );
    } catch {
      setError("Failed to rename");
    }
    setRenamingId(null);
  };

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (convId: string) => {
    setMenuConvId(null);
    try {
      await deleteConversation(convId);
      const remaining = conversations.filter((c) => c._id !== convId);
      setConversations(remaining);
      if (selectedConv?._id === convId) {
        if (remaining.length > 0) await selectConversation(remaining[0]);
        else {
          setSelectedConv(null);
          setMessages([]);
        }
      }
    } catch {
      setError("Failed to delete conversation");
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const getOtherParticipant = (conv: BackendConversation): BackendUser => {
  const other = conv.participants.find(
    (p) => p._id?.toString() !== currentUserId?.toString()
  );
  return other ?? conv.participants[1]; // fallback to index 1, not 0
};
  const displayName = (conv: BackendConversation) =>
    conv.customName ?? getOtherParticipant(conv).name;

  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  function fileIcon(mimeType: string) {
    if (mimeType.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
    if (mimeType === "application/pdf") return <FileText className="h-4 w-4" />;
    return <FileIcon className="h-4 w-4" />;
  }

  const filteredConvs = conversations.filter((conv) =>
    displayName(conv).toLowerCase().includes(searchQuery.toLowerCase()),
  );

  //Old filter logic before we added custom names and search by them too
  // const filteredConvs = conversations.filter((conv) => {
  //   const other = getOtherParticipant(conv);
  //   return other.name.toLowerCase().includes(searchQuery.toLowerCase());
  // });

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout
      userRole={userRole}
      currentPage="communication"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      {/* <Card className=" h-[calc(100vh-14rem)] overflow-y-auto"> */}
      {/* Start New Conversation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[#1E293B] font-semibold">New Conversation</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setModalError("");
                  setNewEmail("");
                }}
              >
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
            {modalError && (
              <p className="text-xs text-red-500 mb-2">{modalError}</p>
            )}
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
      {/* ── Main layout ───────────────────────────────────────────────── */}
      <Card className="h-[calc(100vh-9rem)] overflow-hidden">
        <div className="grid md:grid-cols-[320px,1fr] h-full">
          {/* ── Contacts Sidebar ─────────────────────────────────────────── */}
          <div className="border-r">
            {/*flex flex-col*/}
            <div className="flex gap-4">
              {/* Whole left side New Convo + Chats */}
              <div>
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
                <ScrollArea className=" h-[calc(100%-9rem)] flex-1">
                  <div className="p-2 ">
                    {filteredConvs.length === 0 && (
                      <p className="text-xs text-gray-400 text-center mt-6">
                        No conversations yet. Click <strong>+</strong> to start
                        one.
                      </p>
                    )}
                    {filteredConvs.map((conv) => {
                      const other = getOtherParticipant(conv);
                      //Logging for Debugging
                      // console.log("Rendering conversation with", other.name);
                      // console.log("Object : ", other);

                      const isActive = selectedConv?._id === conv._id;
                      const isRenaming = renamingId === conv._id;
                      const isMenuOpen = menuConvId === conv._id;
                      return (
                        <div
                          key={conv._id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setMenuConvId(null);
                            selectConversation(conv);
                          }}
                          className={`w-full p-3 rounded-lg flex items-center gap-3 mb-1 transition-colors text-left ${
                            isActive
                              ? "bg-[#1E3A8A]/10 border border-[#1E3A8A]/20"
                              : "hover:bg-gray-100"
                          }`}
                          style={{ cursor: "default" }}
                        >
                          <div className="relative">
                            <Avatar>
                              <AvatarFallback
                                className={`${
                                  other.role === "lawyer"
                                    ? "bg-[#1E3A8A]"
                                    : "bg-[#D4AF37]"
                                } text-white`}
                              >
                                {initials(other.name)}
                              </AvatarFallback>
                            </Avatar>
                          </div>

                          <div className="flex-1 min-w-0">
                            {isRenaming ? (
                              <div
                                className="flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Input
                                  autoFocus
                                  value={renameValue}
                                  onChange={(e) =>
                                    setRenameValue(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      commitRename(conv._id);
                                    if (e.key === "Escape") setRenamingId(null);
                                  }}
                                  className="h-6 text-xs py-0 px-1"
                                />
                                <button
                                  onClick={() => commitRename(conv._id)}
                                  className="text-green-600 hover:text-green-700"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setRenamingId(null)}
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-between items-start mb-0.5">
                                <h4 className="text-sm font-medium truncate">
                                  {displayName(conv)}
                                </h4>
                                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                  {new Date(
                                    conv.lastMessageAt,
                                  ).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                            {/* //This is added in the upper condition block || Conditional rendering
                             <div className="flex justify-between items-start mb-0.5">
                              <h4 className="text-sm font-medium truncate">
                                {other.name}
                              </h4>
                              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                {new Date(
                                  conv.lastMessageAt,
                                ).toLocaleDateString()}
                              </span>
                            </div> */}
                            {!isRenaming && (
                              <p className="text-xs text-gray-500 truncate">
                                {conv.lastMessage?.content || "No messages yet"}
                              </p>
                            )}
                          </div>
                          {/*// Added in Condtional Rendering above 
                            <p className="text-xs text-gray-500 truncate">
                              {conv.lastMessage?.content ?? "No messages yet"}
                            </p>
                          </div> */}
                          {conv.unread > 0 && !isRenaming && (
                            <Badge className="bg-[#D4AF37] text-white text-xs">
                              {conv.unread}
                            </Badge>
                          )}

                          {/* Three-dot menu button */}
                          {!isRenaming && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuConvId(isMenuOpen ? null : conv._id);
                              }}
                              className="ml-1 p-1 rounded hover:bg-gray-200 text-gray-400 flex-shrink-0"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          )}
                          {/* Dropdown menu */}
                          {isMenuOpen && (
                            <div className="absolute right-2 top-10 z-20 bg-white border rounded-lg shadow-lg py-1 w-36">
                              <button
                                onClick={() => startRename(conv)}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50"
                              >
                                <Pencil className="h-3.5 w-3.5 text-gray-500" />{" "}
                                Rename
                              </button>
                              <button
                                onClick={() => handleDelete(conv._id)}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-red-50 text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
              <Card className="flex-1 border-l">
                {/* ── Chat Area ────────────────────────────────────────────────── */}
                {selectedConv ? (
                  <div className="flex flex-col overflow-y-auto">
                    {/* Header */}
                    {(() => {
                      const other = getOtherParticipant(selectedConv);
                      return (
                        <div className="border-b p-4 bg-white">
                          {/* flex justify-between items-center*/}
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <Avatar>
                                  <AvatarFallback
                                    className={`${
                                      other.role === "lawyer"
                                        ? "bg-[#1E3A8A]"
                                        : "bg-[#D4AF37]"
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
                                <h3 className="font-semibold text-[#1E293B]">
                                  {
                                    /*Previous Logic 
                                  {other.name} */
                                    displayName(selectedConv)
                                  }
                                </h3>
                                <p className="text-xs text-gray-500 capitalize">
                                  {other.role}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {/* <Button variant="ghost" size="icon">
                                <Phone className="h-5 w-5 text-gray-600" />
                              </Button>
                              <Button variant="ghost" size="icon">
                                <Video className="h-5 w-5 text-gray-600" />
                              </Button>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-5 w-5 text-gray-600" />
                              </Button> */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => startRename(selectedConv)}
                                title="Rename conversation"
                              >
                                <Pencil className="h-5 w-5 text-gray-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(selectedConv._id)}
                                title="Delete conversation"
                                className="hover:text-red-500"
                              >
                                <Trash2 className="h-5 w-5 text-gray-600" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Messages */}
                    <ScrollArea className="min-h-75 max-h-75 flex-1 p-6 bg-gray-100 overflow-y-auto">
                      {loading && (
                        <p className="text-xs text-center text-gray-400">
                          Loading messages…
                        </p>
                      )}
                      <div className="space-y-4">
                        {messages.map((msg) => {
                          const isMe = msg.sender._id === currentUser.id;                          
                          return (
                            <div
                              key={msg._id}
                              className={`flex gap-3 ${isMe ? "justify-end " : "justify-start"}`}
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
                                  className={`rounded-lg p-4 ${
                                    isMe
                                      ? "bg-[#1E3A8A] text-white"
                                      : "bg-white text-gray-800 border"
                                  }`}
                                >
                                  <p className="text-sm">{msg.content}</p>

                                  {/* // Older logic before we added file attachments
                                  {msg.attachment && (
                                    
                                    <div
                                      className={`mt-2 p-2 rounded border ${
                                        isMe
                                          ? "bg-white/10 border-white/20"
                                          : "bg-gray-50 border-gray-200"
                                      }`}
                                    >
                                      
                                      <div className="flex items-center gap-2">
                                        <Paperclip className="h-4 w-4" />
                                        <span className="text-sm">
                                          {msg.attachment.name}
                                        </span>
                                      </div>
                                    </div>
                                  )} */}
                                  {
                                    // New logic with file type icons and image previews
                                    msg.attachment && (
                                      <a
                                        href={`${SOCKET_URL}${msg.attachment.url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`flex items-start gap-2 p-2 rounded border mt-1 hover:opacity-80 transition-opacity ${
                                          isMe
                                            ? "bg-white/10 border-white/20"
                                            : "bg-gray-50 border-gray-200"
                                        }`}
                                      >
                                        {/* Image preview */}
                                        {msg.attachment.mimeType.startsWith(
                                          "image/",
                                        ) ? (
                                          <img
                                            src={`${SOCKET_URL}${msg.attachment.url}`}
                                            alt={msg.attachment.name}
                                            className="max-w-[200px] max-h-[180px] rounded object-cover"
                                          />
                                        ) : (
                                          <div className="flex items-center gap-2">
                                            <span
                                              className={
                                                isMe
                                                  ? "text-white"
                                                  : "text-gray-500"
                                              }
                                            >
                                              {fileIcon(
                                                msg.attachment.mimeType,
                                              )}
                                            </span>
                                            <div>
                                              <p className="text-xs font-medium truncate max-w-[160px]">
                                                {msg.attachment.name}
                                              </p>
                                              <p
                                                className={`text-xs ${isMe ? "text-white/60" : "text-gray-400"}`}
                                              >
                                                {formatSize(
                                                  msg.attachment.size,
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                        )}
                                      </a>
                                    )
                                  }
                                </div>
                                <p
                                  className={`text-xs text-gray-500 mt-1 ${
                                    isMe ? "text-right" : "text-left"
                                  }`}
                                >
                                  {new Date(msg.createdAt).toLocaleTimeString(
                                    "en-US",
                                    {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    },
                                  )}
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

                    {/* File preview bar */}
                    {filePreview && (
                      <div className="px-4 pt-3 bg-white border-t">
                        <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border">
                          {filePreview.previewUrl ? (
                            <img
                              src={filePreview.previewUrl}
                              alt="preview"
                              className="h-12 w-12 object-cover rounded"
                            />
                          ) : (
                            <div className="h-12 w-12 flex items-center justify-center bg-gray-200 rounded text-gray-500">
                              {fileIcon(filePreview.file.type)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {filePreview.file.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatSize(filePreview.file.size)}
                            </p>
                          </div>
                          <button
                            onClick={cancelFilePreview}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Input */}
                    <div className="p-4 bg-white border-t">
                      {error && (
                        <p className="text-xs text-red-500 mb-2">{error}</p>
                      )}
                      <div className="flex gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                          onChange={handleFileSelect}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => fileInputRef.current?.click()}
                          title="Attach file"
                        >
                          <Paperclip className="h-5 w-5 text-gray-600" />
                        </Button>

                        <Input
                          placeholder={
                            filePreview
                              ? "Add a caption… (optional)"
                              : "Type your message…"
                          }
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (filePreview) handleFileSend();
                              else handleSend();
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          onClick={filePreview ? handleFileSend : handleSend}
                          disabled={uploadingFile}
                          className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
                        >
                          {uploadingFile ? (
                            <span className="text-xs">Sending…</span>
                          ) : (
                            <Send className="h-5 w-5" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        All communications are encrypted and confidential
                      </p>
                    </div>
                  </div>
                ) : (
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
      {/* Close menu on outside click */}
      {menuConvId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setMenuConvId(null)}
        />
      )}
    </DashboardLayout>
  );
}
