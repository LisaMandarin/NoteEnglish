# Landing Page 操作動畫計畫（Landing Animation Plan）

> 建立日期：2026-08-01
> 分支：`landing-page`（延續 [landing-page-plan.md](./landing-page-plan.md)）
> 決策：Lisa 於 2026-08-01 確認——**動畫形式選 A（手刻假 UI）**、**卡片文字選 A（改成同步字幕清單）**

---

## 目標

把 `LandingPage.tsx` 現有的四張靜態功能卡片，換成一段「**演給你看怎麼用**」的動畫：
一個假的 App 視窗，自動演示「貼上文章 → 逐句翻譯 → 點字建卡 → 拆解句構」的操作流程，
旁邊配一組會跟著高亮的步驟字幕。

## 為什麼是手刻假 UI（不是錄影 / GIF / Lottie）

| 方案 | 否決理由 |
|---|---|
| 錄影 / GIF | 2–5 MB 拖慢首屏；UI 一改就過期，等於多一份要維護的二進位資產 |
| 真實截圖輪播 | 要人工重拍、UI 改版就失真、檔案仍偏大 |
| Lottie | 要新依賴 + After Effects 產出管線，本專案沒有 |
| **手刻假 UI（採用）** | 零新依賴、用現有 `:root` token 上色、RWD 可控、文字是真 DOM（SEO / 螢幕閱讀器讀得到） |

**刻意做成「抽象示意」而非像素級複製真 UI**——目的是傳達操作流程，不是當截圖用。
這樣真 App 改版時不會立刻穿幫，維護成本最低。

## 為什麼字幕清單要留（不是純動畫）

四張卡片的文案是這個 CSR SPA 上唯一的實質可索引內容（見 landing-page-plan.md Step 5 的已知限制）。
純動畫 = SEO 歸零 + 螢幕閱讀器只剩標題。
所以文字**移位不刪除**：變成動畫旁的步驟字幕，跟動畫同步高亮、可點擊跳步。
順帶解掉 WCAG 2.2.2 的「自動播放需可控制」要求。

---

## 分鏡（4 步循環，約 17 秒）

示範文本（固定兩句，短到手機不會爆版）：

1. `Reading in English feels hard at first.` → 一開始讀英文會覺得很吃力。
2. `But the sentences that look long are often simple ideas joined together.` → 但那些看起來很長的句子，其實常常只是簡單的想法組合在一起。

| # | 步驟標題 | 假 UI 演什麼 |
|---|---|---|
| 1 | 貼上英文文章 | 輸入框出現打字機游標，逐字打出上面兩句；打完後「翻譯」按鈕跳出按壓 + 漣漪 |
| 2 | 逐句對照閱讀 | 兩列句子依序浮現：`--accent` 圓形編號徽章 + 英文，中文翻譯隨後淡入 |
| 3 | 點選單字建立單字卡 | 假游標滑向 `joined`，該字套 `.lookup-selected-word` 樣式反白，右側滑入單字卡（`join` / VERB / 中譯 / 例句 / 熟練度圓點） |
| 4 | 拆解句子結構 | 句子切成三段有色底線 + `S` / `V` / `SC` 標籤（`--c-subj` / `--c-pred` / `--c-pp`），最後浮出 `SVC` 句型徽章 |

視覺對應真 App 的既有樣式：
`SentenceItem.tsx:155` 的編號徽章、`.lookup-selected-word`（`index.css:73`）、
`VocabCards.tsx` 的卡片版型、`SentenceSkeleton` 的 slot 底線 + 角色標籤。

## 版面

- 桌機：兩欄——**左為步驟字幕、右為假 UI 視窗**（視窗較寬，是視覺主角）。
- 手機：假 UI 視窗在上、字幕清單在下（DOM 順序即 [視窗, 字幕]，桌機用 `lg:order-*` 對調）。
- 假 UI 視窗給固定 `min-height`，避免四步內容高度不同造成版面跳動。
- **`lg` 以下只有作用中那一步展開說明**，其餘只留標題（2026-08-01 追加，Lisa 確認）——
  四段說明全開會讓手機版要捲兩屏才看完。同時把 `:hover` 樣式包進 `@media (hover: hover)`，
  否則觸控點擊後那一列會卡在 hover 底色，看起來像有兩個作用中步驟。

