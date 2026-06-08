# NoteEnglish 句句通
Contributor: Min-ting (Lisa) Chuang

NoteEnglish is a bilingual learning tool for English learners. Paste a passage, get sentence-by-sentence translation, look up selected words, generate printable summary sheets, and track Gemini token usage.

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
  - Pronounce button (speech synthesis) on word headings and example sentences.
- Sample articles for quick testing — load a random article into the textarea.

### Print & export
- **Summary window** (`?view=summary`): original + translation or original + vocab notes, with `window.print` support.
- **Vocab print window** (`?view=vocab-print`): vocab cards only, print-optimized layout.
- Both open from the export bar at the bottom of the main page.

### Sidebar
- **History**: load previous sessions (paginated), rename titles inline, delete, refresh.
- **Profile**: username, email, sign-out.
- **Token usage**: bar charts for Gemini token consumption — last 12 hours (hourly), this week (daily), last 3 months (monthly).
- **Settings**: placeholder for future workspace preferences.

## Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS v4, Ant Design, Recharts
- **Backend**: FastAPI, spaCy (`en_core_web_sm`), Google GenAI (Gemini)
- **Auth**: Supabase (JWT only — all data persistence goes through FastAPI, not direct table calls)
- **State management**: React Context + `useReducer`

## Project Structure
```text
NoteEnglish/
├─ frontend/   # React + Vite UI  →  see frontend/README.md
└─ backend/    # FastAPI service   →  see backend/README.md
```

## Supabase Tables
- `profiles`
- `study_sessions`
- `session_sentences`
- `vocab_notes`

## Usage Flow
1. Paste a passage (or load a sample article) and click `Translate`.
2. Select words in the original sentence area.
3. Choose vocab fields in the pop-up menu, then click `查單字`.
4. Review or remove vocab cards under each sentence.
5. Use the export bar to open the summary or vocab print window.

## Notes
- Backend vocab cache is in-memory only — resets on server restart.
- `GEMINI_API_KEY` is required for translation and vocab detail endpoints.

---

## 中文版

### 專案介紹
NoteEnglish 句句通是給英語學習者的雙語學習工具。可貼上一段英文，取得逐句翻譯、針對選取單字查詢細節、輸出可列印彙整頁，以及查看 Gemini token 使用量。

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
  - 單字標題與例句旁有發音按鈕（語音合成）。
- 提供範例文章，可一鍵載入測試。

#### 列印與匯出
- **彙整視窗**（`?view=summary`）：原文＋翻譯或原文＋單字筆記，支援 `window.print`。
- **單字列印視窗**（`?view=vocab-print`）：僅顯示單字卡片，針對列印最佳化。
- 兩個視窗皆可從頁面底部的匯出列開啟。

#### 側欄
- **學習紀錄**：可載入過去紀錄（分頁）、直接修改標題、刪除、重新整理。
- **個人資料**：顯示使用者名稱與信箱，並提供登出按鈕。
- **Token 用量**：以長條圖顯示 Gemini token 消耗量——近 12 小時（每小時）、本週（每日）、近三個月（每月）。
- **設定**：預留給未來工作區偏好設定。

### 技術棧
- **前端**：React 19、Vite、Tailwind CSS v4、Ant Design、Recharts
- **後端**：FastAPI、spaCy（`en_core_web_sm`）、Google GenAI（Gemini）
- **驗證**：Supabase（僅用於 JWT 驗證，所有資料持久化透過 FastAPI 處理）
- **狀態管理**：React Context + `useReducer`

### 專案結構
```text
NoteEnglish/
├─ frontend/   # React + Vite 前端  →  參閱 frontend/README.md
└─ backend/    # FastAPI 後端       →  參閱 backend/README.md
```

### Supabase 資料表
- `profiles`
- `study_sessions`
- `session_sentences`
- `vocab_notes`

### 使用流程
1. 貼上一段文字（或載入範例文章），按 `Translate`。
2. 在原文句子中選取要查詢的字詞。
3. 勾選需要欄位後按 `查單字`。
4. 在每句下方檢視或刪除單字卡。
5. 使用頁面底部的匯出列，開啟彙整或單字列印視窗。

### 備註
- 後端單字快取為記憶體快取，重啟服務後會清空。
- `GEMINI_API_KEY` 為翻譯與單字細節查詢必要設定。
