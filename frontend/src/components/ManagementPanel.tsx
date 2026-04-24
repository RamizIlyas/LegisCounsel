// ManagementPanel.tsx
import { DashboardLayout } from "./DashboardLayout";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "./ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "./ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Users, Database, CheckCircle2, XCircle, Clock, Search,
  Plus, Pencil, Trash2, Upload, ChevronLeft, ChevronRight,
  FileText, Loader2,
} from "lucide-react";
import type { Page } from "../App";
import { useState, useEffect, useCallback, useRef } from "react";
import { adminApi } from "../services/AdminApi";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserDoc {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt?: string;
  mobile?: string;
  location?: string;
  firm?: string;
  status?: string;
}

interface LawDoc {
  _id: string;
  title: string;
  category?: string;
  jurisdiction?: string;
  year?: string;
  section_count?: number;
  pdf_path?: string;
  updated_at?: string;
}

interface CaseDoc {
  _id: string;
  case_name: string;
  court?: string;
  citation?: string;
  outcome?: string;
  law_code?: string;
  category?: string;
  decision_date?: string;
  pdf_path?: string;
  updated_at?: string;
}

interface ManagementProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  if (status === "active")
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Active
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
        <Clock className="h-3 w-3 mr-1" /> Pending
      </Badge>
    );
  return (
    <Badge className="bg-gray-100 text-gray-800 border-gray-200">
      <XCircle className="h-3 w-3 mr-1" /> Inactive
    </Badge>
  );
}