## 無障礙與效能（frontend/CLAUDE.md 硬性要求）

- **WCAG 2.2.2**：提供暫停 / 播放按鈕（`aria-label`），且步驟字幕本身是 `<button>`，可手動跳步。
- **`prefers-reduced-motion: reduce`**：不自動播放、所有 keyframes 關閉、直接顯示每步的最終畫面（打字機直接顯示全文）。這是 `index.css` 第一次處理這個 media query。
- 假 UI 整塊 `aria-hidden="true"`（裝飾），語意由字幕清單承擔，避免螢幕閱讀器被不斷變動的假畫面洗版。
- 目前步驟以 `aria-current="step"` 標示，不用 tab 語意（面板是裝飾性的，tablist 會誤導）。
- 只動畫 `transform` / `opacity`；`IntersectionObserver` 離開視窗即暫停，`visibilitychange` 分頁隱藏也暫停。
- 觸控裝置（`hover: none` / `pointer: coarse`）不顯示假滑鼠游標，只留點擊漣漪。
- 字幕文字沿用已知安全色（`--text-main` / `text-black/65`），不得用 `text-black/55` 以下。
- 行動版寬度不得水平溢出（CLAUDE.md 記載的重複回歸）。

## 檔案異動

| 檔案 | 內容 |
|---|---|
| `frontend/src/components/Landing/HowItWorks.tsx` | 新檔：假 UI 舞台 + 步驟字幕 + 播放控制 |
| `frontend/src/index.css` | 新增 `lp-*` keyframes / 樣式區塊 + `prefers-reduced-motion` 降級 |
| `frontend/src/components/Landing/LandingPage.tsx` | 移除 `FEATURES` 卡片區，改掛 `<HowItWorks />` |

**測驗 / 朗讀 / 列印 / 分享**這兩張卡的內容不在操作動畫的主線裡，
改成動畫下方一行補充文字保留（不做成卡片），避免功能介紹整段消失。

## 驗證（`frontend:verify`）

1. 桌機寬度：四步依序播放並循環；字幕跟著高亮、進度條走完才換步。
2. 點字幕跳步 → 動畫立即重播該步。
3. 暫停鍵 → 動畫與進度條同時停住；再按恢復。
4. 捲出視窗 → 暫停；捲回 → 繼續。
5. 模擬 `prefers-reduced-motion: reduce` → 不自動播放、無動畫，畫面仍看得懂。
6. 行動版寬度（375px）：不水平溢出、視窗不變形、字幕在下方。
7. 對比檢查：字幕標題 / 說明、暫停鍵 icon ≥ 4.5:1（icon ≥ 3:1）。
8. `npm run type-check` 通過。

## 驗證結果（2026-08-01，Playwright headless）

全部通過：四步自動循環與字幕同步、點字幕跳步、暫停/播放（JS timer 與 CSS 進度條同時凍結）、
捲出視窗暫停、捲回續播、`reducedMotion: reduce` 不自動播放且打字機直接顯示全文、
375px 無水平溢出、觸控裝置假游標 `display: none`、對比全部 ≥ 4.5:1（最低 4.73，作用中字幕說明文）、
`npm run type-check` 通過。

驗證過程中抓到兩個真 bug，已修（成因寫在程式碼註解裡）：

1. **`animation-fill-mode: both` + 長 delay = 提前顯示**：漣漪在等待期間就把 keyframe 起始狀態
   （不透明白色圓點）畫在按鈕上。所有帶 delay 的動畫一律改用 `forwards`。
2. **`entry.isIntersecting` 不等於「看得到夠多」**：只要 1px 進入視窗就是 `true`，`threshold`
   只決定 callback 何時觸發。改用 `entry.intersectionRatio >= 0.25` 才真的會在捲出時暫停。

另有一個排序陷阱：`.lp-paused *` 必須放在所有設定 `animation` 簡寫的規則**之後**——
簡寫會把 `animation-play-state` 重設為 `running`，同權重下寫在前面就會失效。

## 不做的事

- 不引入動畫函式庫（framer-motion / GSAP / Lottie）。
- 不改後端、不改真正的 App UI——只在 landing page 內做示意。
- 不做像素級復刻真畫面。
