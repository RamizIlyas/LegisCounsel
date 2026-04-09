// src/services/communicationService.ts

const BASE = "http://localhost:5000/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function authHeadersNoContentType(): Record<string, string> {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function getConversations() {
  const res = await fetch(`${BASE}/conversations`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startConversation(email: string) {
  const res = await fetch(`${BASE}/conversations/start`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Soft-delete the conversation for the current user */
export async function deleteConversation(conversationId: string) {
  const res = await fetch(`${BASE}/conversations/${conversationId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Set a custom per-user name for a conversation */
export async function renameConversation(conversationId: string, name: string) {
  const res = await fetch(`${BASE}/conversations/${conversationId}/rename`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(conversationId: string) {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
    headers: authHeaders(),
  });
  // const messages = await res.json();
  // console.log("getMessages response:", messages);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function sendMessage(conversationId: string, content: string) {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Upload a file attachment (and optional caption) as a message.
 * Uses multipart/form-data — do NOT pass Content-Type manually.
 */
export async function sendFile(
  conversationId: string,
  file: File,
  caption?: string
) {
  const form = new FormData();
  form.append("file", file);
  if (caption) form.append("caption", caption);

  const res = await fetch(`${BASE}/conversations/${conversationId}/upload`, {
    method: "POST",
    headers: authHeadersNoContentType(), // browser sets Content-Type with boundary
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}