function Pagination({
  page, pages, onPrev, onNext,
}: { page: number; pages: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 mt-3">
      <span className="text-sm text-gray-500">
        Page {page} of {pages}
      </span>
      <Button variant="outline" size="sm" onClick={onPrev} disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={onNext} disabled={page >= pages}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function PdfBadge({ path }: { path?: string }) {
  if (!path) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <a
      href={`http://localhost:5000${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
    >
      <FileText className="h-3 w-3" /> PDF
    </a>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  USER MODAL
// ═════════════════════════════════════════════════════════════════════════════

interface UserModalProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: Partial<UserDoc>;
  onClose: () => void;
  onSaved: () => void;
}

function UserModal({ open, mode, initial, onClose, onSaved }: UserModalProps) {
  const [form, setForm] = useState({ name: "", email: "", role: "client", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name || "",
        email: initial?.email || "",
        role: initial?.role || "client",
        password: "",
      });
      setError("");
    }
  }, [open, initial]);

  const handle = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setLoading(true);
    setError("");
    try {
      if (mode === "create") await adminApi.createUser(form);
      else await adminApi.updateUser(initial!._id!, form);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add New User" : "Edit User"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div>
            <label className="text-sm font-medium text-gray-700">Name</label>
            <Input placeholder="Full name" value={form.name} onChange={handle("name")} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <Input type="email" placeholder="email@example.com" value={form.email} onChange={handle("email")} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Role</label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="lawyer">Lawyer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">
              {mode === "edit" ? "New Password (leave blank to keep)" : "Password"}
            </label>
            <Input type="password" placeholder="••••••••" value={form.password} onChange={handle("password")} className="mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90" onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "create" ? "Create User" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  LAW MODAL
// ═════════════════════════════════════════════════════════════════════════════

interface LawModalProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: Partial<LawDoc>;
  onClose: () => void;
  onSaved: () => void;
}

function LawModal({ open, mode, initial, onClose, onSaved }: LawModalProps) {
  const [form, setForm] = useState({
    title: "", category: "", jurisdiction: "", year: "",
    act_number: "", preamble: "", enacting_authority: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm({
        title: initial?.title || "",
        category: initial?.category || "",
        jurisdiction: (initial as any)?.jurisdiction || "",
        year: (initial as any)?.year || "",
        act_number: (initial as any)?.act_number || "",
        preamble: (initial as any)?.preamble || "",
        enacting_authority: (initial as any)?.enacting_authority || "",
      });
      setFile(null);
      setError("");
    }
  }, [open, initial]);

  const handle = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("pdf", file);

      if (mode === "create") await adminApi.createLaw(fd);
      else await adminApi.updateLaw(initial!._id!, fd);

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add New Law" : "Edit Law"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && <p className="text-sm text-red-500">{error}</p>}

          <div>
            <label className="text-sm font-medium text-gray-700">Title *</label>
            <Input placeholder="e.g. Contract Act 1872" value={form.title} onChange={handle("title")} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Category</label>
              <Input placeholder="Civil Law" value={form.category} onChange={handle("category")} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Year</label>
              <Input placeholder="1872" value={form.year} onChange={handle("year")} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Jurisdiction</label>
              <Input placeholder="Pakistan" value={form.jurisdiction} onChange={handle("jurisdiction")} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Act Number</label>
              <Input placeholder="II" value={form.act_number} onChange={handle("act_number")} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Enacting Authority</label>
            <Input placeholder="National Assembly" value={form.enacting_authority} onChange={handle("enacting_authority")} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Preamble</label>
            <textarea
              placeholder="Brief description of the law..."
              value={form.preamble}
              onChange={handle("preamble")}
              rows={3}
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* PDF Upload */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              PDF File {mode === "edit" && initial?.pdf_path && "(uploading replaces existing)"}
            </label>
            <div
              className="mt-1 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-[#D4AF37] transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <p className="text-sm text-gray-700">{file.name}</p>
              ) : (
                <>
                  <Upload className="h-6 w-6 mx-auto text-gray-400 mb-1" />
                  <p className="text-sm text-gray-500">Click to upload PDF</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white" onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "create" ? "Add Law" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  CASE MODAL
// ═════════════════════════════════════════════════════════════════════════════

interface CaseModalProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: Partial<CaseDoc>;
  onClose: () => void;
  onSaved: () => void;
}

function CaseModal({ open, mode, initial, onClose, onSaved }: CaseModalProps) {
  const [form, setForm] = useState({
    case_name: "", court: "", citation: "", outcome: "",
    law_code: "", category: "", decision_date: "",
    appellant: "", respondent: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm({
        case_name: initial?.case_name || "",
        court: initial?.court || "",
        citation: initial?.citation || "",
        outcome: initial?.outcome || "",
        law_code: initial?.law_code || "",
        category: initial?.category || "",
        decision_date: initial?.decision_date || "",
        appellant: (initial as any)?.appellant || "",
        respondent: (initial as any)?.respondent || "",
      });
      setFile(null);
      setError("");
    }
  }, [open, initial]);

  const handle = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("pdf", file);

      if (mode === "create") await adminApi.createCase(fd);
      else await adminApi.updateCase(initial!._id!, fd);

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add New Case" : "Edit Case"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && <p className="text-sm text-red-500">{error}</p>}

          <div>
            <label className="text-sm font-medium text-gray-700">Case Name *</label>
            <Input placeholder="State vs. Defendant" value={form.case_name} onChange={handle("case_name")} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Court</label>
              <Input placeholder="Supreme Court" value={form.court} onChange={handle("court")} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Decision Date</label>
              <Input type="date" value={form.decision_date} onChange={handle("decision_date")} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Appellant</label>
              <Input placeholder="State" value={form.appellant} onChange={handle("appellant")} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Respondent</label>
              <Input placeholder="Petitioner" value={form.respondent} onChange={handle("respondent")} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Law Code</label>
              <Input placeholder="PPC" value={form.law_code} onChange={handle("law_code")} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Category</label>
              <Input placeholder="Criminal" value={form.category} onChange={handle("category")} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Citation</label>
              <Input placeholder="2011 SCMR 123" value={form.citation} onChange={handle("citation")} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Outcome</label>
              <Input placeholder="Appeal Allowed" value={form.outcome} onChange={handle("outcome")} className="mt-1" />
            </div>
          </div>

          {/* PDF Upload */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              PDF File {mode === "edit" && initial?.pdf_path && "(uploading replaces existing)"}
            </label>
            <div
              className="mt-1 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-[#D4AF37] transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <p className="text-sm text-gray-700">{file.name}</p>
              ) : (
                <>
                  <Upload className="h-6 w-6 mx-auto text-gray-400 mb-1" />
                  <p className="text-sm text-gray-500">Click to upload PDF</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white" onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "create" ? "Add Case" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE CONFIRM DIALOG
// ═════════════════════════════════════════════════════════════════════════════

interface DeleteDialogProps {
  open: boolean;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

function DeleteDialog({ open, label, onCancel, onConfirm, loading }: DeleteDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The record and any associated PDF will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export function ManagementPanel({ onNavigate, onLogout }: ManagementProps) {
  // ── Users state ────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userPages, setUserPages] = useState(1);
  const [userLoading, setUserLoading] = useState(false);

  const [userModal, setUserModal] = useState<{ open: boolean; mode: "create" | "edit"; data?: UserDoc }>({
    open: false, mode: "create",
  });
  const [deleteUser, setDeleteUser] = useState<{ open: boolean; id?: string; loading: boolean }>({
    open: false, loading: false,
  });

  // ── Laws state ─────────────────────────────────────────────────────────────
  const [laws, setLaws] = useState<LawDoc[]>([]);
  const [lawSearch, setLawSearch] = useState("");
  const [lawPage, setLawPage] = useState(1);
  const [lawPages, setLawPages] = useState(1);
  const [lawLoading, setLawLoading] = useState(false);

  const [lawModal, setLawModal] = useState<{ open: boolean; mode: "create" | "edit"; data?: LawDoc }>({
    open: false, mode: "create",
  });
  const [deleteLaw, setDeleteLaw] = useState<{ open: boolean; id?: string; loading: boolean }>({
    open: false, loading: false,
  });

  // ── Cases state ────────────────────────────────────────────────────────────
  const [cases, setCases] = useState<CaseDoc[]>([]);
  const [caseSearch, setCaseSearch] = useState("");
  const [casePage, setCasePage] = useState(1);
  const [casePages, setCasePages] = useState(1);
  const [caseLoading, setCaseLoading] = useState(false);

  const [caseModal, setCaseModal] = useState<{ open: boolean; mode: "create" | "edit"; data?: CaseDoc }>({
    open: false, mode: "create",
  });
  const [deleteCase, setDeleteCase] = useState<{ open: boolean; id?: string; loading: boolean }>({
    open: false, loading: false,
  });

  // ── Fetch functions ────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setUserLoading(true);
    try {
      const data = await adminApi.getUsers({ search: userSearch, page: String(userPage) });
      setUsers(data.users);
      setUserPages(data.pages || 1);
    } catch { /* silently ignore */ }
    finally { setUserLoading(false); }
  }, [userSearch, userPage]);

  const fetchLaws = useCallback(async () => {
    setLawLoading(true);
    try {
      const data = await adminApi.getLaws({ search: lawSearch, page: String(lawPage) });
      setLaws(data.laws);
      setLawPages(data.pages || 1);
    } catch { }
    finally { setLawLoading(false); }
  }, [lawSearch, lawPage]);

  const fetchCases = useCallback(async () => {
    setCaseLoading(true);
    try {
      const data = await adminApi.getCases({ search: caseSearch, page: String(casePage) });
      setCases(data.cases);
      setCasePages(data.pages || 1);
    } catch { }
    finally { setCaseLoading(false); }
  }, [caseSearch, casePage]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchLaws(); }, [fetchLaws]);
  useEffect(() => { fetchCases(); }, [fetchCases]);

  // Reset page on search
  useEffect(() => { setUserPage(1); }, [userSearch]);
  useEffect(() => { setLawPage(1); }, [lawSearch]);
  useEffect(() => { setCasePage(1); }, [caseSearch]);

  // ── Delete handlers ────────────────────────────────────────────────────────

  async function confirmDeleteUser() {
    setDeleteUser((d) => ({ ...d, loading: true }));
    try {
      await adminApi.deleteUser(deleteUser.id!);
      setDeleteUser({ open: false, loading: false });
      fetchUsers();
    } catch { setDeleteUser((d) => ({ ...d, loading: false })); }
  }

  async function confirmDeleteLaw() {
    setDeleteLaw((d) => ({ ...d, loading: true }));
    try {
      await adminApi.deleteLaw(deleteLaw.id!);
      setDeleteLaw({ open: false, loading: false });
      fetchLaws();
    } catch { setDeleteLaw((d) => ({ ...d, loading: false })); }
  }

  async function confirmDeleteCase() {
    setDeleteCase((d) => ({ ...d, loading: true }));
    try {
      await adminApi.deleteCase(deleteCase.id!);
      setDeleteCase({ open: false, loading: false });
      fetchCases();
    } catch { setDeleteCase((d) => ({ ...d, loading: false })); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout
      userRole="admin"
      currentPage="management"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <div className="space-y-6">

        {/* ═══ USER MANAGEMENT ══════════════════════════════════════════════ */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-[#1E293B]">User Management</CardTitle>
                <CardDescription>Manage registered users</CardDescription>
              </div>
              <Button
                className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90"
                onClick={() => setUserModal({ open: true, mode: "create" })}
              >
                <Plus className="mr-2 h-4 w-4" /> Add User
              </Button>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search users by name or email..."
                className="pl-10"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
          </CardHeader>

          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Firm</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((u,index) => (
                      <TableRow key={u._id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-gray-600">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{u.role}</Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">{u.mobile || "—"}</TableCell>
                        <TableCell className="text-gray-600">{u.location || "—"}</TableCell>
                        <TableCell className="text-gray-600">{u.firm || "—"}</TableCell>
                        <TableCell>
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setUserModal({ open: true, mode: "edit", data: u })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteUser({ open: true, id: u._id, loading: false })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <Pagination page={userPage} pages={userPages}
              onPrev={() => setUserPage((p) => p - 1)} onNext={() => setUserPage((p) => p + 1)} />
          </CardContent>
        </Card>

        {/* ═══ LAWS MANAGEMENT ══════════════════════════════════════════════ */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-[#1E293B]">Laws Management</CardTitle>
                <CardDescription>Manage uploaded laws and legislation</CardDescription>
              </div>
              <Button
                className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white"
                onClick={() => setLawModal({ open: true, mode: "create" })}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Law
              </Button>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search laws by title, year, jurisdiction..."
                className="pl-10"
                value={lawSearch}
                onChange={(e) => setLawSearch(e.target.value)}
              />
            </div>
          </CardHeader>

          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Sections</TableHead>
                    <TableHead>PDF</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lawLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                      </TableCell>
                    </TableRow>
                  ) : laws.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No laws found
                      </TableCell>
                    </TableRow>
                  ) : (
                    laws.map((l,index) => (
                      <TableRow key={l._id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{l.title}</TableCell>
                        <TableCell className="text-gray-600">{l.category || "—"}</TableCell>
                        <TableCell>{l.year || "—"}</TableCell>
                        <TableCell>{l.section_count ?? "—"}</TableCell>
                        <TableCell><PdfBadge path={l.pdf_path} /></TableCell>
                        <TableCell>
                          {l.updated_at ? new Date(l.updated_at).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setLawModal({ open: true, mode: "edit", data: l })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteLaw({ open: true, id: l._id, loading: false })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <Pagination page={lawPage} pages={lawPages}
              onPrev={() => setLawPage((p) => p - 1)} onNext={() => setLawPage((p) => p + 1)} />
          </CardContent>
        </Card>

        {/* ═══ CASES MANAGEMENT ═════════════════════════════════════════════ */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-[#1E293B]">Cases Management</CardTitle>
                <CardDescription>Manage uploaded judgements and case files</CardDescription>
              </div>
              <Button
                className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white"
                onClick={() => setCaseModal({ open: true, mode: "create" })}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Case
              </Button>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search cases by name, court, citation..."
                className="pl-10"
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
              />
            </div>
          </CardHeader>

          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No.</TableHead>
                    <TableHead>Case Name</TableHead>
                    <TableHead>Court</TableHead>
                    <TableHead>Law Code</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>PDF</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {caseLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                      </TableCell>
                    </TableRow>
                  ) : cases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No cases found
                      </TableCell>
                    </TableRow>
                  ) : (
                    cases.map((c, index) => (
                      <TableRow key={c._id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium max-w-[11rem] truncate">{c.case_name}</TableCell>
                        <TableCell className="text-gray-600 max-w-[15rem] overflow-x-auto">{c.court || "—"}</TableCell>
                        <TableCell>{c.law_code || "—"}</TableCell>
                        <TableCell>
                          {c.outcome ? (
                            <Badge
                              className={
                                c.outcome.toLowerCase().includes("allow")
                                  ? "bg-green-100 text-green-800 border-green-200"
                                  : c.outcome.toLowerCase().includes("dismiss")
                                  ? "bg-red-100 text-red-800 border-red-200"
                                  : "bg-gray-100 text-gray-800 border-gray-200"
                              }
                            >
                              {c.outcome}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell><PdfBadge path={c.pdf_path} /></TableCell>
                        <TableCell>
                          {c.decision_date
                            ? new Date(c.decision_date).toLocaleDateString()
                            : c.updated_at
                            ? new Date(c.updated_at).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setCaseModal({ open: true, mode: "edit", data: c })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteCase({ open: true, id: c._id, loading: false })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <Pagination page={casePage} pages={casePages}
              onPrev={() => setCasePage((p) => p - 1)} onNext={() => setCasePage((p) => p + 1)} />
          </CardContent>
        </Card>
      </div>

      {/* ─── Modals ─────────────────────────────────────────────────────── */}

      <UserModal
        open={userModal.open}
        mode={userModal.mode}
        initial={userModal.data}
        onClose={() => setUserModal((m) => ({ ...m, open: false }))}
        onSaved={fetchUsers}
      />

      <LawModal
        open={lawModal.open}
        mode={lawModal.mode}
        initial={lawModal.data}
        onClose={() => setLawModal((m) => ({ ...m, open: false }))}
        onSaved={fetchLaws}
      />

      <CaseModal
        open={caseModal.open}
        mode={caseModal.mode}
        initial={caseModal.data}
        onClose={() => setCaseModal((m) => ({ ...m, open: false }))}
        onSaved={fetchCases}
      />

      <DeleteDialog
        open={deleteUser.open}
        label="User"
        loading={deleteUser.loading}
        onCancel={() => setDeleteUser({ open: false, loading: false })}
        onConfirm={confirmDeleteUser}
      />

      <DeleteDialog
        open={deleteLaw.open}
        label="Law"
        loading={deleteLaw.loading}
        onCancel={() => setDeleteLaw({ open: false, loading: false })}
        onConfirm={confirmDeleteLaw}
      />

      <DeleteDialog
        open={deleteCase.open}
        label="Case"
        loading={deleteLaw.loading}
        onCancel={() => setDeleteCase({ open: false, loading: false })}
        onConfirm={confirmDeleteCase}
      />
    </DashboardLayout>
  );
}