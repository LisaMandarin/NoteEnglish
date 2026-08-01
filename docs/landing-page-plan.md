# 獨立 Landing Page 計畫（Landing Page Plan）

> 建立日期：2026-07-17
> 分支：`landing-page`（從 `main` 切出）— **尚未開始實作，實作時第一步先開分支**
> 執行方式：依步驟順序執行，每一步完成並驗證後再進下一步。

---

## 目標

1. 未登入的訪客造訪首頁時，看到的是**產品介紹頁**（landing page），而不是登入表單。
2. 訪客三秒內知道「句句通」是什麼：貼上英文文章 → AI 逐句翻譯、解析句構、建立單字卡。
3. 登入 / 註冊移到 `?view=login`，由 landing page 的 CTA 進入。
4. 順帶補上 code 層的 SEO 標籤（meta description、Open Graph、robots.txt）——首頁從「一張登入卡」變成有實質內容的介紹頁，SEO 才有東西可索引。

## 現況盤點（已確認的程式事實）

- **路由方式**：`App.tsx:139` 用 `new URLSearchParams(window.location.search)` 做 query-param 分流，沒有 react-router。既有的 view：`?view=summary`、`?view=vocab-print`、`?view=reset-password`、`?shared={token}`、`?profile={id}`，以及 pathname `/admin-dashboard`。新的 landing 沿用同一套 query-param 慣例，不引入 router。
- **登入 gate 在 `App.tsx:219-222`**：`if (!user) return <LoginPage />;`
- ⚠️ **最關鍵的既有行為**（`App.tsx:220-221` 的註解明講）：分享連結 `?shared=` 的未登入訪客也是落在這個 gate。因為登入「不會導頁」，query string 得以保留，登入後下一次 render 就直接落到 `SharedView`。**landing page 絕對不能攔截這條動線**——若 landing 的 CTA 導向 `?view=login`，`?shared=token` 會被洗掉，分享連結就壞了。這是本計畫最大的回歸風險。
- `LoginPage.tsx` 目前是單張置中卡片：標題「句句通」+ 一句副標 + 示範帳號區塊（`testuser@example.com` / `test1234`，`LoginPage.tsx:6-9`）+ 表單，三種 mode（`sign_in` / `sign_up` / `forgot_password`）。
- 忘記密碼的 redirect 用 `${window.location.origin}${window.location.pathname}?view=reset-password`（`LoginPage.tsx:150`）——**只帶 pathname，不帶 query**，所以新增 `?view=login` 不影響重設密碼動線。
- **可直接參考的樣式範本**：`MainSection/HomeDashboard.tsx` 已有 hero（`text-4xl sm:text-5xl` 標題 + `tracking-[0.24em]` 的 accent 小標）、大 CTA 按鈕（`border-(--card-border) bg-(--card-border)` 深底白字）、卡片列表等 pattern。landing page 直接沿用這套視覺語言，不要另創一套。
- `frontend/public/logo.webp` 已存在，可用於 hero 與 OG image。
- `vercel.json` 是 SPA rewrite（全部導向 `index.html`），`/` 正常運作，不需改動。
- `index.html` 目前只有 `<title>句句通</title>`，**沒有 meta description、沒有 OG tags**。`<meta name="google" content="notranslate">`（`index.html:6`）只是抑制翻譯提示，不影響索引，保留。

---

## Step 1：建分支

```bash
git checkout main && git pull
git checkout -b landing-page
```

## Step 2：路由分流（App.tsx）

在 `App.tsx:219` 的 `if (!user)` 區塊內做分流，**順序很重要**：

```
if (!user) {
  // 分享連結 / 個人檔案連結的訪客：直接進登入頁，跳過 landing。
  // 導頁會洗掉 ?shared= / ?profile=，登入後就回不到目標頁。
  if (sharedToken || profileId) return <LoginPage />;
  if (params.get("view") === "login") return <LoginPage />;
  return <LandingPage />;
}
```

- 新增 `const isLoginView = params.get("view") === "login";`，與其他 `params.get` 放在一起（`App.tsx:139-145`）。
- **已登入時殘留的 `?view=login`**：登入成功後 `user` 出現，會往下落到 `MainPage`，但網址列還留著 `?view=login`（可能連帶 `demo=1` / `mode=signup`）。在 `MainPage` mount 時（或 App 的 auth effect 內）用 `history.replaceState` 清掉。**清法：只從 URLSearchParams 移除 `view`、`demo`、`mode` 三個 key，保留其餘 params 重組網址**——不要用「沒有其他 query param 才清」的全有全無條件，否則 `?view=login&demo=1` 永遠清不掉，也不會誤殺 `?shared=`。
- landing page 位於 `authReady` gate（`App.tsx:200`）**之後**：訪客仍會先看到 "Loading account..." 一瞬間。可接受，但若想讓 landing 首屏更快（SEO 有利），可考慮把 landing 判斷提到 gate 之前——`?view=login` 以外的無參數首頁，不需要等 auth 就能渲染。**建議這樣做**，但需確認已登入用戶不會閃一下 landing（用 `authReady === false && !isLoginView && !sharedToken` 條件時，已登入者會先看到 landing 再跳走 → 會閃）。**取捨：保持在 gate 之後，接受 loading 一瞬間；首屏效能不是現階段瓶頸。**

