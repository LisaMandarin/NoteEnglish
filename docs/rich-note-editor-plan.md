# 自訂筆記富文字編輯計畫（Rich Note Editor Plan）

> 建立日期：2026-07-15
> 分支：`rich-note-editor`（從 `main` 切出）
> 執行方式：依步驟順序執行，每一步完成並驗證後再進下一步。
> ⚠️ 本計畫**新增前端依賴**（Tiptap、DOMPurify）與**一個新後端端點**（link preview）。
> ✅ 選型已於 2026-07-15 與 Lisa 確認：採用 Tiptap、換色用固定色盤。link preview 的 API 契約仍依 WORKFLOW.md 規則，實作時先出契約 diff 再寫邏輯（Step 5）。

---

## 目標

句子的自訂筆記支援：

1. 選取文字 → 換色、**粗體**、*斜體*、底線
2. 項目符號清單（bulleted）與編號清單（numbered）
3. 插入連結，且可預覽連結內容（開啟前看到標題／描述／縮圖）

## 現況盤點（已確認的程式事實）

- 筆記是**純文字**，存 `session_sentences.note`（text 欄位，migration 已於 2026-06-20 套用）。後端只是存取字串，**富文字化不需要改 schema**。
- 編輯 UI：`SentenceItem.tsx:191-211`——`Input.TextArea`，blur 儲存 + 2 秒防抖安全網（`NOTE_SAVE_DELAY_MS`），只在 trim 後內容有變時寫 DB（`commitNote`）。
- 顯示位置有三處，全部 `white-space: pre-wrap` 純文字：
  1. 主畫面筆記卡（`SentenceItem.tsx:208`）
  2. 分享唯讀頁（`SharedView` 重用 `SentenceItem readOnly`）
  3. 總結列印視窗（`SummaryWindow.tsx:104-108`，資料走 localStorage `latestSummary`）
- `useSelectionMenu` 的 `isFormControlTarget` 已排除 `[contenteditable='true']`（`useSelectionMenu.ts:66`），所以在筆記編輯器內選字**不會**誤觸查單字選單——Tiptap 是 contenteditable，天然相容。
- ⚠️ 安全重點：筆記會透過分享功能呈現給**其他使用者**。一旦 note 從純文字變 HTML，就是 stored-XSS 攻擊面，**渲染端必須全部過 sanitizer**，不能只信編輯器輸出。

## 選型（2026-07-15 已與 Lisa 確認）

