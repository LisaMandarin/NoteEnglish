import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  if (!token) {
    throw new Error("Not authenticated.");
  }

  return token;
}

async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function ensureProfile(displayName) {
  return apiFetch("/api/profile/ensure", {
    method: "POST",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export async function listSessions() {
  return apiFetch("/api/sessions");
}

export async function getSessionDetail(sessionId) {
  return apiFetch(`/api/sessions/${sessionId}`);
}

export async function saveSession({ sessionId, text, sentences }) {
  return apiFetch("/api/sessions/save", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId ?? null,
      text,
      sentences,
    }),
  });
}
