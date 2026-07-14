# 使用者個人檔案計畫（User Profile Plan）

> 建立日期：2026-07-15
> 分支：`user-profile`（從 `main` 切出）
> 執行方式：依步驟順序執行，每一步完成並驗證後再進下一步。
> ⚠️ 本計畫新增跨前後端 API——依 WORKFLOW.md 規則，先出「契約 diff」（Pydantic model + types.ts）確認後再寫實作。

---

## 目標

1. 使用者可編輯個人檔案：顯示名稱（username）、自我介紹、外部連結。
2. 分享出去的 session（唯讀頁）顯示作者，並可點進作者的**唯讀**個人檔案頁。

## 現況盤點（已確認的程式事實）

- `profiles` 表已存在（不在 repo migrations 內，是早期建立的），目前欄位至少有 `id, email, display_name`；後端 `ensure_profile`（`services/supabase.py:124`）在登入時 upsert。
- 分享頁後端 `get_shared_session` 已回傳 `creator_name`（`services/supabase.py:1359`，查 `profiles.display_name`）；前端 `SharedView.tsx:123` 已顯示「由 {creator_name} 分享」，但只是純文字。
- `SharedView` 刻意在 `TranslationProvider` 之外渲染（CLAUDE.md 架構規則：唯讀頁在結構上不能寫入）。個人檔案唯讀頁比照同一模式。
- App 進入點路由靠 query param：`App.tsx:138-143` 讀 `?shared={token}`。個人檔案頁加 `?profile={userId}` 同模式。
- 設定面板 `SettingsPanel.tsx` 目前只顯示 username/email + 三顆按鈕，是「編輯個人檔案」入口的自然位置。
- 顯示名稱目前有兩個來源：Supabase auth `user_metadata.display_name`（App.tsx `getDisplayName`）與 `profiles.display_name`。編輯後兩邊都要同步（見 Step 6）。

## 產品決策（2026-07-15 已與 Lisa 確認）

1. **誰能看個人檔案？** ✅ 已確認：加**「公開/不公開」開關**——`profiles.is_public` 欄位，使用者在編輯個人檔案時自行決定。公開時任何已登入使用者可看；不公開時個人檔案頁回 404，分享頁的作者名顯示為純文字（不成連結）。預設值 `true`（公開）——理由：檔案內容（顯示名稱／自介／連結）全是使用者主動填寫的對外資訊，display_name 本來就已顯示在分享頁上；未填寫前檔案近乎空白，預設公開無隱私風險，且讓分享頁的作者連結功能開箱即用。若 Lisa 想改預設不公開，只需改 migration 的 default 與此段。
2. **username handle**：✅ 已確認**不做** @帳號——沿用 `display_name`，個人檔案頁以 `user_id`（UUID）定址。若之後要漂亮網址再加。
3. **連結上限與格式**：最多 5 條，每條 `{label, url}`，僅允許 `http(s)://`。（建議預設，未反對即採用）
4. **自我介紹上限**：500 字，純文字（pre-wrap 顯示，不支援 markdown/HTML）。（建議預設，未反對即採用）

---

## Step 1：建分支

```bash
git checkout main && git pull
git checkout -b user-profile
```

## Step 2：資料庫 migration

新檔案：`supabase/migrations/20260715000000_add_profile_fields.sql`

```sql
alter table profiles
  add column if not exists bio text,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists is_public boolean not null default true;
```

- 動手前先用 Supabase 後台（或 MCP `list_tables`）確認 `profiles` 現有結構與 RLS 狀態，migration 照既有慣例補（比照 sharing migration：RLS enabled、無 policy = 只有 service role 能碰）。
- 長度／格式限制在後端 Pydantic 驗證，不放 DB constraint（照 repo 既有做法）。
- ⚠️ dev 與 prod 是同一個 Supabase 專案（見記憶），migration 一經套用即生效，**只套一次、記錄下來**。

## Step 3：契約先行（WORKFLOW.md 規則——先出這個 diff 等確認）

後端 `app/models/`（新增 `profile.py` 或併入 session.py）：

```python
class ProfileLink(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    url: HttpUrl  # pydantic 自帶 http(s) scheme 驗證

class UpdateProfileRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    bio: str = Field(default="", max_length=500)
    links: list[ProfileLink] = Field(default_factory=list, max_length=5)
    is_public: bool = True

class PublicProfile(BaseModel):
    id: str
    display_name: str | None
    bio: str | None
    links: list[ProfileLink]
```

前端 `src/types.ts`：

```ts
export type ProfileLink = { label: string; url: string };
export type PublicProfile = {
  id: string;
  display_name: string | null;
  bio: string | null;
  links: ProfileLink[];
};
```

API 端點（`routes/profile.py` 擴充）：

- `GET  /api/profile/me` → 自己的完整 profile（含 email 與 `is_public`，僅本人）。
- `PATCH /api/profile` → 更新 display_name / bio / links / is_public。
- `GET  /api/profiles/{user_id}` → `PublicProfile`（需登入；**不含 email**；查無此人**或 `is_public = false`** 一律回 404，兩種情況不可區分）。

`get_shared_session` 回傳新增 `creator_id`——**僅在作者檔案公開時**帶值，否則為 `null`；前端據此決定作者名要不要渲染成連結。既有 `creator_name` 保留。`ShareDetail` 前端型別同步加欄位。

