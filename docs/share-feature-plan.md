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

## Step 4：前端 — 老師端分享 UI ✅（程式完成 2026-07-09，視覺驗證待使用者確認）

實作紀錄：
- 分享按鈕放在 sidebar 的 `SessionItem`（bottom-right，刪除鈕左邊）：未分享時灰色、hover 才顯示；**已分享時 accent 色常駐顯示，兼作「已分享」標記**（免加額外 badge）。
- `ShareModal.tsx`（AntD Modal）：開啟即呼叫 `POST /api/sessions/{id}/share`（冪等）產生/取回連結；唯讀說明文字 + 連結 Input + 複製按鈕（`navigator.clipboard` + message 提示）+ 取消分享（Popconfirm 確認，說明收藏也會失效）。
- 連結格式 `{origin}/?shared={token}`（沿用 query-param 路由模式）。
- `lib/api.ts` 加 `createShareLink` / `revokeShareLink`；`SessionRecord` 型別加 `share_token`。
- type-check + build 通過；**瀏覽器實測（含手機寬度）待使用者驗證**。

**URL 格式說明**：沿用現有 query-param 路由模式（`App.tsx` 已用 `?view=summary` 等），用 `?shared={token}` 而非 path route，可免引入 router。

---

## Step 5：前端 — 學生端唯讀檢視 ✅（程式完成 2026-07-10，e2e 驗證待 Step 8）

實作紀錄（**與原計畫的一個重要差異**）：
- 原計畫是「`TranslationProvider` 加 readOnly 旗標擋掉自動存檔」。實作時發現摘要/列印視窗其實靠 `localStorage` 傳資料、展示元件（`SentenceItem`/`VocabCards`/`SummaryExportBar`/TTS/句構）都不依賴 context——所以 `SharedView.tsx` **完全不掛 `TranslationProvider`**，用本地 state 渲染。自動存檔路徑從架構上就不存在，比旗標更安全，也完全不用動 `translationContext.tsx`。
- `SentenceItem`/`VocabCards` 加 `readOnly` prop：隱藏筆記編輯、單字卡編輯/刪除/拖曳、查單字提示；保留句子 TTS、句構分析（點擊才載入，走全域 parse 快取）、筆記唯讀顯示。
- `SummaryExportBar` 的 `onStartQuiz` 改為可選：分享檢視保留「列印彙整資料」「列印單字卡」（經 localStorage，可直接重用），隱藏「單字測驗」。
- `SharedView` 頁面：唯讀標記、標題、「由 {creator_name} 分享」、收藏/取消收藏（HeartOutlined/Filled + message 回饋）、「回到我的學習紀錄」（`location.href = pathname` 整頁重載，天然避開 view-state 殘留 bug）。404/撤銷 → 顯示「連結已失效」。
- `App.tsx`：`?shared={token}` 且已登入 → `SharedView`；未登入 → 照常 `LoginPage`（登入不導頁、query string 自然保留，已檢查 LoginPage 不動 URL）。`view=summary`/`vocab-print` 的判斷在前，分享檢視開的列印視窗不受影響。
- ~~已知取捨：唯讀單字卡會隱藏單字 TTS 鈕~~ 已修（2026-07-11）：`VocabCard` 新增 `showTts` prop 與 readOnly 脫鉤，分享檢視的單字/例句發音鈕保留；SummaryWindow 列印版維持無聲。
- 「編輯副本」按鈕留給 Step 7 一起接。

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

## Step 6：前端 — 收藏清單 ✅（程式完成 2026-07-10）

實作紀錄：
- `FavoritesPanel.tsx`（仿 HistoryPanel 樣式）：sidebar 新增愛心圖示按鈕（`favorites` panel），開啟面板即載入 `GET /api/favorites`，含重新整理按鈕、載入/錯誤/空清單狀態。
- 每個項目顯示：標題（前綴愛心）、「由 {分享者} 分享・收藏於 {時間}」；點擊以 `location.href = ?shared={token}` 整頁導向唯讀檢視（與分享連結同一入口，view-state 因整頁重載天然重置，避開已知回歸）。
- 被刪除/取消分享的項目後端已過濾，前端無特殊處理。
- 取消收藏在 SharedView 內操作（面板不放刪除鈕，維持最小介面）。

---

## Step 7：前端 — fork（編輯副本）✅（程式完成 2026-07-11）

實作紀錄：
- SharedView 標題列「編輯副本」按鈕（收藏旁）：Popconfirm 確認（「會在你的學習紀錄中建立一份副本，之後的編輯與原文互不影響」）→ `POST /api/shared/{token}/fork`。
- 交接機制：fork 成功後把新 session id 寫進 `sessionStorage("ne_open_session")` → `location.href = pathname` 整頁回主 app → `App.tsx` 的 `PendingForkLoader`（掛在 TranslationProvider 內）讀到 id 就 `loadSession` ＋ 切到 translate 檢視。key 先移除再載入，StrictMode 雙掛載或重新整理都不會重播。
- fork 後即為使用者自己的 session，照常自動存檔；載入時明確切 view，符合「切換 session 必須重置主畫面」的既有規範。

---

## Step 8：端到端驗證清單 ✅ 後端資料流全過（2026-07-11 自動化）

**自動化 e2e（28/28 通過）**：以 Supabase admin API 建立兩個拋棄式帳號（老師/學生）、取真實 JWT，對本機後端跑完整生命週期，結束後刪除帳號與資料（零殘留）。涵蓋：

- [x] 分享冪等、`GET /sessions` 帶 share_token
- [x] 學生以連結讀取：翻譯/單字/筆記完整、creator_name 正確
- [x] 權限隔離：學生不能直接讀老師 session、不能撤銷老師的分享；老師不能讀學生的 fork
- [x] 收藏：204、is_favorited 翻轉、清單含 token 與分享者
- [x] 取消分享 → 連結 404、收藏隱藏；重新分享（新 token）→ 收藏恢復並帶新 token
- [x] fork 歸學生、可編輯存檔
- [x] 老師刪原文 → 連結 404、收藏被 DB cascade 自動清除、學生副本不受影響

**剩餘瀏覽器手動確認**（多數已在 Step 4–7 開發過程驗過）：

- [ ] 未登入貼分享連結 → 登入 → 直接落在分享文章（query string 未遺失）
- [ ] 唯讀檢視開 DevTools Network：無任何 `/sessions/save` 請求
- [ ] 唯讀檢視 TTS、摘要、列印正常；手機寬度無 overflow

---

## 未來版本（本次不做）

- 快照/版本（分享定稿而非活文件）
- 班級名單 / email 限制存取
- 「誰收藏了、誰 fork 了」統計
- fork 副本標註來源（`forked_from` 欄位）
