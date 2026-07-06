import { supabase } from "./supabase";
import type {
  ParseResult,
  Sentence,
  SentenceType,
  SessionPage,
  StructureNode,
  TokenUsageData,
} from "../types";

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

export const SESSION_EXPIRED_MESSAGE = "驗證已過期，請重新登入。";

async function throwForResponse(response: Response): Promise<never> {
  const text = await response.text();

  if (response.status === 401) {
    let detail: unknown;
    try {
      detail = JSON.parse(text)?.detail;
    } catch {
      detail = undefined;
    }

    if (detail === "session_expired") {
      await supabase.auth.signOut({ scope: "local" });
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
  }

  throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ""}`);
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
    return throwForResponse(response);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function fetchTtsAudio(text: string): Promise<Blob> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    return throwForResponse(response);
  }

  return response.blob();
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

export async function ocrImage(imageBase64: string, mimeType: string): Promise<{ text: string }> {
  return apiFetch("/api/ocr", {
    method: "POST",
    body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType }),
  }) as Promise<{ text: string }>;
}

export async function getTokenUsage(): Promise<TokenUsageData> {
  return apiFetch("/api/usage") as Promise<TokenUsageData>;
}

export async function parseSentence(sentence: string): Promise<ParseResult> {
  const res = (await apiFetch("/api/parse", {
    method: "POST",
    body: JSON.stringify({ sentence }),
  })) as { structure: StructureNode | null; sentence_type?: SentenceType | null };
  return { structure: res.structure ?? null, sentence_type: res.sentence_type ?? null };
}

export async function getAdminUserTokenUsage(userId: string): Promise<TokenUsageData> {
  return apiFetch(`/api/admin/users/${userId}/usage`) as Promise<TokenUsageData>;
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

export async function submitIssueReport({ title, severity, description }: {
  title?: string;
  severity?: string;
  description: string;
}): Promise<{ ok: boolean }> {
  return apiFetch("/api/issue-report", {
    method: "POST",
    body: JSON.stringify({
      title: title || null,
      severity: severity || null,
      description,
    }),
  }) as Promise<{ ok: boolean }>;
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