## Step 3：LandingPage 元件

新檔案：`frontend/src/components/Landing/LandingPage.tsx`

版面（單欄、由上到下，行動優先）：

1. **極簡頁首**：`logo.webp` + 「句句通」，右側「登入 / 註冊」文字按鈕 → `?view=login`。
2. **Hero**：
   - 主標（`<h1>`，`--font-heading`）：**句句通**
   - 副標（草稿，待 Lisa 確認文案）：**貼上英文文章，AI 幫你逐句翻譯、解析句構、自動建立單字卡。**
   - 補充一句：適合想讀懂原文文章、但卡在長句與生字的英文學習者。
   - 主 CTA：「免費註冊，開始使用」→ `?view=login`（進註冊 mode，見 Step 4）
   - 次 CTA：示範帳號入口 → `?view=login&demo=1`。⚠️ **文案與行為要一致**（待 Lisa 確認第 4 題）：若 `demo=1` 只自動填帳密、仍需按登入，文案用「查看示範帳號」；若寫「直接體驗」，`demo=1` 就該自動 `signInWithPassword` 登入。
3. **功能卡片區**（3–4 張，沿用 HomeDashboard 的卡片樣式 + AntD icons）：
   - 逐句翻譯與句構分析——每個句子都有中文翻譯與文法結構拆解
   - 點選單字建立單字卡——自動查詞性、例句與中文翻譯
   - 測驗檢視學習成效——文章理解與單字測驗，附熟練度標記
   - 朗讀、列印、分享——真人語音朗讀，筆記可列印或分享給他人
   （文案待確認；icon 建議 `ReadOutlined` / `BookOutlined` / `FileDoneOutlined` / `SoundOutlined`）
4. **示範帳號說明區**：沿用 LoginPage 現有的公開帳號警語（`LoginPage.tsx:217-219`），提醒示範帳號內容公開。
5. **Footer**：沿用 `App.tsx:126-129` 的 footer（© 年份 + Created by Min-ting (Lisa) Chuang）。**建議抽成共用元件** `components/shared/SiteFooter.tsx`，讓 landing 與 MainPage 共用，不要複製貼上。

實作注意：

- 遵守 `frontend/CLAUDE.md`：AntD 優先 → Tailwind（`bg-(--card-bg)` 語法）→ plain CSS；顏色一律用 `:root` token，不寫死 hex。
- 導頁用 `<a href="?view=login">` 而非 `<button onClick>`：真連結對 SEO 與無障礙都比較好，且 SPA rewrite 下 full reload 是可接受的（landing → login 本來就是換頁）。
- 無障礙（W3C 是硬性要求）：語意化 `<header>` / `<main>` / `<section>` / `<footer>`，`<h1>` 只有一個；裝飾 icon 加 `aria-hidden="true"`；CTA 對比 ≥ 4.5:1（深底白字沿用 `.btn-accent` 或 HomeDashboard 的 `bg-(--card-border)` 模式，這兩個已知安全）。

## Step 4：LoginPage 調整

檔案：`LoginPage.tsx`

- **加「← 返回首頁」連結**（`<a href="/">`），放在卡片標題上方或 footer 位置。
- **`?view=login&demo=1`**：mount 時讀 `demo` 參數，若為 `1` 則自動呼叫現有的 `fillDemoCredentials()`（`LoginPage.tsx:90-94`）並捲到表單；或依 Lisa 確認第 4 題改成直接自動登入。不新增狀態，重用既有函式。
- **`?view=login&mode=signup`**（可選）：讓 landing 的主 CTA 直接落在註冊 mode，`useState("sign_in")` 的初始值改為讀 param。若覺得多餘可省略，先做 `demo=1` 即可。
- **示範帳號區塊先保留**：landing 有介紹、登入頁也有，重複但無害。等看到實際使用情況再決定要不要精簡。
- **順帶修：註冊成功沒有任何訊息**（`LoginPage.tsx:173-176`）——signUp 成功後靜默切回 sign_in mode，新用戶不知道該去收驗證信還是直接登入。landing 上線後註冊流量會變多，順手加一行 `successMessage`（例如「帳號已建立，請至信箱完成驗證後登入」，依 Supabase 是否開啟 email confirmation 決定文案）。

## Step 5：SEO 標籤（同分支一併做）

檔案：`frontend/index.html`、新檔 `frontend/public/robots.txt`

