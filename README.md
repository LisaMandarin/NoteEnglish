# NoteEnglish 句句通
Contributor: Min-ting (Lisa) Chuang

NoteEnglish is a bilingual learning tool for English learners.
You can paste a passage, get sentence-by-sentence translation, look up selected words, and generate a printable summary sheet.

## Current Features
- Sentence splitting with original order preserved (spaCy).
- Sentence-level translation to Traditional Chinese via Gemini.
- Per-sentence vocab extraction (`lemma`, `pos`, original selected text).
- In-text selection menu for vocab lookup options:
  - Chinese translation
  - English definition
  - Example sentence
  - CEFR level
- Vocab notes shown as cards under each sentence (expand/collapse + delete).
  - Inline editing of all card fields (translation, definition, example, up to 5 custom notes).
  - Drag-to-reorder cards within a sentence.
  - Pronounce button (speech synthesis) on word headings and example sentences.
- Summary window (`?view=summary`) with selectable sections:
  - Original + translation
  - Original + queried vocab notes
  - Print support (`window.print`) for handouts.
- Sidebar with session history: load previous sessions, rename titles inline, and delete sessions.
- Sidebar profile panel: displays username and email, with sign-out button.
- Sidebar settings panel (placeholder for future workspace preferences).

## Tech Stack
- Frontend: React 19, Vite, Tailwind CSS v4, Ant Design.
- Backend: FastAPI, spaCy (`en_core_web_sm`), Google GenAI (Gemini).
- State management: React Context + `useReducer`.
- Data flow:
  - `POST /api/translate` for sentence translations + base vocab list.
  - `POST /api/vocab/detail` for selected vocab enrichment (with backend in-memory cache).
  - Authenticated backend APIs for profiles and saved study sessions.

## Project Structure
```text
NoteEnglish/
├─ frontend/   # React + Vite UI
└─ backend/    # FastAPI API service
```

## Quick Start

### 1) Backend
See [backend/README.md](backend/README.md) for setup, `.env` config, and Render deployment.

### 2) Frontend
See [frontend/README.md](frontend/README.md) for setup and build commands.

### 3) Supabase
This app expects these Supabase tables:
- `profiles`
- `study_sessions`
- `session_sentences`
- `vocab_notes`

## Usage Flow
1. Paste a passage and click `Translate`.
2. Select words in the original sentence area.
3. Choose vocab fields in the pop-up menu, then click `查單字`.
4. Review or remove vocab cards under each sentence.
5. Select `翻譯` / `單字筆記`, then click `彙整` to open printable summary page.

## Notes
- Backend vocab cache is in-memory only (resets when server restarts).
- `GEMINI_API_KEY` is required for translation and vocab detail endpoints.

---

## 中文版

### 專案介紹
NoteEnglish 句句通是給英語學習者的雙語學習工具。  
可貼上一段英文，取得逐句翻譯、針對選取單字查詢細節，最後輸出可列印的彙整頁。

### 目前功能
- 使用 spaCy 斷句，保留原句順序。
- 使用 Gemini 將句子翻譯為繁體中文。
- 每句自動抽取基礎單字資訊（`lemma`、`pos`、原始字詞）。
- 在原文句子中選字後可開啟查詢選單，勾選欄位：
  - 中文翻譯
  - 英文定義
  - 例句
  - CEFR 程度
- 每句下方顯示「單字筆記卡片」（可收合/展開、可刪除）。
  - 可內聯編輯所有欄位（翻譯、定義、例句，以及最多 5 個自訂備注欄位）。
  - 可拖曳排序同一句的單字卡片。
  - 單字標題與例句旁有發音按鈕（語音合成）。
- 支援彙整視窗（`?view=summary`）與列印：
  - 原文 + 翻譯
  - 原文 + 已查詢單字筆記
- 側欄學習紀錄：可載入舊紀錄、直接在側欄內聯修改標題、刪除紀錄。
- 側欄個人資料面板：顯示使用者名稱與信箱，並提供登出按鈕。
- 側欄設定面板（預留給未來工作區偏好設定）。

### 技術棧
- 前端：React 19、Vite、Tailwind CSS v4、Ant Design
- 後端：FastAPI、spaCy（`en_core_web_sm`）、Google GenAI（Gemini）
- 狀態管理：React Context + `useReducer`
- API 流程：
  - `POST /api/translate`：回傳逐句翻譯與基礎單字
  - `POST /api/vocab/detail`：依勾選欄位補齊單字細節（後端含記憶體快取）
  - 驗證後的後端 API：處理個人資料與已儲存的學習紀錄

### 專案結構
```text
NoteEnglish/
├─ frontend/   # React + Vite 前端
└─ backend/    # FastAPI 後端
```

### 快速開始

#### 1) 啟動後端
請參閱 [backend/README.md](backend/README.md) 了解安裝、`.env` 設定與 Render 部署方式。

#### 2) 啟動前端
請參閱 [frontend/README.md](frontend/README.md) 了解安裝與 build 指令。

#### 3) Supabase
本專案需要以下 Supabase 資料表：
- `profiles`
- `study_sessions`
- `session_sentences`
- `vocab_notes`

### 使用流程
1. 貼上一段文字，按 `Translate`。
2. 在原文句子中選取要查詢的字詞。
3. 勾選需要欄位後按 `查單字`。
4. 在每句下方檢視或刪除單字卡。
5. 勾選 `翻譯` / `單字筆記`，按 `彙整` 開啟可列印頁面。

### 備註
- 後端單字快取為記憶體快取，重啟服務後會清空。
- `GEMINI_API_KEY` 為翻譯與單字細節查詢必要設定。
- 儲存學習紀錄的後端 API 也需要設定 Supabase 相關環境變數。
