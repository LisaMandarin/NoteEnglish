# SEO 改善計畫（SEO Improvement Plan）

> 建立日期：2026-08-01
> 前置：[landing-page-plan.md](./landing-page-plan.md)、[landing-animation-plan.md](./landing-animation-plan.md)（PR #18）
> 狀態：**Step 1 已完成（2026-08-01）**，Step 2–3 現在就能做，Step 4 要等 domain。
> 執行方式：一次一步，做完驗證再進下一步。

---

## 現況盤點（2026-08-01 實測，不是推測）

**靜態 HTML（`frontend/index.html`）**

| 項目 | 現況 | 判定 |
|---|---|---|
| `lang="zh-TW"` | 有（`index.html:2`） | OK |
| `<title>` | `句句通`（`index.html:28`） | **只有品牌名，權重最高的欄位被浪費** |
| `meta description` | 47 個全形字（`index.html:29-32`） | OK（中文約 70–80 字截斷） |
| `og:type` / `og:site_name` / `og:title` / `og:description` | 有（`index.html:33-39`） | OK |
| `og:image` | ~~完全沒有這個標籤~~ → **Step 1 已補上** | 已修 |
| `twitter:card` | `summary_large_image`（原 `index.html:40`） | ~~沒有圖 → 失效~~ → 已隨 Step 1 生效 |
| `og:url` / canonical | 無 | 等 domain（Step 4） |
| JSON-LD 結構化資料 | 0 個 | 缺 |

**其他事實**

- `frontend/public/og-image.png` **檔案存在且尺寸正確（1200×630）**，只是沒有任何標籤引用它。圖產了沒接上。
- `frontend/public/robots.txt` 已擋掉 `/*?view=`、`/*?shared=`、`/*?profile=`、`/admin-dashboard`。
- `vercel.json` 是 SPA rewrite（全導向 `index.html`），`/robots.txt` 等 `public/` 靜態檔仍正常提供。
- 渲染後的 landing page（行動版 412px 視窗實測）：
  - 全頁純文字 **336 字元**（中文 251 字）→ thin content
  - `<h1>` × 1（`句句通`，`LandingPage.tsx:23`）、`<h2>` × 2（`怎麼使用`、`關於示範帳號`）、`<h3>` × 0
  - 4 段步驟說明中有 **3 段在行動版是 `display: none`**（DOM 裡還在，共 84 字元）
  - 站內連結只有 4 條，全部指向 `?view=login` 的變形
- CSR SPA：內容全靠 JS 渲染。Googlebot 會執行 JS（第二波渲染，較慢且不保證）；Bing、LINE、Facebook、X 的爬蟲基本不執行 → **description 與 OG 標籤在靜態 HTML 裡所以分享預覽不受影響，但頁面「內容」實際上只有 Google 有機會索引。**
- landing 位於 `App.tsx:220` 的 `authReady` gate 之後，但 `supabase.auth.getSession()` 對沒有 session 的訪客是讀 localStorage、不發網路請求（`App.tsx:167-183`），所以爬蟲不會卡在 "Loading account..."。**低風險，這次不動。**

---

## Step 1：補上 `og:image` — ✅ 已完成（2026-08-01）

檔案：`frontend/index.html`

正式網址：**https://note-english.vercel.app/**（Lisa 提供；此前專案裡沒有任何地方記錄）

已加入的標籤：

```html
<meta property="og:image" content="https://note-english.vercel.app/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="句句通－英文文章逐句翻譯與句構分析" />
```

- ⚠️ **必須是絕對網址**，相對路徑 `/og-image.png` 對 scraper 等於沒寫。買 domain 後這一行要換（Step 4）。
- PNG 而非 webp 是刻意的：LINE 的爬蟲不支援 webp，而 LINE 是台灣主要分享管道。

**已驗證**：`npm run build` 後 `dist/index.html` 十個 meta 標籤全部完整輸出，
`dist/og-image.png`（41 KB）與 `dist/robots.txt` 都有進 build。
另外確認 `vercel.json` 的 SPA rewrite **不會**攔截 `public/` 靜態檔——
production 上 `/logo.webp` 正常回 `image/webp`。

