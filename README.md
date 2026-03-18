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
- Summary window (`?view=summary`) with selectable sections:
  - Original + translation
  - Original + queried vocab notes
  - Print support (`window.print`) for handouts.

## Tech Stack
- Frontend: React 19, Vite, Tailwind CSS v4, Ant Design.
- Backend: FastAPI, spaCy (`en_core_web_sm`), Google GenAI (Gemini).
- State management: React Context + `useReducer`.
- Data flow:
  - `POST /api/translate` for sentence translations + base vocab list.
  - `POST /api/vocab/detail` for selected vocab enrichment (with backend in-memory cache).

## Project Structure
```text
NoteEnglish/
├─ frontend/   # React + Vite UI
└─ backend/    # FastAPI API service
```

## Quick Start

### 1) Backend
Prerequisites:
- Python 3.10-3.12
- Poetry
- Gemini API Key

```bash
cd backend
poetry install
```

Create `backend/.env`:
```env
GEMINI_API_KEY=your_key_here
FRONTEND_ORIGIN=http://localhost:5173
GEMINI_MODEL=gemini-2.5-flash
```

Run:
```bash
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend
Prerequisites:
- Node.js 18+
- npm

```bash
cd frontend
npm install
```

Optional `frontend/.env`:
```env
VITE_API_BASE=http://127.0.0.1:8000
```

Run:
```bash
npm run dev
```

### 3) Supabase
This app expects these Supabase tables:
- `profiles`
- `study_sessions`
- `session_sentences`
- `vocab_notes`

## API Endpoints
- `GET /api/health`: health check.
- `POST /api/debug/split`: inspect sentence splitting result.
- `POST /api/translate`: translate text and return sentence list with base vocab.
- `POST /api/vocab/detail`: fetch selected vocab details by requested fields.

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
- 支援彙整視窗（`?view=summary`）與列印：
  - 原文 + 翻譯
  - 原文 + 已查詢單字筆記

### 技術棧
- 前端：React 19、Vite、Tailwind CSS v4、Ant Design
- 後端：FastAPI、spaCy（`en_core_web_sm`）、Google GenAI（Gemini）
- 狀態管理：React Context + `useReducer`
- API 流程：
  - `POST /api/translate`：回傳逐句翻譯與基礎單字
  - `POST /api/vocab/detail`：依勾選欄位補齊單字細節（後端含記憶體快取）

### 專案結構
```text
NoteEnglish/
├─ frontend/   # React + Vite 前端
└─ backend/    # FastAPI 後端
```

### 快速開始

#### 1) 啟動後端
需求：
- Python 3.10-3.12
- Poetry
- Gemini API Key

```bash
cd backend
poetry install
```

建立 `backend/.env`：
```env
GEMINI_API_KEY=your_key_here
FRONTEND_ORIGIN=http://localhost:5173
GEMINI_MODEL=gemini-2.5-flash
```

啟動：
```bash
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### 2) 啟動前端
需求：
- Node.js 18+
- npm

```bash
cd frontend
npm install
```

可選設定 `frontend/.env`：
```env
VITE_API_BASE=http://127.0.0.1:8000
```

啟動：
```bash
npm run dev
```

### API 端點
- `GET /api/health`：健康檢查
- `POST /api/debug/split`：查看斷句結果
- `POST /api/translate`：翻譯文字並回傳逐句資料與基礎單字
- `POST /api/vocab/detail`：查詢指定單字欄位細節

### 使用流程
1. 貼上一段文字，按 `Translate`。
2. 在原文句子中選取要查詢的字詞。
3. 勾選需要欄位後按 `查單字`。
4. 在每句下方檢視或刪除單字卡。
5. 勾選 `翻譯` / `單字筆記`，按 `彙整` 開啟可列印頁面。

### 備註
- 後端單字快取為記憶體快取，重啟服務後會清空。
- `GEMINI_API_KEY` 為翻譯與單字細節查詢必要設定。
