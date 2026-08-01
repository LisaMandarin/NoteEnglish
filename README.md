# 句句通
Contributor: Min-ting (Lisa) Chuang

句句通 is a bilingual learning tool for English learners. Paste a passage, get sentence-by-sentence translation, look up selected words, quiz yourself on saved vocabulary, generate printable summary sheets, share finished articles as read-only links, and track Gemini token usage.

## Features

### Core study flow
- Sentence splitting with original order preserved (spaCy).
- Sentence-level translation to Traditional Chinese via Gemini.
- Per-sentence vocab extraction (`lemma`, `pos`, original selected text).
- In-text selection menu for vocab lookup: Chinese translation, English definition, example sentence, CEFR level.
- Vocab note cards under each sentence:
  - Inline editing of all fields (translation, definition, example, up to 5 custom notes).
  - Custom notes use a rich-text editor (Tiptap): bold, italic, underline, lists, text color, and links — links render as preview cards (title/image/domain fetched via `/api/link-preview`, SSRF-guarded on the backend).
  - Drag-to-reorder cards within a sentence.
  - Expand/collapse and delete.
  - Pronounce buttons on sentences, word headings, and example sentences — neural voice via edge-tts with a popover player (pause / seek / 0.5–1.5× speed), falling back to browser speech synthesis.
- **Per-sentence custom notes (自訂筆記)**: free-form rich-text notes under each sentence, auto-saved with the session.
- **Sentence structure analysis (句構分析)**: per-sentence button that renders a five-pattern (五大句型) constituent skeleton with a sentence-type badge (simple / compound / complex / compound-complex). Gemini performs the analysis; spaCy dependency parsing gates incomplete sentences and validates/repairs the tree. Results are cached (in-memory + Supabase), so each sentence is analyzed at most once.
- Sample articles for quick testing — load a random article into the textarea.
- **Image to text (OCR)**: upload a photo of a passage (JPEG/PNG/WebP) — the image is compressed client-side and sent to Gemini vision (`/api/ocr`), and the extracted text fills the textarea.

### Quiz (線上測驗)
- Five quiz types built from a session's vocab: cloze (克漏字), matching (配對), spelling (拼字), dictation (聽寫, TTS-based), and Gemini-generated reading comprehension (cached per article).
- Word mastery levels (學習中 / 已掌握) shown as badges on vocab cards.
- Per-session word/article proficiency badges in the history list.

### Sharing (分享)
- Share a saved article as a link (`/?shared={token}`) — any signed-in user gets a **read-only** view: translation, vocab cards, notes, pronunciation, structure analysis, and print all work; nothing is editable.
- Links are revocable and idempotent: re-sharing returns the same link; revoking invalidates it (re-sharing later restores previous favorites).
- **Favorites (收藏)**: viewers bookmark shared articles in the sidebar library. Favorites are references, not copies — they disappear automatically when the owner deletes or unshares the article.
- **Fork (編輯副本)**: copy a shared article into your own sessions and edit it freely; copies are fully independent of the original.

### Print & export
- **Summary window** (`?view=summary`): original + translation or original + vocab notes, with `window.print` support.
- **Vocab print window** (`?view=vocab-print`): vocab cards only, print-optimized layout.
- Both open from the export bar at the bottom of the main page (also available in the read-only shared view).

### Sidebar
- **Library (📁)**: two tabs —
  - **History**: load previous sessions, rename titles inline (mirrored by a title bar above the textarea in the main section), share, delete, refresh.
    - **Topic folders (主題資料夾)**: group sessions into user-created folders — create/rename/delete a folder, move a session in or out. Deleting a folder releases its sessions back to "未分類" rather than deleting them. Folder vs. "未分類" display order is a per-device toggle (`localStorage`, not synced to the account).
  - **Favorites**: shared articles you bookmarked; click to reopen the read-only view.
- **Settings (⚙️)**: account info (username, email, sign out), profile editing, and the token-usage view — bar charts for Gemini token consumption (last 12 hours hourly, this week daily, last 3 months monthly, Asia/Taipei buckets) plus usage progress bars against the 12-hour and monthly limits.
- The 句句通 logo doubles as the home link.

### Profile (個人檔案)
- Every user has an editable profile: display name, bio, up to 5 labeled links, and a public/private toggle (edited via a modal from Settings).
- When public, `?profile={userId}` renders a read-only profile page (outside `TranslationContext`, like the shared view) — anyone signed in can view it.
- A shared article's author name links to their public profile when it's public; private profiles show as plain text.

### Admin dashboard
- Separate admin login at `/admin-dashboard` with an admin-only access check (`/api/admin/check`).
- **Overview**: high-level usage stats.
- **Management**: paginated user list with a per-user detail view, including individual token usage stats.
- **Profile**: admin account info and sign-out.

## Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS v4, Ant Design, Recharts
- **Backend**: FastAPI, spaCy (`en_core_web_sm`), Google GenAI (Gemini)
- **Auth**: Supabase (JWT only — all data persistence goes through FastAPI, not direct table calls)
- **State management**: React Context + `useReducer`
- **Deployment**: Vercel (frontend, with SPA rewrites in `frontend/vercel.json`), Render (backend, `render.yaml`)

## Project Structure
```text
NoteEnglish/
├─ frontend/   # React + Vite UI  →  see frontend/README.md
└─ backend/    # FastAPI service   →  see backend/README.md
```

## Supabase Tables
- `profiles` (incl. `bio`, `links`, `is_public` for the profile feature)
- `study_sessions` (incl. `share_token` for sharing, `group_id` for topic folders)
- `session_groups` (topic folders; `ON DELETE SET NULL` releases sessions when a folder is deleted)
- `session_sentences`
- `vocab_notes`
- `shared_favorites` (favorite references; cascade-deleted with the session)
- `quiz_questions` (cached Gemini comprehension questions)
- `quiz_results` (per-answer quiz history)
- `word_mastery` (per-word mastery counters and levels)
- `sentence_parses` (sentence structure analysis cache)
- `api_usage` (Gemini token usage log)

## Usage Flow
1. Paste a passage (or load a sample article) and click `Translate`.
2. Select words in the original sentence area.
3. Choose vocab fields in the pop-up menu, then click `查單字`.
4. Review or remove vocab cards under each sentence.
5. Use the export bar to open the summary or vocab print window.

## Notes
- Backend vocab cache is in-memory only — resets on server restart.
- `GEMINI_API_KEY` is required for the translation, vocab detail, sentence structure analysis, OCR, and quiz endpoints.
- When added to the home screen (PWA-like standalone display mode), sub-views (summary/vocab-print/profile windows) open and close via same-window navigation instead of `window.open`/`window.close`, since standalone webviews have no tabs or address bar to fall back to (`frontend/src/lib/openView.ts`).

---

## 中文版

### 專案介紹
句句通是給英語學習者的雙語學習工具。可貼上一段英文，取得逐句翻譯、針對選取單字查詢細節、以儲存的單字進行測驗、輸出可列印彙整頁、將整理好的文章以唯讀連結分享給其他人，以及查看 Gemini token 使用量。

### 功能

#### 核心學習流程
- 使用 spaCy 斷句，保留原句順序。
- 使用 Gemini 將句子翻譯為繁體中文。
- 每句自動抽取基礎單字資訊（`lemma`、`pos`、原始字詞）。
- 在原文句子中選字後可開啟查詢選單：中文翻譯、英文定義、例句、CEFR 程度。
- 每句下方顯示單字筆記卡片：
  - 可內聯編輯所有欄位（翻譯、定義、例句，以及最多 5 個自訂備注欄位）。
  - 自訂備注使用富文字編輯器（Tiptap）：粗體、斜體、底線、清單、文字顏色、連結——連結會顯示預覽卡片（標題／圖片／網域，透過 `/api/link-preview` 取得，後端已做 SSRF 防護）。
  - 可拖曳排序同一句的單字卡片。
  - 可收合/展開、可刪除。
  - 句子、單字標題與例句旁皆有發音按鈕——使用 edge-tts 神經語音，附播放器（暫停／拖曳進度／0.5–1.5 倍速），無法使用時退回瀏覽器內建語音。
- **每句自訂筆記**：句子下方可加自由格式富文字筆記，隨學習紀錄自動儲存。
- **句構分析**：每個句子可展開五大句型結構骨架，並標示結構類型（單句／合句／複句／複合句）。分析由 Gemini 完成，spaCy 依存句法分析負責過濾不完整句子、驗證與修正分析結果；結果會快取（記憶體＋Supabase），同一句子最多只分析一次。
- 提供範例文章，可一鍵載入測試。
- **圖片轉文字（OCR）**：上傳文章照片（JPEG/PNG/WebP），前端先壓縮圖片，再透過 Gemini 視覺辨識（`/api/ocr`）擷取文字並自動填入輸入框。

#### 線上測驗
- 以學習紀錄的單字出題，共五種題型：克漏字、字義配對、拼字、聽寫（TTS 發音）、閱讀理解（Gemini 出題並依文章快取）。
- 單字掌握度（學習中／已掌握）以徽章顯示在單字卡上。
- 歷史清單顯示每篇的單字／文章熟練度徽章。

#### 分享
- 將整理好的文章以連結分享（`/?shared={token}`）——任何登入使用者皆可**唯讀**閱讀：翻譯、單字卡、筆記、發音、句構分析與列印都可用，但不能編輯。
- 連結可撤銷且冪等：重複分享回傳同一連結；取消分享即失效（之後重新分享會恢復先前的收藏）。
- **收藏**：讀者可將分享文章加入側欄收藏清單。收藏是引用而非副本——作者刪除或取消分享時自動消失。
- **編輯副本（fork）**：把分享文章複製成自己的學習紀錄後自由編輯，副本與原文完全獨立。

