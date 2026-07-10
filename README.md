# NoteEnglish 句句通
Contributor: Min-ting (Lisa) Chuang

NoteEnglish is a bilingual learning tool for English learners. Paste a passage, get sentence-by-sentence translation, look up selected words, quiz yourself on saved vocabulary, generate printable summary sheets, share finished articles as read-only links, and track Gemini token usage.

## Features

### Core study flow
- Sentence splitting with original order preserved (spaCy).
- Sentence-level translation to Traditional Chinese via Gemini.
- Per-sentence vocab extraction (`lemma`, `pos`, original selected text).
- In-text selection menu for vocab lookup: Chinese translation, English definition, example sentence, CEFR level.
- Vocab note cards under each sentence:
  - Inline editing of all fields (translation, definition, example, up to 5 custom notes).
  - Drag-to-reorder cards within a sentence.
  - Expand/collapse and delete.
  - Pronounce buttons on sentences, word headings, and example sentences — neural voice via edge-tts with a popover player (pause / seek / 0.5–1.5× speed), falling back to browser speech synthesis.
- **Per-sentence custom notes (自訂筆記)**: free-form notes under each sentence, auto-saved with the session.
- **Sentence structure analysis (句構分析)**: per-sentence button that renders a five-pattern (五大句型) constituent skeleton with a sentence-type badge (simple / compound / complex / compound-complex). Gemini performs the analysis; spaCy dependency parsing gates incomplete sentences and validates/repairs the tree. Results are cached (in-memory + Supabase), so each sentence is analyzed at most once.
- Sample articles for quick testing — load a random article into the textarea.
- **Image to text (OCR)**: upload a photo of a passage (JPEG/PNG/WebP) — the image is compressed client-side and sent to Gemini vision (`/api/ocr`), and the extracted text fills the textarea.

### Quiz & review (單字測驗與複習)
- Five quiz types built from a session's vocab: cloze (克漏字), matching (配對), spelling (拼字), dictation (聽寫, TTS-based), and Gemini-generated reading comprehension (cached per article).
- Word mastery levels with spaced-repetition (SRS) daily review across sessions.
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
  - **History**: load previous sessions (paginated), rename titles inline, share, delete, refresh.
  - **Favorites**: shared articles you bookmarked; click to reopen the read-only view.
- **Settings (⚙️)**: account info (username, email, sign out) and the token-usage view — bar charts for Gemini token consumption (last 12 hours hourly, this week daily, last 3 months monthly) plus usage progress bars against the 12-hour and monthly limits.
- The 句句通 logo doubles as the home link.

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
- `profiles`
- `study_sessions` (incl. `share_token` for the sharing feature)
- `session_sentences`
- `vocab_notes`
- `shared_favorites` (favorite references; cascade-deleted with the session)
- `quiz_questions` (cached Gemini comprehension questions)
- `quiz_results` (per-answer quiz history)
- `word_mastery` (per-word mastery counters, levels, SRS schedule)
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
- `GEMINI_API_KEY` is required for the translation, vocab detail, sentence structure analysis, and OCR endpoints.

---

## 中文版

### 專案介紹
NoteEnglish 句句通是給英語學習者的雙語學習工具。可貼上一段英文，取得逐句翻譯、針對選取單字查詢細節、以儲存的單字進行測驗與複習、輸出可列印彙整頁、將整理好的文章以唯讀連結分享給其他人，以及查看 Gemini token 使用量。

### 功能

#### 核心學習流程
- 使用 spaCy 斷句，保留原句順序。
- 使用 Gemini 將句子翻譯為繁體中文。
- 每句自動抽取基礎單字資訊（`lemma`、`pos`、原始字詞）。
- 在原文句子中選字後可開啟查詢選單：中文翻譯、英文定義、例句、CEFR 程度。
- 每句下方顯示單字筆記卡片：
  - 可內聯編輯所有欄位（翻譯、定義、例句，以及最多 5 個自訂備注欄位）。
  - 可拖曳排序同一句的單字卡片。
  - 可收合/展開、可刪除。
  - 句子、單字標題與例句旁皆有發音按鈕——使用 edge-tts 神經語音，附播放器（暫停／拖曳進度／0.5–1.5 倍速），無法使用時退回瀏覽器內建語音。
- **每句自訂筆記**：句子下方可加自由格式筆記，隨學習紀錄自動儲存。
- **句構分析**：每個句子可展開五大句型結構骨架，並標示結構類型（單句／合句／複句／複合句）。分析由 Gemini 完成，spaCy 依存句法分析負責過濾不完整句子、驗證與修正分析結果；結果會快取（記憶體＋Supabase），同一句子最多只分析一次。
- 提供範例文章，可一鍵載入測試。
- **圖片轉文字（OCR）**：上傳文章照片（JPEG/PNG/WebP），前端先壓縮圖片，再透過 Gemini 視覺辨識（`/api/ocr`）擷取文字並自動填入輸入框。

#### 測驗與複習
- 以學習紀錄的單字出題，共五種題型：克漏字、字義配對、拼字、聽寫（TTS 發音）、閱讀理解（Gemini 出題並依文章快取）。
- 單字掌握度等級與跨紀錄的每日複習（間隔重複 SRS）。
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
  - **歷史紀錄**：載入過去紀錄（分頁）、直接改標題、分享、刪除、重新整理。
  - **收藏**：收藏的分享文章，點按即重新開啟唯讀檢視。
- **設定（⚙️）**：帳戶資訊（名稱、信箱、登出）與 Token 用量檢視——以長條圖顯示 Gemini token 消耗量（近 12 小時／本週／近三個月），並顯示近 12 小時與每月用量上限的進度條。
- 「句句通」logo 即首頁連結。

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
- `profiles`
- `study_sessions`（含分享功能的 `share_token` 欄位）
- `session_sentences`
- `vocab_notes`
- `shared_favorites`（收藏引用；隨文章刪除連動清除）
- `quiz_questions`（Gemini 閱讀理解題快取）
- `quiz_results`（逐題作答紀錄）
- `word_mastery`（單字掌握度、等級與 SRS 排程）
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
- `GEMINI_API_KEY` 為翻譯、單字細節查詢、句構分析與圖片轉文字必要設定。
