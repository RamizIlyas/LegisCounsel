// src/services/communicationService.ts
// Drop-in API layer for the Communication component.
// All functions read the JWT from localStorage (key: "token").

const BASE = "http://localhost:5000/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ─── Conversations ────────────────────────────────────────────────────────────

/** Fetch all conversations the current user is part of */
export async function getConversations() {
  const res = await fetch(`${BASE}/conversations`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Start (or retrieve) a conversation with another user by their email.
 * Returns the Conversation object.
 */
export async function startConversation(email: string) {
  const res = await fetch(`${BASE}/conversations/start`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/** Fetch all messages in a conversation (also marks them as read) */
export async function getMessages(conversationId: string) {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Send a text message (with optional attachment metadata) */
export async function sendMessage(
  conversationId: string,
  content: string,
  attachment?: { name: string; url: string; type: string }
) {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ content, attachment }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}