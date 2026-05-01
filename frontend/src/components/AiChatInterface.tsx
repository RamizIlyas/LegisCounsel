// AiChatInterface.tsx
import { useRef, useState, useEffect, useCallback } from "react";
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
  Scale,
  MessageCircle,
  Sparkles,
  BookOpen,
  Gavel,
  Bookmark,
  BookmarkCheck,
  Wand2, // ← new: summarize icon
  ChevronDown, // ← new: collapse icon
  ChevronUp, // ← new: expand icon
  Loader2, // ← new: loading spinner
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import OpenAI from "openai";

const BACKEND_API_URL =
  import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5000";

// Anthropic API – used for the "Summarize" feature
// const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Replace with your actual key (or load from import.meta.env.VITE_ANTHROPIC_API_KEY)
const GPT_API_KEY =
  import.meta.env.VITE_GPT_API_KEY;


// ── Types ─────────────────────────────────────────────────────────────────────
interface LawSource {
  type: "law";
  law_title: string ;
  section_num: string;
  section_head: string;
  citation: string;
}

interface CaseSource {
  type: "case";
  citation: string;
  court: string;
  outcome: string;
  sections: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  law_sources?: LawSource[];
  case_sources?: CaseSource[];
}

// ── Auth fetch helper ─────────────────────────────────────────────────────────

const authFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("token");
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
};

// ── Stable content hash ───────────────────────────────────────────────────────

