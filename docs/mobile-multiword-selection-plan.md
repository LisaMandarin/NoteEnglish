# 行動裝置多字選取計畫（Mobile Multi-word Selection Plan）

> 建立日期：2026-07-15
> 分支：`mobile-multiword-selection`（從 `main` 切出）
> 執行方式：依步驟順序執行，每一步完成並驗證後再進下一步。

---

## 問題描述

手機／平板上目前只能點選單一單字查詢。想選多個字（片語）時，長按會叫出瀏覽器原生選取選單（iOS 放大鏡＋複製列、Android CAB），蓋掉自訂的查單字選單。

## 現況盤點（已確認的程式事實）

- 觸控裝置上原生選取其實已被**整個關掉**：`src/index.css:106-113` 在 `@media (hover:none) and (pointer:coarse)` 下對 `.lookup-original-text` 設了 `user-select: none` + `-webkit-touch-callout: none` + `touch-action: pan-y`。
- 手機的單字選取是自製的：`hooks/useSelectionMenu.ts` 用 `caretPositionFromPoint` / `caretRangeFromPoint`（含 Safari 舊版 fallback）把「點擊座標」轉成文字 offset，再用 `getWordBounds` 找單字邊界，最後以 `selectedHighlight {sentenceIdx, start, end}` 這個字元區間渲染自訂 highlight（`SentenceItem.tsx:21-40 renderOriginalText`）。
- 也就是說：**多字選取需要的所有底層零件都已經在庫裡了**——座標→offset（`getTextPointFromViewport`）、offset→Range（`createRangeFromTextOffsets`）、字界偵測（`getWordBounds`）、自訂 highlight 渲染、選單定位（`getMenuPosition`）。缺的只是「把選取範圍從一個字延伸到多個字」的手勢。
- 桌面版多字選取沒問題（原生 selection + `handleMouseUp`），本計畫完全不動桌面路徑。
- `handleTouchMove` 目前只用來判斷「有移動就當作捲動、放棄選字」（`TOUCH_MOVE_THRESHOLD = 12`）。

## 方案比較

### 方案 A（推薦）：自製選取把手（drag handles）

點一下選中單字後（現有行為），在 highlight 左右兩端渲染兩個可拖曳的把手（模仿原生選取的水滴把手）。拖任一把手時，用現有的 `getTextPointFromViewport` + `getWordBounds` 逐字延伸選取範圍，放開後重新定位查單字選單。

- 優點：符合使用者在手機上的既有直覺（跟原生選字一樣的操作）；全部用現成零件，估 150–200 行；不加任何依賴。
- 缺點：把手的定位與拖曳細節（捲動衝突、行首行尾）需要仔細處理。

### 方案 B（備案，最簡單）：點頭點尾

點第一個字開啟選單後，選單上加「選取更多」；進入延伸模式後再點同句的另一個字，兩字之間整段成為選取範圍。

- 優點：不到 50 行、零手勢衝突。
- 缺點：不直覺，需要 UI 提示；跨兩步操作。可作為 A 的降級備案或加值捷徑。

### 方案 C：導入開源套件（不推薦）

