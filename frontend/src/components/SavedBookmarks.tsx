// SavedBookmarks.tsx
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Gavel,
  Search,
  Trash2,
  StickyNote,
  Check,
} from "lucide-react";
import type { Page } from "../App";
import { DashboardLayout } from "./DashboardLayout";

const BACKEND_API_URL =
  import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LawSource {
  section_number: string;
  section_title: string;
  chapter: string;
}

interface CaseSource {
  citation: string;
  court: string;
  outcome: string;
  sections: string;
}

interface SavedBookmark {
  _id: string;
  content: string;
  law_sources: LawSource[];
  case_sources: CaseSource[];
  conversation_id: string | null;
  content_hash: string;
  note: string;
  createdAt: string;
}
interface SavedBookmarksProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  onRoleSwitch: () => void;
}
// ── Auth fetch ────────────────────────────────────────────────────────────────

const authFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("token");
  return fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
};

// ── Outcome badge colour ──────────────────────────────────────────────────────

function outcomeColor(outcome: string): string {
  const o = outcome.toLowerCase();
  if (o.includes("acquit"))
    return "bg-green-100 text-green-800 border-green-300";
  if (o.includes("bail granted"))
    return "bg-blue-100 text-blue-800 border-blue-300";
  if (o.includes("bail refused"))
    return "bg-red-100 text-red-800 border-red-300";
  if (o.includes("allowed"))
    return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (o.includes("dismissed"))
    return "bg-orange-100 text-orange-800 border-orange-300";
  if (o.includes("convict")) return "bg-red-100 text-red-800 border-red-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}

// ── Bookmark card ─────────────────────────────────────────────────────────────

function BookmarkCard({
  bookmark,
  onDelete,
  onNoteUpdate,
}: {
  bookmark: SavedBookmark;
  onDelete: (id: string) => void;
  onNoteUpdate: (id: string, note: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(bookmark.note || "");
  const [saving, setSaving] = useState(false);

  const saveNote = async () => {
    setSaving(true);
    await onNoteUpdate(bookmark._id, noteValue);
    setSaving(false);
    setEditingNote(false);
  };

  return (
    <Card className="border border-[#1E3A8A]/10 hover:border-[#1E3A8A]/30 transition-colors">
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="h-4 w-4 text-[#D4AF37] flex-shrink-0 mt-0.5" />
            <span className="text-xs text-gray-400">
              {new Date(bookmark.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-red-500"
            onClick={() => onDelete(bookmark._id)}
            title="Remove bookmark"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Message content */}
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed line-clamp-6">
          {bookmark.content}
        </p>

        {/* Law sources */}
        {bookmark.law_sources?.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
              <BookOpen className="h-3 w-3 text-[#1E3A8A]" />
              Law Sections
            </p>
            <div className="flex flex-wrap gap-1.5">
              {bookmark.law_sources.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 border border-[#1E3A8A]/30 bg-[#1E3A8A]/5
                             rounded-md px-2 py-1 text-xs"
                >
                  <span className="font-semibold text-[#1E3A8A]">
                    § {s.section_number}
                  </span>
                  <span className="text-gray-600 truncate max-w-[160px]">
                    {s.section_title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Case sources */}
        {bookmark.case_sources?.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
              <Gavel className="h-3 w-3 text-[#D4AF37]" />
              Case Precedents
            </p>
            <div className="space-y-1">
              {bookmark.case_sources.map((s, i) => (
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
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note section */}
        <div className="border-t pt-2">
          {editingNote ? (
            <div className="flex gap-2 items-start">
              <Input
                className="text-xs h-8"
                placeholder="Add a personal note…"
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveNote()}
                autoFocus
              />
              <Button
                size="icon"
                className="h-8 w-8 bg-[#1E3A8A]"
                onClick={saveNote}
                disabled={saving}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setEditingNote(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#1E3A8A] transition-colors"
            >
              <StickyNote className="h-3.5 w-3.5" />
              {bookmark.note ? (
                <span className="text-gray-600 italic">{bookmark.note}</span>
              ) : (
                <span>Add note…</span>
              )}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

export function SavedBookmarks({
  onNavigate,
  onLogout,
  onRoleSwitch,
}: SavedBookmarksProps) {

  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${BACKEND_API_URL}/api/bookmarks`);
      const data = await res.json();
      setBookmarks(Array.isArray(data) ? data : []);
    } catch {
      setBookmarks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const handleDelete = async (id: string) => {
    await authFetch(`${BACKEND_API_URL}/api/bookmarks/${id}`, {
      method: "DELETE",
    });
    setBookmarks((prev) => prev.filter((b) => b._id !== id));
  };

  const handleNoteUpdate = async (id: string, note: string) => {
    const res = await authFetch(`${BACKEND_API_URL}/api/bookmarks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (res.ok) {
      const updated = await res.json();
      setBookmarks((prev) =>
        prev.map((b) => (b._id === id ? { ...b, note: updated.note } : b)),
      );
    }
  };

  const filtered = bookmarks.filter((b) =>
    search.trim()
      ? b.content.toLowerCase().includes(search.toLowerCase()) ||
        b.note?.toLowerCase().includes(search.toLowerCase()) ||
        b.law_sources?.some(
          (s) =>
            s.section_title?.toLowerCase().includes(search.toLowerCase()) ||
            s.section_number?.includes(search),
        ) ||
        b.case_sources?.some((s) =>
          s.citation?.toLowerCase().includes(search.toLowerCase()),
        )
      : true,
  );

  return (
    <DashboardLayout
      userRole="client"
      currentPage="bookmarks"
      onNavigate={onNavigate}
      onLogout={onLogout}
      onRoleSwitch={onRoleSwitch}
    >
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
              <Bookmark className="h-6 w-6 text-[#D4AF37]" />
              Saved Responses
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              AI responses you've bookmarked for later reference
            </p>
          </div>
          <Badge className="bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/20">
            {bookmarks.length} saved
          </Badge>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search bookmarks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 rounded-lg bg-gray-100 animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Bookmark className="h-12 w-12 text-gray-200 mb-4" />
            <p className="text-gray-500 font-medium">
              {search
                ? "No bookmarks match your search"
                : "No saved responses yet"}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {!search &&
                "Click the bookmark icon on any AI response to save it here."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((b) => (
              <BookmarkCard
                key={b._id}
                bookmark={b}
                onDelete={handleDelete}
                onNoteUpdate={handleNoteUpdate}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
