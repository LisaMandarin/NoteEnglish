import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

// 從 Supabase session 取得 JWT access token，未登入時拋出錯誤
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

// 帶上 Bearer token 發送 API 請求，自動處理錯誤與 204 無內容回應
export async function apiFetch(path: string, options: RequestInit = {}) {
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

// 確保使用者 profile 存在，首次登入時以 displayName 建立
export async function ensureProfile(displayName) {
  return apiFetch("/api/profile/ensure", {
    method: "POST",
    body: JSON.stringify({ display_name: displayName }),
  });
}

// 取得目前使用者的所有學習 session 列表
export async function listSessions() {
  return apiFetch("/api/sessions");
}

// 取得單一 session 的詳細內容（文章與句子翻譯）
export async function getSessionDetail(sessionId) {
  return apiFetch(`/api/sessions/${sessionId}`);
}

// 更新指定 session 的標題
export async function updateSessionTitle(sessionId, title) {
  return apiFetch(`/api/sessions/${sessionId}/title`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

// 刪除指定 session 及其所有相關資料
export async function deleteSession(sessionId) {
  return apiFetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
}

// 儲存或更新 session（傳入 sessionId 則更新，否則建立新的）
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
