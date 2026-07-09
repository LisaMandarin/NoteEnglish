# 文章分享功能實作計畫（Share Feature Plan）

> 建立日期：2026-07-07
> 模式：連結分享 + 唯讀檢視 + 收藏（引用）+ 編輯即複製（fork）
> 執行方式：依步驟順序執行，每一步完成並驗證後再進下一步。

---

## 已確認的產品決策

實作前先確認這三點（前次討論的建議預設值）：

1. **活的文件**：收藏存的是引用，老師分享後繼續編輯，學生看到的是最新版。不做快照（snapshot）。
2. **fork 副本歸學生**：學生按「編輯副本」後產生的新 session 完全屬於學生，老師刪除原文不影響已 fork 的副本。「所有權歸 creator」只適用於被收藏的原檔。
3. **取消分享 = 收藏失效**：老師撤銷分享連結（不刪文章）時，已收藏的人也看不到（收藏清單中隱藏）。若老師重新分享，因收藏引用的是 `session_id`，原有收藏會自動恢復可見——這是預期行為。

權限模式：**連結即權限**——任何已註冊登入的使用者拿到連結都能看。班級名單限制留到未來版本。

---

## Step 1：資料庫 migration ✅（檔案已建立 2026-07-09，分支 `share`）

檔案：`supabase/migrations/20260709000001_create_sharing.sql`

實作時與原草稿的差異（皆為配合 repo 慣例）：
- `user_id` 不加 `references auth.users(id)`——比照 quiz 表（`quiz_results`、`word_mastery`）的寫法，只留 `UUID NOT NULL`；真正需要的 cascade 是 `session_id → study_sessions`。
- 加了 `shared_favorites_session_idx`（session_id 索引），供 cascade 刪除與反向查詢用。
- 比照既有 migrations 補了 `ENABLE ROW LEVEL SECURITY`（無 policy = 只有後端 service role 能碰）。

重點：
- `on delete cascade` 讓「老師刪文章 → 所有人的收藏自動消失」在資料庫層自動達成，後端不需寫清理邏輯。
- ⚠️ dev 和 prod 是**同一個 Supabase 專案**，migration 一套用就是正式環境生效，套用前先確認 SQL 無誤。

**待辦**：把 SQL 貼進 Supabase Dashboard SQL editor 執行（本 repo 的 migration 都是手動套用）。
**驗證**：在 Supabase Dashboard SQL editor 確認欄位與表存在；手動刪一筆測試 session，確認 `shared_favorites` 連動刪除。

---

## Step 2：後端 API ✅（完成 2026-07-09，分支 `share`）

實作紀錄：
- 合約已依 WORKFLOW.md contract-first 流程確認：models 在 `backend/app/models/share.py` + `frontend/src/types.ts`（`ShareTokenResponse`、`SharedSessionDetail`、`FavoriteItem`）。
- Service 函式在 `services/supabase.py` 末端「Sharing」區段；routes 在 `routes/share.py`，已註冊進 `main.py`。
- 追加合約：`GET /sessions` 清單項目多了 `share_token` 欄位（null = 未分享），供 sidebar 顯示已分享標記。
- 取消收藏是 `DELETE /favorites/{session_id}`（session_id 是穩定鍵，token 撤銷重發不影響）。
- `GET /shared/{token}` 對格式錯誤、不存在、已撤銷的 token 一律回 404（不洩漏 session 存在與否）。
- 比照既有 routes 風格：回傳 raw dict、不掛 `response_model`。
- 產生 token 不動 `updated_at`（分享不是內容編輯，不應重排 session 清單）。

### 2a. Models（`backend/app/models/session.py` 或新檔 `share.py`）

```python
class ShareInfo(BaseModel):
    share_token: str | None      # null = 未分享

class FavoriteItem(BaseModel):
    session_id: str
    title: str
    creator_name: str | None     # 從 profiles.display_name 取
    share_token: str             # 前端用它組出開啟連結
    created_at: str              # 收藏時間
```

### 2b. Service 函式（`backend/app/services/supabase.py`）

