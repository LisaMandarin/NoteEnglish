import { supabase } from "./supabase";
import type { Sentence, SessionPage, TokenUsageData } from "../types";

type ApiSessionShape = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type SaveSessionResponse = {
  saved_at: string;
  session: ApiSessionShape | null;
};

export type SessionDetailResponse = {
  text: string;
  sentences: Sentence[];
  session: ApiSessionShape | null;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  if (!token) {
    throw new Error("Not authenticated.");
  }

  return token;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
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
    throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ""}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function ensureProfile(displayName: string): Promise<unknown> {
  return apiFetch("/api/profile/ensure", {
    method: "POST",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export async function listSessions(limit = 5, offset = 0): Promise<SessionPage> {
  return apiFetch(`/api/sessions?limit=${limit}&offset=${offset}`) as Promise<SessionPage>;
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetailResponse> {
  return apiFetch(`/api/sessions/${sessionId}`) as Promise<SessionDetailResponse>;
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<{ updated_at: string } | null> {
  return apiFetch(`/api/sessions/${sessionId}/title`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  }) as Promise<{ updated_at: string } | null>;
}

export async function deleteSession(sessionId: string): Promise<unknown> {
  return apiFetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
}

export async function getTokenUsage(): Promise<TokenUsageData> {
  return apiFetch("/api/usage") as Promise<TokenUsageData>;
}

export type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

export async function checkAdminAccess(): Promise<{ ok: boolean; user_id: string }> {
  return apiFetch("/api/admin/check") as Promise<{ ok: boolean; user_id: string }>;
}

export async function listAdminUsers(page = 1, perPage = 50): Promise<AdminUser[]> {
  return apiFetch(`/api/admin/users?page=${page}&per_page=${perPage}`) as Promise<AdminUser[]>;
}

export async function saveSession({ sessionId, text, sentences }: {
  sessionId: string | null;
  text: string;
  sentences: Sentence[];
}): Promise<SaveSessionResponse> {
  return apiFetch("/api/sessions/save", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId ?? null,
      text,
      sentences,
    }),
  }) as Promise<SaveSessionResponse>;
}