async function sha256Hex32(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// ── Outcome badge colour helper ───────────────────────────────────────────────

function outcomeColor(outcome: string): string {
  const o = outcome.toLowerCase();
  if (o.includes("acquit"))
    return "bg-green-100 text-green-800 border-green-300";
  if (o.includes("bail granted"))
    return "bg-blue-100  text-blue-800  border-blue-300";
  if (o.includes("bail refused"))
    return "bg-red-100   text-red-800   border-red-300";
  if (o.includes("allowed"))
    return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (o.includes("dismissed"))
    return "bg-orange-100 text-orange-800 border-orange-300";
  if (o.includes("convict"))
    return "bg-red-100   text-red-800   border-red-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}

// ── Reference panels ──────────────────────────────────────────────────────────

function LawReferences({ sources }: { sources: LawSource[] }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
        <BookOpen className="h-3 w-3 text-[#1E3A8A]" />
        Law Sections
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 border border-[#1E3A8A]/30 bg-[#1E3A8A]/5
                       rounded-md px-2 py-1 text-xs"
          >
            <span className="font-semibold text-[#1E3A8A]">
              § {s.law_title}
            </span>
            <span className="font-semibold text-[#1E3A8A]">
              § {s.section_num}
            </span>
            <span className="text-gray-600 truncate max-w-[160px]">
              {s.section_head}
            </span>
            <span className="text-gray-600 truncate max-w-[160px]">
              {s.citation}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseReferences({ sources }: { sources: CaseSource[] }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
        <Gavel className="h-3 w-3 text-[#D4AF37]" />
        Case Precedents
      </p>
      <div className="space-y-1">
        {sources.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-2 border border-[#D4AF37]/40 bg-[#D4AF37]/5
                       rounded-md px-2 py-1.5 text-xs"
          >
            <div className="w-0.5 self-stretch bg-[#D4AF37] rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 truncate">
                {s.citation}
              </p>
              <p className="text-gray-500 truncate">{s.court}</p>
            </div>
            {s.outcome && (
              <span
                className={`flex-shrink-0 border rounded px-1.5 py-0.5 text-[10px] font-medium
                            ${outcomeColor(s.outcome)}`}
              >
                {s.outcome}
              </span>
            )}
            {s.sections && (
              <span className="flex-shrink-0 bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-[10px]">
                § {s.sections}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bookmark button ───────────────────────────────────────────────────────────

interface BookmarkButtonProps {
  message: Message;
  conversationId: string | null;
  bookmarkedHashes: Set<string>;
  bookmarkIdByHash: Record<string, string>;
  onToggle: (
    message: Message,
    hash: string,
    isCurrentlyBookmarked: boolean,
    bookmarkId?: string,
  ) => void;
}

function BookmarkButton({
  message,
  conversationId,
  bookmarkedHashes,
  bookmarkIdByHash,
  onToggle,
}: BookmarkButtonProps) {
  const [hash, setHash] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    sha256Hex32(message.content).then(setHash);
  }, [message.content]);
  
  if (!hash) return null;

  const isBookmarked = bookmarkedHashes.has(hash);
  const bookmarkId = bookmarkIdByHash[hash];

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    await onToggle(message, hash, isBookmarked, bookmarkId);
    setPending(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title={isBookmarked ? "Remove bookmark" : "Bookmark this response"}
      className={`
        flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-xs transition-all
        ${
          isBookmarked
            ? "text-[#D4AF37] hover:text-red-500"
            : "text-gray-400 hover:text-[#D4AF37]"
        }
        ${pending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {isBookmarked ? (
        <>
          <BookmarkCheck className="h-3.5 w-3.5" />
          <span>Saved</span>
        </>
      ) : (
        <>
          <Bookmark className="h-3.5 w-3.5" />
          <span>Save</span>
        </>
      )}
    </button>
  );
}

// ── Summarize button + inline panel ──────────────────────────────────────────
//
//  State machine per message:
//    idle  →  loading  →  done (summary cached)
//    done  → collapsed/expanded toggle
//
// The parent passes `onSummarize` which handles the actual API call and caches
// results in a map so re-clicking is instant.

interface SummarizeButtonProps {
  message: Message;
  summaryCache: Record<string, string>; // messageId → summary text
  onSummarize: (message: Message) => Promise<void>;
}

function SummarizeButton({
  message,
  summaryCache,
  onSummarize,
}: SummarizeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const hasSummary = Boolean(summaryCache[message.id]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If summary already exists just toggle visibility
    if (hasSummary) {
      setOpen((prev) => !prev);
      return;
    }

    // Fetch summary for the first time
    setLoading(true);
    setOpen(false);
    try {
      await onSummarize(message);
      setOpen(true); // auto-expand after fetch
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-1">
      {/* Trigger button */}
      <button
        onClick={handleClick}
        disabled={loading}
        title="Summarize in simple terms with a real-world example"
        className={`
          flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all
          ${
            hasSummary && open
              ? "text-violet-600 hover:text-violet-800"
              : "text-gray-400 hover:text-violet-600"
          }
          ${loading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Summarizing…</span>
          </>
        ) : hasSummary && open ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            <span>Hide Summary</span>
          </>
        ) : (
          <>
            <Wand2 className="h-3.5 w-3.5" />
            <span>Simplify</span>
          </>
        )}
      </button>

      {/* Inline summary panel */}
      {hasSummary && open && (
        <div
          className="mt-2 rounded-xl border border-violet-200 bg-violet-50
                     px-4 py-3 text-xs text-gray-700 leading-relaxed shadow-sm
                     animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Header */}
          <p className="flex items-center gap-1.5 font-semibold text-violet-700 mb-2">
            <Wand2 className="h-3.5 w-3.5" />
            Plain-English Summary
          </p>

          {/* Parse the two sections out of the AI response */}
          <SummaryBody text={summaryCache[message.id]} />
        </div>
      )}
    </div>
  );
}

// ── Helper: renders the summary text with section highlighting ────────────────
//
//  The AI is prompted to reply with two clearly labelled sections:
//    ## Simple Summary
//    …
//    ## Real-World Example
//    …
//  We split on those headings and render them with distinct styles.

function SummaryBody({ text }: { text: string }) {
  // Split on markdown-style headings the AI returns
  const summaryMatch = text.match(/##\s*Simple Summary\s*([\s\S]*?)(?=##|$)/i);
  const exampleMatch = text.match(
    /##\s*Real.World Example\s*([\s\S]*?)(?=##|$)/i,
  );

  const summaryText = summaryMatch ? summaryMatch[1].trim() : null;
  const exampleText = exampleMatch ? exampleMatch[1].trim() : null;

  // Fallback: if AI didn't use headings, show raw text
  if (!summaryText && !exampleText) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div className="space-y-3">
      {summaryText && (
        <div>
          <p className="font-medium text-violet-600 mb-0.5 text-[11px] uppercase tracking-wide">
            📝 Summary
          </p>
          <p className="whitespace-pre-wrap text-gray-700">{summaryText}</p>
        </div>
      )}
      {exampleText && (
        <div className="border-t border-violet-200 pt-2">
          <p className="font-medium text-amber-600 mb-0.5 text-[11px] uppercase tracking-wide">
            🌍 Real-World Example
          </p>
          <p className="whitespace-pre-wrap text-gray-700">{exampleText}</p>
        </div>
      )}
    </div>
  );
}

// ── GPT Summarizer ──────────────────────────────────────────────────────────

async function fetchSummaryFromAI(legalText: string): Promise<string> {
  const openai = new OpenAI({
  apiKey: GPT_API_KEY, // Replace with your actual key
  dangerouslyAllowBrowser: true
});
  const systemPrompt = `You are a plain-language legal explainer. 
When given a legal AI response, you do two things:
1. Rewrite the core point in very simple, everyday language (2-4 sentences max).
2. Give ONE concrete real-world example that a non-lawyer would immediately understand.

Always structure your reply EXACTLY like this (keep the headings):

## Simple Summary
<your simple explanation here>

## Real-World Example
<your example here>

Do not add any other text, disclaimers, or headings.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini", // gpt-5 is not a valid public model (yet)
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: legalText },
      ],
    });

    return (
      response.choices?.[0]?.message?.content ??
      "Could not generate summary."
    );
  } catch (error: any) {
    console.error("OpenAI Error:", error);
    throw new Error(error?.message || "AI request failed");
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

interface AiChatInterfaceProps {
  onConnectWithLawyer?: () => void;
  onRoleSwitch?: () => void;
}

export function AiChatInterface({
  onConnectWithLawyer,
  onRoleSwitch,
}: AiChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Bookmark state ──────────────────────────────────────────────────────────
  const [bookmarkedHashes, setBookmarkedHashes] = useState<Set<string>>(
    new Set(),
  );
  const [bookmarkIdByHash, setBookmarkIdByHash] = useState<
    Record<string, string>
  >({});

  // ── Summary cache: messageId → generated summary text ──────────────────────
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});

  const { user } = useAuth();

  // ── Load existing bookmarks on mount ────────────────────────────────────────
  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const res = await authFetch(`${BACKEND_API_URL}/api/bookmarks`);
        if (!res.ok) return;
        const data: Array<{ _id: string; content_hash: string }> =
          await res.json();
        setBookmarkedHashes(new Set(data.map((b) => b.content_hash)));
        setBookmarkIdByHash(
          Object.fromEntries(data.map((b) => [b.content_hash, b._id])),
        );
      } catch {
        /* silently ignore – non-critical */
      }
    };
    loadBookmarks();
  }, []);

  useEffect(() => {
    const close = () => setActiveMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    loadConversations();
  }, []);

  // ── Bookmark toggle ──────────────────────────────────────────────────────────

  const handleBookmarkToggle = useCallback(
    async (
      message: Message,
      hash: string,
      isCurrentlyBookmarked: boolean,
      bookmarkId?: string,
    ) => {
      if (isCurrentlyBookmarked && bookmarkId) {
        try {
          await authFetch(`${BACKEND_API_URL}/api/bookmarks/${bookmarkId}`, {
            method: "DELETE",
          });
          setBookmarkedHashes((prev) => {
            const next = new Set(prev);
            next.delete(hash);
            return next;
          });
          setBookmarkIdByHash((prev) => {
            const next = { ...prev };
            delete next[hash];
            return next;
          });
        } catch (err) {
          console.error("Failed to remove bookmark", err);
        }
      } else {
        try {
          const res = await authFetch(`${BACKEND_API_URL}/api/bookmarks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: message.content,
              law_sources: message.law_sources ?? [],
              case_sources: message.case_sources ?? [],
              conversation_id: conversationId,
            }),
          });
          if (!res.ok) throw new Error("Server error");
          const saved = await res.json();
          setBookmarkedHashes((prev) => new Set(prev).add(hash));
          setBookmarkIdByHash((prev) => ({
            ...prev,
            [hash]: saved._id,
          }));
        } catch (err) {
          console.error("Failed to save bookmark", err);
        }
      }
    },
    [conversationId],
  );

  // ── Summarize handler ─────────────────────────────────────────────────────
  //
  //  Called by <SummarizeButton> when no cached summary exists yet.
  //  Fetches from Anthropic API and stores result in summaryCache.

  const handleSummarizePrompt = useCallback(
    async (message: Message) => {
      // Guard: already cached (shouldn't reach here, but just in case)
      if (summaryCache[message.id]) return;

      try {
        const summary = await fetchSummaryFromAI(message.content);
        setSummaryCache((prev) => ({ ...prev, [message.id]: summary }));
      } catch (err: any) {
        console.error("Summarize error:", err);
        toast.error(
          err?.message?.includes("401")
            ? "Invalid Anthropic API key. Check VITE_ANTHROPIC_API_KEY."
            : "Failed to generate summary. Please try again.",
        );
        // Store an error placeholder so the button doesn't spin forever
        setSummaryCache((prev) => ({
          ...prev,
          [message.id]:
            "## Simple Summary\nCould not generate summary.\n\n## Real-World Example\nPlease try again.",
        }));
      }
    },
    [summaryCache],
  );

  // ── Send message ────────────────────────────────────────────────────────────

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || inputValue;
    if (!text.trim()) return toast.error("Please enter a search query");

    const currentConversationId = await ensureConversation();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    const history = messages
      .filter((m) => m.id !== "1")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await authFetch(`${BACKEND_API_URL}/api/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          conversation_id: currentConversationId,
          history,
          user_role: user?.role,
        }),
      });

      const data = await res.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        law_sources: data.law_sources || [],
        case_sources: data.case_sources || [],
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

  // ── Conversation helpers ─────────────────────────────────────────────────────

  const ensureConversation = async (): Promise<string> => {
    if (conversationId) return conversationId;
    if (isTyping) return conversationId!;

    const res = await authFetch(`${BACKEND_API_URL}/api/rag/conversation`, {
      method: "POST",
    });
    const data = await res.json();
    setConversationId(data.conversation_id);
    loadConversations();
    return data.conversation_id;
  };

  const loadConversations = async () => {
    const res = await authFetch(`${BACKEND_API_URL}/api/rag/conversations`);
    const data = await res.json();
    setConversations(data);
  };

  const createNewChat = async () => {
    setConversationId(null);
    setMessages([...initialMessages]);
    loadConversations();
  };

  const loadMessages = async (id: string) => {
    const res = await authFetch(`${BACKEND_API_URL}/api/rag/messages/${id}`);
    const data = await res.json();
    const formatted = data.map((m: any) => ({
      id: Math.random().toString(),
      role: m.role,
      content: m.content,
      law_sources: m.law_sources || [],
      case_sources: m.case_sources || [],
    }));
    setConversationId(id);
    setMessages(formatted);
  };

  const deleteConversation = async (id: string) => {
    await authFetch(`${BACKEND_API_URL}/api/rag/conversation/${id}`, {
      method: "DELETE",
    });
    await loadConversations();
    if (conversationId === id) createNewChat();
  };

  const renameConversation = async (id: string) => {
    if (!newTitle.trim()) return;
    await authFetch(`${BACKEND_API_URL}/api/rag/conversation/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    setEditingChatId(null);
    setNewTitle("");
    await loadConversations();
  };

  const displayedMessages = messages.length > 0 ? messages : initialMessages;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="grid lg:grid-cols-1 gap-6">
      <div className="col-span-1">
        <Card className="h-[calc(100vh-7rem)] overflow-hidden">
          <div className="flex h-full">
            {/* ── LEFT: Conversations Sidebar ────────────────────────────── */}
            <div className="hidden md:flex md:w-56 lg:w-64 border-r bg-[#F8FAFC] flex-col h-full">
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
                      className={`group flex items-center gap-2 px-3 py-2 mb-2 rounded-full
                                  cursor-pointer text-sm
                                  ${
                                    conversationId === chat._id
                                      ? "bg-[#1E3A8A] text-white"
                                      : "hover:bg-gray-200"
                                  }`}
                    >
                      <div className="relative flex items-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(
                              activeMenu === chat._id ? null : chat._id,
                            );
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity
                                     p-1 rounded hover:bg-gray-300"
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

                      <div className="flex-1 truncate">
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

            {/* ── RIGHT: Chat Area ───────────────────────────────────────── */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Header */}
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
                  </div>
                  <Badge className="bg-white/20 text-white border-white/30">
                    {user?.role} View
                  </Badge>
                </div>
              </CardHeader>

              {/* Messages */}
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
                          {/* Bubble */}
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

                          {/* References + action buttons (assistant only) */}
                          {message.role === "assistant" && (
                            <>
                              <LawReferences
                                sources={message.law_sources ?? []}
                              />
                              <CaseReferences
                                sources={message.case_sources ?? []}
                              />

                              {/* Bookmark + Summarize – hidden for the static greeting */}
                              {message.id !== "1" && (
                                <div className="flex items-start gap-2 flex-wrap">
                                  <BookmarkButton
                                    message={message}
                                    conversationId={conversationId}
                                    bookmarkedHashes={bookmarkedHashes}
                                    bookmarkIdByHash={bookmarkIdByHash}
                                    onToggle={handleBookmarkToggle}
                                  />
                                  {user?.role !== "lawyer" && (
                                    <SummarizeButton
                                      message={message}
                                      summaryCache={summaryCache}
                                      onSummarize={handleSummarizePrompt}
                                    />
                                  )}
                                </div>
                              )}
                            </>
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

                {/* Input */}
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

              {/* Mobile sidebar overlay */}
              {sidebarOpen && (
                <div className="fixed inset-0 z-50 flex">
                  <div
                    className="absolute inset-0 bg-black/50"
                    onClick={() => setSidebarOpen(false)}
                  />
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

      {/* ── Bottom cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
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
                className="w-full justify-start text-left h-auto py-3
                           hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
                onClick={() => handleSendMessage(question)}
              >
                <MessageCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="text-sm text-wrap">{question}</span>
              </Button>
            ))}
          </CardContent>
        </Card>

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
                <span>See relevant law sections (PPC / CrPC)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#1E3A8A]">•</span>
                <span>See real case precedents with outcomes</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#1E3A8A]">•</span>
                <span>Save important responses with the bookmark button</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#1E3A8A]">•</span>
                {/* Updated to mention the new feature */}
                <span>
                  Hit <strong>Simplify</strong> to get a plain-English summary +
                  real-world example
                </span>
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