| 函式 | 行為 |
|---|---|
| `create_share_token(user_id, session_id)` | 驗 ownership（`user_id` 過濾）；已有 token 就回傳現有的（冪等），沒有就 `gen_random_uuid()` 寫入 |
| `revoke_share_token(user_id, session_id)` | 驗 ownership；`share_token` 設回 `null` |
| `get_shared_session_by_token(token)` | 以 token 查 `study_sessions`（**不**以 user_id 過濾）；查無或 token 為 null → 404；回傳與 `get_session_detail` 相同結構 + creator display_name |
| `add_favorite(user_id, token)` | 以 token 反查 session_id 後 upsert 進 `shared_favorites`（自己的文章不必擋，收藏自己的也無害） |
| `remove_favorite(user_id, session_id)` | 刪一筆收藏 |
| `list_favorites(user_id)` | join `study_sessions`，**過濾 `share_token is not null`**（決策 3：取消分享即隱藏），再帶出 `profiles.display_name` |
| `fork_shared_session(user_id, token)` | `get_shared_session_by_token` 取內容 → 直接重用現有 `save_session(user_id, text, sentences, None)` 建立新 session → 回傳新 session summary |

fork 不呼叫 Gemini（資料都已算好），成本為零。

### 2c. Routes（新檔 `backend/app/routes/share.py`，在 `main.py` 註冊，`prefix="/api"`）

| Method | Path | 用途 | 權限 |
|---|---|---|---|
| POST | `/sessions/{session_id}/share` | 產生（或取回）分享 token | 擁有者 |
| DELETE | `/sessions/{session_id}/share` | 撤銷分享 | 擁有者 |
| GET | `/shared/{token}` | 唯讀取得整篇內容 | 任何登入使用者 |
| POST | `/shared/{token}/favorite` | 收藏 | 任何登入使用者 |
| DELETE | `/favorites/{session_id}` | 取消收藏 | 收藏者本人 |
| GET | `/favorites` | 我的收藏清單 | 登入使用者 |
| POST | `/shared/{token}/fork` | 複製成自己的新 session | 任何登入使用者 |

全部走 `Depends(require_user)`（維持「除 health/debug 外皆需 Bearer token」的原則）。

**安全注意**：
- `GET /shared/{token}` 是唯一不以 user_id 過濾的讀取路徑，其餘既有 endpoints 的 ownership 過濾不可動。
- share/revoke 必須驗證 session 屬於呼叫者。
- token 為 null（已撤銷）時 `GET /shared/{token}` 回 404，不是 403，避免洩漏 session 存在。

---

## Step 3：後端測試 ✅（完成 2026-07-09）

`backend/tests/test_share_route.py`，11 個測試（照 `test_usage_stats.py` 模式 patch `_request_json`）：

- 產生 token 冪等（連按兩次回同一個 token）＋ 不動 updated_at
- 非擁有者呼叫 share/revoke → 404
- 撤銷後/格式錯誤的 token → 404（格式錯誤不發任何請求）
- get_shared_session 以擁有者身分載入內容、正確標記 is_favorited/creator_name
- 收藏清單過濾掉已撤銷分享的項目、標題 fallback、空清單 short-circuit
- fork 以呼叫者 user_id 建新 session（session_id=None，絕不覆寫）

驗證結果：全套件 125 passed；本機起 uvicorn 實測 `/api/health` 200、share 端點無 token 401、假 JWT 403。**帶真實 token 的 curl 留到 Step 8 e2e**（需要實際登入帳號）。

---

## Step 4：前端 — 老師端分享 UI

- 在 session 相關 UI（建議：sidebar session 清單項目或主畫面標題列）加「分享」按鈕。
- 點擊 → `POST /api/sessions/{id}/share` → 彈出 AntD Modal / Popover 顯示連結：
  `{網站網址}/?shared={token}`
- 提供「複製連結」與「取消分享」（`DELETE`）兩個動作；已分享的 session 在清單上可加個小標記。
- API 呼叫一律走 `lib/api.ts:apiFetch`。
- 樣式遵循 frontend/CLAUDE.md：AntD 優先、CSS 變數、不硬編色碼。

**URL 格式說明**：沿用現有 query-param 路由模式（`App.tsx` 已用 `?view=summary` 等），用 `?shared={token}` 而非 path route，可免引入 router。

