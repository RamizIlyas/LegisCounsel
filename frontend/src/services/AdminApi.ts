// AdminApi.ts
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function getToken() {
  return localStorage.getItem("token") || "";
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

async function apiFormData(path: string, method: string, body: FormData) {
  // Don't set Content-Type – browser sets it with boundary for multipart
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: authHeaders(),
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export const adminApi = {
  // Users
  getUsers: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/admin/users?${q}`);
  },
  getUser: (id: string) => apiFetch(`/admin/users/${id}`),
  createUser: (body: object) =>
    apiFetch("/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateUser: (id: string, body: object) =>
    apiFetch(`/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  deleteUser: (id: string) =>
    apiFetch(`/admin/users/${id}`, { method: "DELETE" }),

  // Laws
  getLaws: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/admin/laws?${q}`);
  },
  getLaw: (id: string) => apiFetch(`/admin/laws/${id}`),
  createLaw: (formData: FormData) =>
    apiFormData("/admin/laws", "POST", formData),
  updateLaw: (id: string, formData: FormData) =>
    apiFormData(`/admin/laws/${id}`, "PUT", formData),
  deleteLaw: (id: string) =>
    apiFetch(`/admin/laws/${id}`, { method: "DELETE" }),

  // Cases
  getCases: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/admin/cases?${q}`);
  },
  getCase: (id: string) => apiFetch(`/admin/cases/${id}`),
  createCase: (formData: FormData) =>
    apiFormData("/admin/cases", "POST", formData),
  updateCase: (id: string, formData: FormData) =>
    apiFormData(`/admin/cases/${id}`, "PUT", formData),
  deleteCase: (id: string) =>
    apiFetch(`/admin/cases/${id}`, { method: "DELETE" }),

  //stats
  getStats: () => apiFetch("/admin/stats"),
};