#### 列印與匯出
- **彙整視窗**（`?view=summary`）：原文＋翻譯或原文＋單字筆記，支援 `window.print`。
- **單字列印視窗**（`?view=vocab-print`）：僅顯示單字卡片，針對列印最佳化。
- 兩個視窗皆可從頁面底部的匯出列開啟（分享唯讀頁同樣可用）。

#### 側欄
- **學習紀錄（📁）**：兩個分頁——
  - **歷史紀錄**：載入過去紀錄、直接改標題（主畫面輸入框上方的標題列也可同步改名）、分享、刪除、重新整理。
    - **主題資料夾**：可將學習紀錄分類到自訂資料夾——新增／改名／刪除資料夾，將紀錄移入或移出。刪除資料夾只會把裡面的紀錄退回「未分類」，不會刪除紀錄本身。資料夾與「未分類」的顯示順序是裝置本機設定（存在 `localStorage`，不會同步到帳號）。
  - **收藏**：收藏的分享文章，點按即重新開啟唯讀檢視。
- **設定（⚙️）**：帳戶資訊（名稱、信箱、登出）、個人檔案編輯，以及 Token 用量檢視——以長條圖顯示 Gemini token 消耗量（近 12 小時／本週／近三個月，以台北時區分桶），並顯示近 12 小時與每月用量上限的進度條。
- 「句句通」logo 即首頁連結。

#### 個人檔案
- 每位使用者都有可編輯的個人檔案：顯示名稱、簡介、最多 5 個標籤連結，以及公開／不公開切換（從設定頁的彈窗編輯）。
- 設為公開時，`?profile={userId}` 會顯示唯讀個人檔案頁（架構上與分享頁一樣不在 `TranslationContext` 內）——任何登入使用者皆可檢視。
- 分享文章的作者名稱在對方個人檔案公開時會連結過去；不公開則僅顯示純文字。

#### 管理員後台
- 獨立的管理員登入頁面（`/admin-dashboard`），並透過 `/api/admin/check` 驗證管理員權限。
- **總覽**：整體使用統計。
- **使用者管理**：分頁式使用者列表，可查看單一使用者的詳細資料與 token 用量統計。
- **個人資料**：管理員帳號資訊與登出。

### 技術棧
- **前端**：React 19、Vite、Tailwind CSS v4、Ant Design、Recharts
- **後端**：FastAPI、spaCy（`en_core_web_sm`）、Google GenAI（Gemini）
- **驗證**：Supabase（僅用於 JWT 驗證，所有資料持久化透過 FastAPI 處理）
- **狀態管理**：React Context + `useReducer`
- **部署**：Vercel（前端，SPA 路由重寫設定於 `frontend/vercel.json`）、Render（後端，`render.yaml`）

### 專案結構
```text
NoteEnglish/
├─ frontend/   # React + Vite 前端  →  參閱 frontend/README.md
└─ backend/    # FastAPI 後端       →  參閱 backend/README.md
```

### Supabase 資料表
- `profiles`（含個人檔案功能的 `bio`、`links`、`is_public` 欄位）
- `study_sessions`（含分享功能的 `share_token` 欄位、主題資料夾的 `group_id` 欄位）
- `session_groups`（主題資料夾；刪除資料夾時以 `ON DELETE SET NULL` 釋放紀錄）
- `session_sentences`
- `vocab_notes`
- `shared_favorites`（收藏引用；隨文章刪除連動清除）
- `quiz_questions`（Gemini 閱讀理解題快取）
- `quiz_results`（逐題作答紀錄）
- `word_mastery`（單字掌握度與等級）
- `sentence_parses`（句構分析快取）
- `api_usage`（Gemini token 用量紀錄）

### 使用流程
1. 貼上一段文字（或載入範例文章），按 `Translate`。
2. 在原文句子中選取要查詢的字詞。
3. 勾選需要欄位後按 `查單字`。
4. 在每句下方檢視或刪除單字卡。
5. 使用頁面底部的匯出列，開啟彙整或單字列印視窗。

### 備註
- 後端單字快取為記憶體快取，重啟服務後會清空。
- `GEMINI_API_KEY` 為翻譯、單字細節查詢、句構分析、圖片轉文字與測驗出題必要設定。
- 加到主畫面（PWA 獨立顯示模式）時，子頁面（彙整／單字列印／個人檔案視窗）會改用同視窗導航開啟與關閉，而非 `window.open`／`window.close`，因為獨立模式的 webview 沒有分頁或網址列可以退回（見 `frontend/src/lib/openView.ts`）。