---

## Step 5：前端 — 學生端唯讀檢視（本功能最需要小心的一步）

### 5a. 進入點（`frontend/src/App.tsx`）

- 讀取 `params.get("shared")`；有值時：
  - 未登入 → 照常渲染 `LoginPage`。因為 App 不做導頁、query string 留在網址上，登入成功後 App 重新渲染就會自然落在分享檢視——**驗證 LoginPage / signup 流程不會清掉 query string**，這是「登入後導回」能免費成立的前提。
  - 已登入 → 渲染分享檢視。

### 5b. 唯讀模式（`frontend/src/context/translationContext.tsx`）

架構是「任何變動立即 `saveGeneratedProgress` 自動存檔」，唯讀模式必須**兩層防護**：

1. **Context 層**：`TranslationProvider` 加 `readOnly?: boolean` prop；`readOnly` 時 `saveGeneratedProgress` 直接 return（這是防止把老師的內容存進學生 session、或試圖寫老師 session 的最後防線）。
2. **UI 層**：隱藏所有編輯入口——加/刪/排序單字、編輯句子筆記、改標題、重新翻譯、OCR 等。TTS 播放、摘要檢視（`?view=summary`）、列印等唯讀功能保留。

分享檢視資料來源是 `GET /api/shared/{token}`（不是 `GET /api/sessions/{id}`），載入後餵進 context 供既有元件渲染。

### 5c. 分享檢視的頁面元素

- 文章標題 + 「由 {creator_name} 分享」標示
- 「收藏 / 取消收藏」按鈕（依 `GET /api/favorites` 判斷目前狀態）
- 「編輯副本」按鈕（→ Step 7 fork 流程）
- 回自己主畫面的入口

---

## Step 6：前端 — 收藏清單

- Sidebar 新增「收藏」面板（參照 `components/AppSidebar/panels/` 既有 panel 寫法），`GET /api/favorites` 列出：標題、分享者、收藏時間。
- 點項目 → 以該項的 `share_token` 開啟 `/?shared={token}` 檢視。
- 被老師刪除或取消分享的項目不會出現（後端已過濾），前端不需特別處理。
- ⚠️ 已知回歸：**切換/建立 session 必須重置主畫面 view**（此 bug 已回報過三次）——收藏檢視的進出同樣要遵守這條，離開分享檢視回到自己的 session 時 view 狀態要正確重置。

---

## Step 7：前端 — fork（編輯副本）

- 「編輯副本」→ 確認對話框（說明「將複製為你自己的筆記，之後與原文互不影響」）→ `POST /api/shared/{token}/fork` → 取得新 session id → 清掉 `?shared` query param → 以一般編輯模式載入新 session。
- fork 完成後這份就是學生自己的 session，走原本的自動存檔流程。

---

## Step 8：端到端驗證清單

用兩個帳號（老師帳號 + 無痕視窗的學生帳號）實際跑過，不能只看 code：

- [ ] 老師分享 → 複製連結 → 學生登入後開啟，內容完整（翻譯、單字卡、筆記、句構）
- [ ] 唯讀檢視期間開 DevTools Network：**確認沒有任何 `/sessions/save` 請求**發出
- [ ] 唯讀檢視看不到任何編輯 UI；TTS、摘要、列印正常
- [ ] 未登入貼上分享連結 → 登入 → 直接落在分享文章（query string 未遺失）
- [ ] 學生收藏 → 收藏清單出現 → 點開可讀
- [ ] 老師刪除該文章 → 學生收藏清單該項消失
- [ ] 老師取消分享（不刪）→ 學生收藏清單該項消失；重新分享 → 恢復出現
- [ ] 學生 fork → 編輯自己的副本正常自動存檔 → 老師刪原文，副本不受影響
- [ ] 進出分享檢視後切換自己的 session，主畫面 view 正確重置（已知回歸點）
- [ ] 手機視窗寬度檢查分享檢視與收藏面板無 overflow

---

## 未來版本（本次不做）

- 快照/版本（分享定稿而非活文件）
- 班級名單 / email 限制存取
- 「誰收藏了、誰 fork 了」統計
- fork 副本標註來源（`forked_from` 欄位）