## Step 4：後端實作

檔案：`services/supabase.py`、`routes/profile.py`、`routes/share.py`（不動）

- `get_profile(user_id)`、`update_profile(user_id, payload)`（PATCH `rest/v1/profiles?id=eq.{id}`）、`get_public_profile(user_id)`（select 排除 email，`is_public = false` 時當 404 處理）。
- `update_profile` 對 `links` 做序列化（`[l.model_dump(mode="json") for l in links]`）；`HttpUrl` 已擋 `javascript:` 等 scheme。
- `get_shared_session`：查作者 profile 時一併取 `is_public`（可與既有 `_creator_name` 查詢合併成一次），公開才設 `detail["creator_id"] = owner_id`，否則 `None`。
- 測試：新增 `backend/tests/test_profile_route.py`——更新成功、bio 超長 422、links 超過 5 條 422、非 http scheme 422、公開端點不洩漏 email、404、**不公開檔案回 404**、**不公開作者的分享 detail 其 creator_id 為 null**。
- 註記：`/api/profiles/{user_id}` 屬需要 Bearer token 的一般路由（符合 CLAUDE.md「除 health/debug 全部要 token」）。

## Step 5：前端——編輯個人檔案 UI

檔案：`SettingsPanel.tsx` + 新檔 `components/AppSidebar/panels/ProfileEditModal.tsx`、`lib/api.ts`

- `lib/api.ts` 加 `getMyProfile()`、`updateProfile(payload)`、`getPublicProfile(userId)`。
- `SettingsPanel` 加「編輯個人檔案」按鈕（AntD `Button` + `EditOutlined`），開 AntD `Modal` + `Form`：
  - 顯示名稱：`Input`（必填，≤60 字）。
  - 自我介紹：`Input.TextArea`（≤500 字，`showCount`）。
  - 連結：`Form.List` 動態列（label + url 兩欄、加/刪按鈕、上限 5 條，url 前端先驗 `https?://`）。
  - 公開開關：AntD `Switch`「公開個人檔案」＋一行說明文字（「關閉後，其他人無法檢視你的個人檔案，分享文章上的名字也不會連到這裡」）。
  - 開啟時 `getMyProfile()` 帶入現值；儲存 loading；成功後 `message.success`。
- 儲存成功後同步 auth metadata：`supabase.auth.updateUser({ data: { display_name } })`（supabase-js 是 auth-only，這用法符合架構規則），讓 `App.tsx getDisplayName` 與 Header 立即反映新名稱。
- 樣式遵守 frontend/CLAUDE.md：AntD 優先、色票用 CSS variables、icon 按鈕有 `aria-label`、對比 ≥ 4.5:1。

## Step 6：前端——唯讀個人檔案頁 + 分享頁作者連結

新檔案：`components/ProfileView.tsx`；修改：`App.tsx`、`SharedView.tsx`

- `App.tsx`：在 `sharedToken` 判斷旁加 `const profileId = params.get("profile")`；`profileId` 存在時渲染 `<ProfileView userId={profileId} />`——**與 SharedView 相同，放在 `TranslationProvider` 之外**（唯讀頁在結構上不能有寫入路徑，CLAUDE.md 架構規則）。需登入才看得到（沿用 shared 的登入 gate 行為）。
- `ProfileView`：呼叫 `getPublicProfile(userId)`，顯示顯示名稱（`--font-heading`）、自我介紹（`white-space: pre-wrap` 純文字）、連結列表（`<a target="_blank" rel="noopener noreferrer">`，一律以文字顯示完整網域，避免釣魚連結偽裝）。載入中／404（「找不到這位使用者」）兩個狀態。無任何編輯控制項。
- `SharedView.tsx:123`：「由 {creator_name} 分享」——`detail.creator_id` 有值時渲染成連結 `<a href={`${location.pathname}?profile=${detail.creator_id}`}>`（建議同頁導航，瀏覽器返回鍵可回到文章）；為 null（作者不公開）時維持現在的純文字。
- 自己也能從設定面板點「檢視公開檔案」預覽自己的頁（可選）。

## Step 7：驗證

- 後端：`pytest backend/tests/test_profile_route.py test_share_route.py`（share 回傳多了 creator_id，既有測試可能要更新）。
- 前端 `frontend:verify`：
  1. 設定面板 → 編輯個人檔案 → 儲存 → 重新開啟 modal 現值正確、Header 名稱同步更新。
  2. 分享頁作者名是連結 → 點入唯讀個人檔案頁，內容正確、無編輯入口。
  3. bio 換行正確顯示；連結新開分頁。
  4. 404 使用者顯示友善訊息。
  5. 關閉「公開個人檔案」→ 直接開 `?profile={id}` 顯示 404 訊息；分享頁作者名變回純文字。重新開啟後恢復連結。
- 手動 curl 驗證 `GET /api/profiles/{id}` 回傳**不含 email**（安全檢查，必做）。
- 行動版寬度檢查 + WCAG 對比檢查。
- `npm run type-check` + 既有 pytest 全綠。

## 不做的事

- 不做 @username handle 與自訂網址（見產品決策 2，等確認）。
- 不做頭像上傳（另案；牽涉 storage bucket）。
- 不做「個人檔案列出該作者所有分享文章」（好功能，但另案——需要新查詢端點與分頁）。
- 唯讀頁不放任何寫入 API 呼叫。