- `<meta name="description" content="...">`——一句話說明產品，與 hero 副標一致。**中文在搜尋結果約 70–80 個全形字就截斷，文案抓 50–70 字**（80–120 字元是英文的標準，不適用）。
- Open Graph：`og:title`、`og:description`、`og:type=website`、`og:site_name`。Twitter card：`twitter:card=summary_large_image`。
  - ⚠️ **`og:image` 必須是絕對網址**——相對路徑 `/logo.webp` 對 scraper 等於沒寫。先用現有的 `*.vercel.app` 網址填絕對路徑，買了 domain 再換。
  - ⚠️ **不要直接拿 logo.webp 當 OG 圖**：LINE 的爬蟲不支援 webp（台灣使用者主要分享管道），且 OG 建議尺寸為 1200×630。**產一張 PNG/JPG 的 `public/og-image.png`（1200×630）**，可以是 logo + 標語的簡單構圖。
  - ⚠️ **`og:url` 與 sitemap.xml 需要正式 domain，這一步先不做**（domain 未購買）。買了 domain 之後再補 `og:url`、`sitemap.xml`、canonical link，更新 `og:image` 絕對網址，並提交 Search Console。
- `public/robots.txt`：允許索引首頁，擋掉私人與衍生內容。query param 要用萬用字元寫法（Googlebot / Bingbot 支援 `*`，小眾爬蟲未必，可接受）。預期內容：

  ```
  User-agent: *
  Allow: /$
  Disallow: /*?view=
  Disallow: /*?shared=
  Disallow: /*?profile=
  Disallow: /admin-dashboard
  ```

  （`?view=` 一條擋掉 summary / vocab-print / reset-password / login——登入頁沒有索引價值，一起擋。）
- ⚠️ **已知限制**：這是 React CSR SPA，landing 的內容全部靠 JS 渲染。Googlebot 有 JS rendering，但吃得慢也不保證。若之後 SEO 真的要認真做，才需要考慮 prerender / SSG——**本次範圍外**，先把 meta 標籤和實質內容補上。

## Step 6：驗證（依 CLAUDE.md「verify before claiming fixed」）

用 `frontend:verify` skill 以 headless browser 驗證，**不可只憑程式碼改動就回報完成**：

1. 未登入造訪 `/` → 看到 landing page（不是登入表單）。
2. landing 的「登入 / 註冊」與主 CTA → 進入 `?view=login`，表單正常。
3. `?view=login&demo=1` → 示範帳號的 email / password 已自動填入。
4. 登入頁「返回首頁」→ 回到 landing。
5. **回歸（最重要）**：未登入時開 `?shared={有效token}` → 直接看到登入頁（**不是** landing）；登入後直接落在 SharedView，token 沒被洗掉。`?profile={id}` 同樣測一次。
6. 已登入造訪 `/` → 直接進 MainPage，不會看到 landing。
7. 已登入造訪 `?view=login` → 進 MainPage，且網址列的 `?view=login` 已被清掉；**`?view=login&demo=1` 也要測**（demo 也要一併清掉，見 Step 2 的清法）。
8. 忘記密碼寄信 → redirect 仍正確落在 `?view=reset-password`（Step 2 的回歸）。
9. **行動版寬度**：landing 不得水平溢出、不得超出 100vh 造成 footer 重疊（CLAUDE.md 記載的重複回歸）。
10. **對比檢查**：hero CTA、功能卡片文字的 computed color ≥ 4.5:1（icon ≥ 3:1）。注意 antd 的 unlayered button 規則會蓋掉 Tailwind——若用原生 `<button>` 上色，改用 `src/index.css` 的 plain-CSS class。
11. `npm run type-check` 通過。

## 不做的事

- **不改後端**——純前端變更。
- **不引入 react-router**——沿用既有 query-param 分流慣例。
- **不做 prerender / SSG / Next.js 遷移**（記憶檔 `hosting-decision-render-paid` 記載已否決 Next.js）。
- **不買 domain、不做 sitemap.xml / canonical / Search Console 提交**——等 domain 到位再開一個小任務處理。
- **不改動 SharedView / ProfileView 本身**，只確保它們的登入動線不被 landing 攔截。

## 待 Lisa 確認

1. **Hero 副標文案**：「貼上英文文章，AI 幫你逐句翻譯、解析句構、自動建立單字卡。」可用嗎？
2. **功能卡片**：四張（翻譯句構 / 單字卡 / 測驗 / 朗讀分享）還是精簡成三張？
3. **主 CTA 落點**：直接進註冊 mode（Step 4 的 `mode=signup`），還是就進預設的登入 mode？
4. **示範帳號 CTA 的行為**：`demo=1` 只自動填帳密（文案就用「查看示範帳號」），還是直接自動登入（文案才能寫「直接體驗」）？自動登入體驗最順，但等於一鍵進入公開帳號，警語只能事後在 app 內看到。
