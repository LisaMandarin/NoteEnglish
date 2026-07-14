# Session 標題 UX 改善計畫（Session Title UX Plan）

> 建立日期：2026-07-15
> 分支：`session-title-ux`（從 `main` 切出）
> 執行方式：依步驟順序執行，每一步完成並驗證後再進下一步。

---

## 目標

1. 側邊欄每個 session 的標題編輯輸入框加上「清除」按鈕（一鍵清空）。
2. 翻譯成功後，在主區（main section）顯示該 session 的標題。
3. 使用者可以直接在主區編輯標題（不必回到側邊欄）。

## 現況盤點（已確認的程式事實）

- 側邊欄編輯輸入框是原生 `<input>`：`frontend/src/components/AppSidebar/panels/SessionItem.tsx:107-117`，狀態由 `useSessionEdit.ts` 管理（`editInputRef` 型別是 `RefObject<HTMLInputElement>`）。
- 標題更新 API 已存在：`PATCH /api/sessions/{id}/title`（`lib/api.ts:158` `updateSessionTitle`），後端會順便更新 `updated_at`。**不需要新的後端端點。**
- context 已有現成 action：`update_current_session_title`（`translationContext.tsx:545`），目前沒有任何 UI 呼叫它。
- 翻譯成功 → `saveGeneratedProgress` → `save_success` 會把後端回傳的 `session.title` 寫進 `state.currentSession`，所以翻譯完成後標題已經在 state 裡，只是主區沒有顯示。
- ⚠️ 既有小 bug：reducer 的 `set_text` / `set_ocr_text`（`translationContext.tsx:82-88, 98-103`）會用 `buildSessionTitle(text)` 覆寫 `currentSession.title`。若使用者已自訂標題，改文字時畫面上的標題會被暫時蓋掉（後端不會被蓋，`save_session` 的 PATCH 不動 title，存檔後又會同步回正確值）。這次一併修掉。

---

## Step 1：建分支

```bash
git checkout main && git pull
git checkout -b session-title-ux
```

## Step 2：側邊欄標題輸入框加清除按鈕

檔案：`SessionItem.tsx`、`useSessionEdit.ts`

- 依 frontend/CLAUDE.md 的優先序（AntD 優先），把原生 `<input>` 換成 AntD `<Input allowClear size="small" />`。
- `useSessionEdit.ts` 的 `editInputRef` 型別從 `RefObject<HTMLInputElement>` 改成 AntD 的 `RefObject<InputRef>`（`import type { InputRef } from "antd"`）；`focus()` 用法不變。
- 保留現有行為：Enter 確認、Escape 取消、`editSaving` 時 disabled、`onClick stopPropagation`。AntD Input 的 `onKeyDown` 直接沿用。
- 樣式：維持現在的窄小外觀（`className` 調整 padding / 字級即可），不要引入新色票。
- ⚠️ WCAG 檢查：AntD `allowClear` 的預設清除 icon 是 `rgba(0,0,0,0.25)`，對比不到 3:1。需在 `src/index.css` 加一條 plain-CSS 覆寫（比照 `.btn-accent` 模式），把 `.anticon-close-circle` 提高到可過 3:1 的顏色（如 `--text-muted` #5f6b77），並在渲染結果驗證 computed style。

## Step 3：修 reducer 的標題覆寫 bug

檔案：`translationContext.tsx`

- `set_text` 與 `set_ocr_text` 兩個 case：當 `currentSession` 存在時，**保留原本的 `title`**，不再用 `buildSessionTitle(action.payload)` 重算。
  - 理由：`currentSession` 非 null 代表已存檔、標題已由後端決定（首次存檔時後端 `build_session_title` 產生，或使用者已自訂）。本地重算只會造成畫面短暫錯誤。
  - 新 session（`currentSession === null`）不受影響，標題仍在首次存檔時由後端產生。
- `buildSessionTitle` 若因此不再被使用，連同一起刪除（先確認無其他呼叫點）。

## Step 4：主區顯示 + 可編輯標題

新檔案：`frontend/src/components/MainSection/SessionTitleBar.tsx`

- 顯示條件：`mainView === "translate"` 且 `state.currentSession` 存在（亦即翻譯已成功存檔，或從側邊欄載入了 session）。放在 `MainSection/index.tsx` 卡片內、`<AppTextarea />` 上方。
- 顯示模式：標題文字 + 編輯 icon（比照 `SessionItem.tsx` 的 `EditOutlined` 樣式；觸控裝置常駐顯示、桌面 hover 顯示的既有 pattern）。
- 編輯模式：AntD `<Input allowClear />` + 確認（勾）/取消（×）按鈕，行為與側邊欄一致：
  - Enter 確認、Escape 取消。
  - 確認時：trim 後若為空或與原值相同 → 視同取消；否則呼叫 `updateSessionTitle(sessionId, title)`，成功後 `dispatch update_current_session_title`。
  - 儲存中 disabled + loading。
- 建議把「編輯標題」的共用邏輯抽成 hook（可把 `useSessionEdit` 一般化，或新增 `useTitleEdit`），避免側邊欄與主區兩份重複的 confirm/cancel 邏輯。
- 無障礙：編輯按鈕要有 `aria-label`；標題本體用語意化元素（如 `<h2>`，沿用 `--font-heading`）。

## Step 5：側邊欄清單同步

檔案：`useSessionHistory.ts`、`SessionTitleBar.tsx`（或共用 hook）

- 現況：側邊欄清單只在面板打開與手動 refresh 時重抓（`useSessionHistory.ts:42-46` 刻意不跟 autosave 連動）。主區改標題後，若側邊欄已開著，清單會是舊標題。
- 作法：主區編輯成功後 `window.dispatchEvent(new CustomEvent("ne:session-title-updated", { detail: { sessionId, title, updatedAt } }))`；`useSessionHistory` 加 listener，只就地更新該筆 row（不重抓、不重排，符合既有「local edits update their own row」的設計註解）。
- 反向（側邊欄改標題 → 主區）：`useSessionEdit.confirmEdit` 成功後，若改的是 `currentSession.id`，同步 `dispatch update_current_session_title`。側邊欄能拿到 dispatch（`AppSidebar` 在 `TranslationProvider` 內），用 `useTranslation()` 即可。

## Step 6：驗證（依 CLAUDE.md「verify before claiming fixed」）

- 用 `frontend:verify` skill 以 headless browser 驗證：
  1. 翻譯一段新文字 → 主區出現標題（後端產生的首行標題）。
  2. 主區改標題 → 重新整理後仍是新標題；側邊欄清單即時同步。
  3. 側邊欄改標題 → 主區標題同步。
  4. 編輯內文再存檔 → 自訂標題**不會**被蓋掉（Step 3 的回歸驗證）。
  5. 清除按鈕：側欄與主區輸入框都能一鍵清空；清空後按確認視同取消。
  6. 切換 / 新建 session 時主區標題正確更新（注意 CLAUDE.md 記載的 view-state 回歸：切換 session 必須重設主區視圖）。
- 行動版寬度檢查：標題列不得溢出、不得與 AppTextarea 重疊。
- 對比檢查：清除 icon、編輯 icon 的 computed color ≥ 3:1。
- `npm run type-check` 通過。

## 不做的事

- 不改後端（既有 `PATCH /sessions/{id}/title` 已足夠）。
- 不做標題自動 AI 命名（範圍外）。
- 唯讀分享頁（SharedView）不加編輯入口。