- [jquery-custom-selection](https://github.com/michalstocki/jquery-custom-selection)——正是為「觸控裝置上覆蓋原生選取、避免 iOS/Android 原生選單」而生，含把手實作。但基於 jQuery、約十年未維護，**只適合當實作參考（prior art），不適合引入**。
- [recogito/text-annotator-js](https://github.com/recogito/text-annotator-js)——有維護的標註套件，但以 annotation 資料模型為中心，導入等於重寫整套自製選取層，整合成本高於自寫。
- [iDoRecall/selection-menu](https://github.com/iDoRecall/selection-menu)——桌面取向，解決不了行動端原生選單問題。

結論：**採方案 A**。自家程式已具備所有 primitives，套件反而是負擔；jquery-custom-selection 可開著當把手互動細節的參考。

---

## Step 1：建分支

```bash
git checkout main && git pull
git checkout -b mobile-multiword-selection
```

## Step 2：狀態模型從「單字」擴為「範圍」

檔案：`useSelectionMenu.ts`

- `SelectionHighlight` 已是 `{sentenceIdx, start, end}` 字元區間，直接沿用。
- 新增內部狀態：`dragging: "start" | "end" | null`（正在拖哪個把手）。
- 抽出共用函式 `applyRange(textEl, sentenceIdx, start, end)`：設定 highlight、`vocab.setSelectedText(textEl.textContent.slice(start, end).trim())`、`vocab.setSelectedSentenceIdx`、更新選單位置。現有 `selectWordAtPoint` 改為呼叫它。
- 查詞 API 已支援多字片語（桌面版本來就會送 `sel.toString()` 的多字內容），不需動後端。

## Step 3：把手元件與渲染

檔案：`SentenceItem.tsx`（或新檔 `Translations/SelectionHandles.tsx`）

- `renderOriginalText` 的 `.lookup-selected-word` span 前後各渲染一個把手元素（inline `<span>` 定位，或以 `getBoundingClientRect` 用 fixed 定位渲染在 overlay——建議後者，避免影響文字排版）。
- 把手樣式進 `src/index.css`：圓點＋短柄，顏色用 `--accent`，尺寸 ≥ 20px 觸控目標（實際可見小一點、用透明 padding 擴大熱區）。
- 把手設 `touch-action: none`（只有把手上禁捲動，句子本身維持 `pan-y`，不影響正常捲動）。
- 只在觸控選取（`selectedHighlight` 非 null）時渲染；桌面滑鼠路徑不渲染把手。
- 把手屬純裝飾控制項：`aria-hidden="true"`（選取結果本身已由選單呈現）。

## Step 4：拖曳邏輯

檔案：`useSelectionMenu.ts`

- 把手 `onTouchStart`：記下拖的是哪端（start/end），`preventDefault`。
- `onTouchMove`：
  1. `getTextPointFromViewport(clientX, clientY)` 取得目前手指下的文字位置；
  2. 限制在**同一句**（`closest("li[data-idx]")` 的 `data-idx` 必須等於 `selectedHighlight.sentenceIdx`，超出句子邊界時 clamp 到句首/句尾）；
  3. 用 `getWordBounds` 對齊到字界（逐「字」延伸，不逐字元）；
  4. 若 start 拖過 end（或反之）則交換角色（原生選取的行為）；
  5. 即時更新 `selectedHighlight`（highlight 跟手）。拖曳期間可暫時隱藏選單，避免遮擋。
- `onTouchEnd`：呼叫 `applyRange` 定案，重新計算選單位置並顯示，更新 `lastTouchLookupAtRef`（沿用既有的滑鼠事件抑制機制）。
- 效能：`touchmove` 內做 rAF throttle（每 frame 最多一次 hit-test）。
- 邊界情形：
  - 拖到非文字區（座標 hit-test 失敗）→ 保持上一個有效範圍，不清空。
  - 跨行拖曳（同句折行）→ `createRangeFromTextOffsets` 本來就支援，highlight 的 `box-decoration-break: clone` 已處理跨行圓角。
  - 點空白處／選單外 → 既有 `closeMenu` 行為不變，把手一併消失。

## Step 5：（可選）加上方案 B 當捷徑

- 選單開著時，點同句另一個字：目前行為是重新選取新單字。可改為在選單加一顆小按鈕「延伸選取到下一次點擊」。此步為可選，先出 A 收集使用回饋再決定。

## Step 6：驗證

- `frontend:verify` skill（headless、touch emulation）：
  1. 點單字 → 單字選取與選單（既有行為回歸）。
  2. 拖右把手到後面第三個字 → highlight 逐字延伸、選單顯示片語。
  3. 查詢片語 → vocab 卡片正確建立。
  4. 拖把手越過另一端 → 角色交換。
  5. 頁面垂直捲動不受影響（手指放在句子文字上仍可捲動）。
- **真機驗證（必要）**：iOS Safari（含 <18.4 的 `caretRangeFromPoint` fallback 路徑）與 Android Chrome 各測一輪——確認拖曳把手時不會觸發原生放大鏡／選單、不會誤觸 double-tap zoom。headless 模擬不能取代這步。
- 對比檢查：把手顏色（`--accent`）對白底 ≥ 3:1。
- `npm run type-check` 通過。

## 不做的事

- 不動桌面滑鼠選取路徑（`handleMouseUp`）。
- 不支援跨句選取（查單字以句為上下文，跨句無意義；拖到句外一律 clamp）。
- 不引入新依賴。
