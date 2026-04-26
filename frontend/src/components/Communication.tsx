// Communication.tsx — corrected & mobile-responsive

import { useState, useEffect, useRef, useCallback } from "react";
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
  Plus,
  X,
  Pencil,
  Trash2,
  Check,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  ArrowLeft,
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

// ─── Pure utility helpers (outside component — no re-creation on every render) ─

function formatSize(bytes: number): string {
  return bytes < 1_048_576
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4" />;
  return <FileIcon className="h-4 w-4" />;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CommunicationProps {
  userRole: UserRole;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

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

const SOCKET_URL =
  import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5000";

// ─── Component ─────────────────────────────────────────────────────────────────

export function Communication({
  userRole,
  onNavigate,
  onLogout,
}: CommunicationProps) {
  const currentUser: BackendUser = JSON.parse(
    localStorage.getItem("user") || "{}"
  );
  // Support both _id and id shapes from the backend
  const currentUserId: string =
    (currentUser as any)._id ?? (currentUser as any).id ?? "";

  const [conversations, setConversations] = useState<BackendConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<BackendConversation | null>(
    null
  );
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false); // FIX: dedicated send-loading state
  const [error, setError] = useState("");

  // FIX: mobile — show the chat pane instead of the sidebar
  const [showMobileChat, setShowMobileChat] = useState(false);

  // "Start conversation" modal
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // Rename inline
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Context menu
  const [menuConvId, setMenuConvId] = useState<string | null>(null);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [filePreview, setFilePreview] = useState<{
    file: File;
    previewUrl?: string;
  } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // FIX: keep a stable ref to selectedConv so reconnect handler is always fresh
  const selectedConvRef = useRef<BackendConversation | null>(null);
  useEffect(() => {
    selectedConvRef.current = selectedConv;
  }, [selectedConv]);

  // ─── Error auto-clear (FIX: errors no longer stick forever) ───────────────
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(t);
  }, [error]);

  // ─── Socket.IO setup ───────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { reconnection: true });
    socketRef.current = socket;

    // FIX: rejoin conversation room after a reconnect
    socket.on("connect", () => {
      if (selectedConvRef.current) {
        socket.emit("joinConversation", selectedConvRef.current._id);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Join/leave socket room whenever the active conversation changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !selectedConv) return;

    socket.emit("joinConversation", selectedConv._id);

    const onMessage = (msg: BackendMessage) =>
      setMessages((prev) => {
        // FIX: deduplicate — ignore if we already have this message _id
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });

    const onRenamed = ({
      conversationId,
      name,
    }: {
      conversationId: string;
      name: string;
    }) =>
      setConversations((prev) =>
        prev.map((c) =>
          c._id === conversationId ? { ...c, customName: name } : c
        )
      );

    socket.on("newMessage", onMessage);
    socket.on("conversationRenamed", onRenamed);

    return () => {
      socket.emit("leaveConversation", selectedConv._id);
      socket.off("newMessage", onMessage);
      socket.off("conversationRenamed", onRenamed);
    };
  }, [selectedConv]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Load conversations on mount ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await getConversations();
        setConversations(data);
        if (data.length > 0) await selectConversation(data[0]);
      } catch {
        setError("Failed to load conversations");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Select conversation & load messages ───────────────────────────────────
  // FIX: wrapped in useCallback so it's stable and safe in the mount effect
  const selectConversation = useCallback(
    async (conv: BackendConversation) => {
      setSelectedConv(conv);
      setMessages([]);
      setLoading(true);
      try {
        const msgs = await getMessages(conv._id);
        setMessages(msgs);
        setConversations((prev) =>
          prev.map((c) => (c._id === conv._id ? { ...c, unread: 0 } : c))
        );
      } catch {
        setError("Failed to load messages");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ─── Send text message ─────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputValue.trim() || !selectedConv || sending) return;
    const text = inputValue.trim();
    setInputValue("");
    setSending(true); // FIX: disable button during in-flight request
    try {
      await sendMessage(selectedConv._id, text);
      // Socket "newMessage" event delivers the message back to all participants
    } catch {
      setError("Failed to send message");
    } finally {
      setSending(false);
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
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const handleFileSend = async () => {
    if (!filePreview || !selectedConv) return;
    setUploadingFile(true);
    try {
      await sendFile(
        selectedConv._id,
        filePreview.file,
        inputValue.trim() || undefined
      );
      // FIX: always revoke the object URL after a successful send
      if (filePreview.previewUrl) URL.revokeObjectURL(filePreview.previewUrl);
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

  // ─── Start new conversation ────────────────────────────────────────────────
  const handleStartConversation = async () => {
    if (!newEmail.trim()) return;
    setModalLoading(true);
    setModalError("");
    try {
      const conv = await startConversation(newEmail.trim());
      setConversations((prev) => {
        const exists = prev.find((c) => c._id === conv._id);
        return exists ? prev : [conv, ...prev];
      });
      setShowModal(false);
      setNewEmail("");
      await selectConversation(conv);
      setShowMobileChat(true); // open chat on mobile after starting
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
    // FIX: safe optional chaining — getOtherParticipant can return undefined
    setRenameValue(conv.customName ?? getOtherParticipant(conv)?.name ?? "");
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
          c._id === convId ? { ...c, customName: renameValue.trim() } : c
        )
      );
      if (selectedConv?._id === convId)
        setSelectedConv((sc) =>
          sc ? { ...sc, customName: renameValue.trim() } : sc
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
        setShowMobileChat(false);
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

  // ─── Helpers ───────────────────────────────────────────────────────────────

  // FIX: returns undefined instead of crashing when participant is missing
  const getOtherParticipant = (
    conv: BackendConversation
  ): BackendUser | undefined =>
    conv.participants.find(
      (p) => p._id?.toString() !== currentUserId?.toString()
    );

  const displayName = (conv: BackendConversation): string => {
    if (conv.customName) return conv.customName;
    return getOtherParticipant(conv)?.name ?? "Unknown";
  };

  const filteredConvs = conversations.filter((conv) =>
    displayName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout
      userRole={userRole}
      currentPage="communication"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      {/* ── New Conversation Modal ──────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[#1E293B] font-semibold">New Conversation</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setModalError("");
                  setNewEmail("");
                }}
                className="cursor-pointer"
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

      {/* ── Main card ──────────────────────────────────────────────────────── */}
      <Card className="h-[calc(100vh-9rem)] overflow-hidden">
        {/*
          FIX (layout): The grid is now at the top level of the Card so both
          columns are true siblings. Previously the right Card was nested inside
          the left column, breaking the two-column layout entirely.
        */}
        <div className="flex h-full">{/*grid md:grid-cols-[320px,1fr] */}

          {/* ── Sidebar — conversation list ───────────────────────────────── */}
          {/*
            FIX (mobile): hidden when a chat is open on narrow screens,
            always visible on md+.
          */}
          <div
            className={`flex flex-col border-r h-full overflow-hidden ${
              showMobileChat ? "hidden md:flex" : "flex"
            }`}
          >
            {/* Header */}
            <CardHeader className="border-b flex-shrink-0">
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

            {/* Conversation list */}
            <ScrollArea className="flex-1">
              <div className="p-2">
                {filteredConvs.length === 0 && (
                  <p className="text-xs text-gray-400 text-center mt-6">
                    No conversations yet. Click <strong>+</strong> to start one.
                  </p>
                )}
                {filteredConvs.map((conv) => {
                  const other = getOtherParticipant(conv);
                  const isActive = selectedConv?._id === conv._id;
                  const isRenaming = renamingId === conv._id;
                  const isMenuOpen = menuConvId === conv._id;

                  return (
                    /*
                      FIX (layout): `relative` added so the absolute-positioned
                      dropdown is scoped to this row instead of escaping to a
                      distant ancestor.
                      FIX (a11y/UX): cursor-pointer instead of cursor-default on
                      a role="button" element.
                    */
                    <div
                      key={conv._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setMenuConvId(null);
                        selectConversation(conv);
                        setShowMobileChat(true); // mobile: reveal chat pane
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          selectConversation(conv);
                          setShowMobileChat(true);
                        }
                      }}
                      className={`relative w-full p-3 rounded-lg flex items-center gap-3 mb-1 transition-colors text-left cursor-pointer ${
                        isActive
                          ? "bg-[#1E3A8A]/10 border border-[#1E3A8A]/20"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <Avatar className="flex-shrink-0">
                        <AvatarFallback
                          className={`${
                            other?.role === "lawyer"
                              ? "bg-[#1E3A8A]"
                              : "bg-[#D4AF37]"
                          } text-white`}
                        >
                          {/* FIX: safe — other can be undefined */}
                          {other ? getInitials(other.name) : "?"}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        {isRenaming ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename(conv._id);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              className="h-6 text-xs py-0 px-1"
                            />
                            <button
                              onClick={() => commitRename(conv._id)}
                              className="text-green-600 hover:text-green-700 cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setRenamingId(null)}
                              className="text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-start mb-0.5">
                              <h4 className="text-sm font-medium truncate">
                                {displayName(conv)}
                              </h4>
                              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                {new Date(
                                  conv.lastMessageAt
                                ).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              {conv.lastMessage?.content || "No messages yet"}
                            </p>
                          </>
                        )}
                      </div>

                      {conv.unread > 0 && !isRenaming && (
                        <Badge className="bg-[#D4AF37] text-white text-xs flex-shrink-0">
                          {conv.unread}
                        </Badge>
                      )}

                      {!isRenaming && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuConvId(isMenuOpen ? null : conv._id);
                          }}
                          className="ml-1 p-1 rounded hover:bg-gray-200 text-gray-400 flex-shrink-0 cursor-pointer"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}

                      {/* Dropdown — correctly scoped by parent `relative` */}
                      {isMenuOpen && (
                        <div className="absolute right-2 top-12 z-20 bg-white border rounded-lg shadow-lg py-1 w-36">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(conv);
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5 text-gray-500" />
                            Rename
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(conv._id);
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-red-50 text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* ── Chat area ─────────────────────────────────────────────────── */}
          {/*
            FIX (mobile): hidden on mobile until a conversation is selected,
            always visible on md+.
            FIX (layout): proper flex column with overflow-hidden so the inner
            message list scrolls instead of the whole page.
          */}
          <div
            className={`flex-1 flex-col h-full overflow-hidden ${
              showMobileChat ? "flex" : "hidden md:flex"
            }`}
          >
            {selectedConv ? (
              <>
                {/* Chat header */}
                {(() => {
                  const other = getOtherParticipant(selectedConv);
                  return (
                    <div className="border-b p-4 bg-white flex-shrink-0">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          {/* FIX (mobile): back arrow only shown on small screens */}
                          <button
                            className="md:hidden mr-1 text-gray-500 hover:text-gray-700 cursor-pointer"
                            onClick={() => setShowMobileChat(false)}
                            aria-label="Back to conversations"
                          >
                            <ArrowLeft className="h-5 w-5" />
                          </button>
                          <Avatar>
                            <AvatarFallback
                              className={`${
                                other?.role === "lawyer"
                                  ? "bg-[#1E3A8A]"
                                  : "bg-[#D4AF37]"
                              } text-white`}
                            >
                              {other ? getInitials(other.name) : "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-[#1E293B]">
                              {displayName(selectedConv)}
                            </h3>
                            <p className="text-xs text-gray-500 capitalize">
                              {other?.role ?? ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
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

                {/*
                  FIX (layout): replaced ScrollArea + hardcoded min/max-h-75
                  with a plain div flex-1 overflow-y-auto — this lets the
                  message area fill all remaining space correctly.
                */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100">
                  {loading && (
                    <p className="text-xs text-center text-gray-400 mb-4">
                      Loading messages…
                    </p>
                  )}
                  <div className="space-y-4">
                    {messages.map((msg) => {
                      const isMe = msg.sender._id === currentUserId;
                      return (
                        <div
                          key={msg._id}
                          className={`flex gap-2 md:gap-3 ${
                            isMe ? "justify-end" : "justify-start"
                          }`}
                        >
                          {!isMe && (
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarFallback className="bg-[#D4AF37] text-white text-xs">
                                {getInitials(msg.sender.name)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className="max-w-[75%] md:max-w-[70%]">
                            <div
                              className={`rounded-lg p-3 md:p-4 ${
                                isMe
                                  ? "bg-[#1E3A8A] text-white"
                                  : "bg-white text-gray-800 border"
                              }`}
                            >
                              <p className="text-sm">{msg.content}</p>
                              {msg.attachment && (
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
                                  {msg.attachment.mimeType.startsWith(
                                    "image/"
                                  ) ? (
                                    <img
                                      src={`${SOCKET_URL}${msg.attachment.url}`}
                                      alt={msg.attachment.name}
                                      className="max-w-[180px] max-h-[160px] rounded object-cover"
                                    />
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={
                                          isMe ? "text-white" : "text-gray-500"
                                        }
                                      >
                                        {fileIcon(msg.attachment.mimeType)}
                                      </span>
                                      <div>
                                        <p className="text-xs font-medium truncate max-w-[140px]">
                                          {msg.attachment.name}
                                        </p>
                                        <p
                                          className={`text-xs ${
                                            isMe
                                              ? "text-white/60"
                                              : "text-gray-400"
                                          }`}
                                        >
                                          {formatSize(msg.attachment.size)}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </a>
                              )}
                            </div>
                            <p
                              className={`text-xs text-gray-500 mt-1 ${
                                isMe ? "text-right" : "text-left"
                              }`}
                            >
                              {new Date(msg.createdAt).toLocaleTimeString(
                                "en-US",
                                { hour: "numeric", minute: "2-digit" }
                              )}
                            </p>
                          </div>
                          {isMe && (
                            // FIX: show real initials instead of a generic User icon
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarFallback className="bg-[#1E3A8A] text-white text-xs">
                                {getInitials(currentUser.name ?? "Me")}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      );
                    })}
                    {/* FIX: bottomRef restored — was accidentally commented out */}
                    <div ref={bottomRef} />
                  </div>
                </div>

                {/* File preview bar */}
                {filePreview && (
                  <div className="px-4 pt-3 bg-white border-t flex-shrink-0">
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
                        className="text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Message input */}
                <div className="p-3 md:p-4 bg-white border-t flex-shrink-0">
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
                      className="flex-shrink-0"
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
                    {/* FIX: disabled during both text sends and file uploads */}
                    <Button
                      onClick={filePreview ? handleFileSend : handleSend}
                      disabled={uploadingFile || sending}
                      className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 flex-shrink-0"
                    >
                      {uploadingFile || sending ? (
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
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Select a conversation or start a new one
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Backdrop to close context menu on outside click */}
      {menuConvId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setMenuConvId(null)}
        />
      )}
    </DashboardLayout>
  );
}