**編輯器：Tiptap** ✅（[tiptap.dev](https://tiptap.dev)，MIT，ProseMirror 核心，React 生態最主流的 headless 富文字編輯器）。

- 需要的套件：`@tiptap/react`、`@tiptap/starter-kit`（含 bold/italic/列表/段落/undo）、`@tiptap/extension-underline`、`@tiptap/extension-link`、`@tiptap/extension-text-style` + `@tiptap/extension-color`。
- headless = 外觀完全自己畫，能貼合現有 AntD + CSS variables 風格。
- 替代方案（不推薦）：Lexical（Meta，較新、學習曲線陡）、Quill（主題化與 React 整合較差）、Slate（要自己造太多輪子）。用途只是筆記，Tiptap 的現成 extensions 剛好全部覆蓋。

**儲存格式：HTML 字串，存回現有 `note` 欄位。**

- 相容策略：不含 `<` 開頭標籤的既有筆記視為純文字，照舊 pre-wrap 顯示；使用者下次編輯時 Tiptap 以純文字載入（換行轉段落），存檔後自然升級成 HTML。**不做批次轉換 migration。**
- 空筆記判斷：`editor.isEmpty`（空 HTML `<p></p>` 要視為空，維持 `hasNote` 語意）。

**淨化：DOMPurify**（所有渲染點統一過白名單）：

`p, br, strong, b, em, i, u, ul, ol, li, a[href], span[style]`——`style` 只留 `color`；`a` 只允許 `http(s)://`，渲染時強制加 `target="_blank" rel="noopener noreferrer"`。共用工具函式 `lib/noteHtml.ts` 匯出 `sanitizeNoteHtml()` 與 `isLegacyPlainText()`，三個顯示點都用它。

**顏色：固定色盤，不開放自由選色。** ✅ 提供 4–5 個預設色（存 hex 於 span style），全部先驗證在 `--card-bg` 與白底上對比 ≥ 4.5:1（frontend/CLAUDE.md 硬規則），並考慮列印（見 Step 6）。

---

## Step 1：建分支

```bash
git checkout main && git pull
git checkout -b rich-note-editor
```

## Step 2：裝依賴 + 共用淨化工具

- `npm i @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link @tiptap/extension-text-style @tiptap/extension-color dompurify`（與 `@types/dompurify` 若需要）。
- 新檔 `frontend/src/lib/noteHtml.ts`：
  - `sanitizeNoteHtml(html: string): string`——DOMPurify 白名單如上，hook 強制 `a` 的 `target/rel` 與 scheme 檢查。
  - `isLegacyPlainText(note: string): boolean`——簡單判斷（不以 `<p`、`<ul`、`<ol` 開頭即視為 legacy）。
  - `noteHasContent(note: string): boolean`——取代散落的 `note.trim().length > 0` 判斷（HTML 的「空」要 strip tags 後判斷）。

## Step 3：NoteEditor 元件（取代 Input.TextArea）

新檔 `frontend/src/components/Translations/NoteEditor.tsx`；修改 `SentenceItem.tsx`。

- Tiptap `useEditor` + `EditorContent`，content 來源：legacy 純文字→逐行轉段落載入；HTML→直接載入。
- **儲存流程完全沿用現制**：`onBlur` 存檔、`onUpdate` 重設 2 秒防抖 timer（把現有 `handleDraftChange`/`saveNote`/`commitNote` 的字串換成 `editor.getHTML()`，空編輯器存空字串）。
- 工具列（AntD 優先、icon 按鈕全部帶 `aria-label`）：
  - 常駐小工具列在編輯器上方：粗體、斜體、底線、換色（Dropdown 色盤）、• 清單、1. 清單、插入連結、undo/redo。
  - 加 Tiptap `BubbleMenu`：選取文字時浮出同一組行內按鈕（對應需求「選取文字可以換色…」的直覺操作）；行動裝置上 BubbleMenu 定位需實測，若干擾則行動版只留常駐工具列。
- 插入連結：AntD `Popover` 內小表單（URL 欄），前端驗 `https?://`；選取狀態下套用到選取文字，無選取則以 URL 為文字插入。
- 編輯器樣式進 `src/index.css`（plain CSS，`.note-editor` scope）：清單縮排、連結顏色用 `--accent`、focus ring。維持與現有筆記卡一致的字級。

## Step 4：三個顯示點改渲染 sanitized HTML

- `SentenceItem.tsx:208`：`hasNote` 改用 `noteHasContent`；顯示改為
  `legacy → 照舊 <Text pre-wrap>`；`HTML → <div className="note-content" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(note) }} />`。
- 分享唯讀頁自動繼承（同一元件、`readOnly` 不開編輯器）——**必須實測 XSS**：直接用 API 存一筆含 `<script>`、`<img onerror>`、`javascript:` 連結的筆記，確認分享頁渲染後全部被拔除。
- `SummaryWindow.tsx:104-108`：note 欄同樣過 `sanitizeNoteHtml` 後以 HTML 渲染（localStorage 資料不可信，一樣要過白名單）。`.note-content` 樣式需同時放進 SummaryWindow 可用的樣式範圍。
- 筆記顯示卡內的 `<a>`：點擊要 `stopPropagation`，避免觸發整卡的 `openNoteEditor`。

## Step 5：連結預覽

後端（**契約先行**——先出這段 diff 確認）：

- `GET /api/link-preview?url=...` → `{ title: str | None, description: str | None, image: str | None, site_name: str | None }`，抓目標頁 OG meta tags。
- 新檔 `services/link_preview.py` + `routes/link_preview.py`；需 Bearer token（照全站規則）。
- **SSRF 防護（必做）**：只允許 `http(s)`；DNS 解析後拒絕 private/loopback/link-local IP；timeout 5s；只讀前 ~512KB；只解析 `text/html`；結果進 in-memory TTL cache（比照 vocab_cache 模式，重啟即清）。
- 不需要 GEMINI_API_KEY，不列入 AI 路由。

前端：

- `lib/api.ts` 加 `fetchLinkPreview(url)`（前端再加一層 in-memory cache，同 URL 不重打）。
- 筆記顯示卡中的連結包 AntD `Popover`（hover 觸發；觸控裝置 fallback 為長按或首次點擊先開 Popover、Popover 內「開啟連結」才導航）：卡片顯示 title / description（截兩行）/ 縮圖（`referrerpolicy="no-referrer"`、載入失敗隱藏）/ 網域名。取不到 meta 就只顯示網域＋「開啟連結」。
- Popover 內容屬純文字渲染（React 預設 escape），不再有 XSS 面。

## Step 6：列印與深淺主題

- **CLAUDE.md 保護行為**：列印輸出只能黑白灰。`@media print` 內對 `.note-content` 強制 `color: black !important`（含 span 色彩）、連結顯示為黑字＋底線；清單縮排照常。一次改齊 summary 視窗的 print 樣式（過去部分套用踩過雷）。
- 螢幕上的色盤字色要在筆記卡背景（`--card-bg`）驗過對比。

## Step 7：驗證

- 後端：`pytest` 新增 `test_link_preview.py`——正常 OG 解析、私網 IP 拒絕（`127.0.0.1`、`10.x`、`169.254.x`）、非 http scheme 拒絕、逾時處理、cache 命中。
- 前端 `frontend:verify`：
  1. 舊純文字筆記照常顯示；編輯→存檔→變 HTML 且顯示不變形。
  2. 粗斜底線、換色、兩種清單、連結：編輯→blur 存檔→重新載入 session 全部保留。
  3. 分享唯讀頁正確顯示富文字、無編輯入口；**XSS 注入實測**（Step 4）。
  4. 連結 hover 出預覽卡；點擊新分頁開啟。
  5. 筆記內選字不觸發查單字選單；筆記外選字功能不受影響（回歸）。
- **列印預覽實測**（CLAUDE.md 硬規則）：總結視窗含富文字筆記 → 列印預覽全黑白灰、清單與連結正常、無文字掉失。
- 行動版寬度：工具列不溢出（必要時可捲動的工具列）；BubbleMenu 不遮擋內容。
- 對比檢查：色盤每色、工具列 icon ≥ 3:1 / 4.5:1。
- `npm run type-check` 通過。

## 不做的事

- 不支援圖片上傳／表格／標題階層（筆記保持輕量；要再說）。
- 不做 markdown 輸入模式。
- 不批次轉換既有筆記（lazy upgrade，見選型）。
- 分享唯讀頁與列印視窗永遠只渲染 sanitized HTML，不掛編輯器。