**尚待部署後驗證**（本機 localhost 做不到，scraper 連不到）：
- `https://note-english.vercel.app/og-image.png` 目前回 `text/html`，因為 og-image.png 還在
  `landing-page` 分支（PR #18）、production 仍是 `main`。**合併部署後要重新確認回的是 `image/png`。**
- 用 Facebook Sharing Debugger 與 LINE 實際貼一次連結，確認縮圖出得來。

## Step 2：改寫 `<title>` 與 `<h1>` 文案

目前兩個都只有「句句通」。沒有人會搜一個剛上線的品牌名，所以只能靠功能詞被找到，
但「逐句翻譯」「句構分析」「單字卡」這些詞在 title 和 h1 裡一個都沒有。

**待 Lisa 拍板的候選（Google 中文標題約 28–30 全形字截斷）**：

| # | `<title>` 候選 | 字數 |
|---|---|---|
| A | 句句通｜英文文章逐句翻譯與句構分析 | 17 |
| B | 句句通｜AI 英文逐句翻譯、句構分析、單字卡 | 21 |
| C | 句句通 - 讀懂英文長句的逐句翻譯與單字卡工具 | 21 |

`<h1>`（`LandingPage.tsx:23`）建議從純品牌名改成帶價值主張的一句，例如
**「句句通－讀懂英文長句」**，或把現有副標升級成 h1。
⚠️ **這會動到 hero 的視覺**，改法要先確認：是換 h1 文字，還是保留大字「句句通」但把副標包進 h1。

同時可補的（不影響視覺）：
- `<meta property="og:title">` 目前也只有「句句通」，跟著一起改成與 title 一致。
- 步驟字幕的四個標題目前是 `<span>`，可以改成 `<h3>`，讓 heading 階層更完整（h1 → h2 → h3）。

## Step 3：加 JSON-LD 結構化資料

檔案：`frontend/index.html`（放靜態 HTML 裡，不要用 JS 注入——非 Google 爬蟲讀得到）

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "句句通",
  "applicationCategory": "EducationalApplication",
  "inLanguage": "zh-TW",
  "description": "…（與 meta description 一致）",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "TWD" }
}
</script>
```

- `url` 欄位等 domain 再補（Step 4）。
- **驗證**：Google Rich Results Test 或 Schema Markup Validator 貼上部署後的網址。

## Step 4：買到 domain 之後（現在做不了）

1. `og:url` 與 `<link rel="canonical">` 填正式網址。
2. Step 1 的 `og:image` 絕對網址換成正式 domain。
3. 新增 `frontend/public/sitemap.xml`（目前只有首頁一個 URL，內容很短），
   並在 `robots.txt` 末尾加 `Sitemap: https://<domain>/sitemap.xml`。
4. 到 Google Search Console 驗證網域並提交 sitemap；Bing Webmaster Tools 同理。
5. ⚠️ **時機考量**：現在的網址是 `*.vercel.app`，若在換 domain 前就被索引，換域名等於重來一次
   （舊網址無法設 301）。**建議 Step 4 之前不要主動提交 Search Console。**

## 之後才考慮（本計畫範圍外）

- **內容頁**：336 字元的單頁不可能在任何有競爭的字詞上排名。真的要自然流量，需要實質內容
  （英文文法主題頁、用法教學、範例文章解析）。這是另一個等級的投入，要另外決定。
- **Prerender / SSG**：能讓非 Google 爬蟲也讀得到內容。記憶檔 `hosting-decision-render-paid`
  記載已否決 Next.js 遷移，所以若要做應該選 `vite-plugin-prerender` 之類的靜態預渲染，不是換框架。
- **行動優先索引 vs 收合字幕**：Googlebot 以行動版視窗抓取，`index.css` 的
  `@media (max-width: 1023px)` 讓 3 段步驟說明變 `display: none`（DOM 裡還在）。
  Google 會索引隱藏文字但權重打折。**只影響 84 個字元，不值得為此改掉行動版體驗**——記錄備查即可。
- **效能**：Google Fonts 的 stylesheet 是 render-blocking，吃 LCP。要處理的話是自架字型或
  `media="print" onload` 的非阻塞載入法。

## 不做的事

- 不改後端。
- 不為了 SEO 破壞 `?shared=` / `?profile=` 的動線（robots.txt 擋掉它們是刻意的，私人內容不該被索引）。
- 不引入 Next.js（已否決）。
