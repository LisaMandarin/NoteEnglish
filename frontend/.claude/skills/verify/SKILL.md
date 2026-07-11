---
name: verify
description: How to drive the NoteEnglish frontend in a headless browser to verify UI changes without the real backend.
---

# Verifying frontend UI changes

Recipe that works (verified 2026-07-11):

1. **Start dev server**: `npm run dev -- --port 5199 --strictPort` from `frontend/`. `VITE_API_BASE` is empty in `.env.local`, so all API calls are relative `/api/...` — easy to intercept.
2. **Playwright**: not in package.json; use the npx cache install with
   `NODE_PATH=/Users/lisachuang/.npm/_npx/e41f203b7505f1fb/node_modules node script.cjs` (Chromium already downloaded in `~/Library/Caches/ms-playwright`).
3. **Auth gate**: every view (including `?shared=`) sits behind login (`App.tsx`: `if (!user) return <LoginPage />` comes before the `sharedToken` check). Log in with the public demo account: click the button `使用示範帳號` (it only FILLS the form) then submit with the `登 入` button. Real Supabase auth fires; it works headlessly.
4. **Isolate from the backend**: register a Playwright catch-all route FIRST (`**/api/**` → `{}`), then specific routes after (later routes win). Fulfill `**/api/shared/<fake-token>` with a fake `SharedSessionDetail` (shape in `src/types.ts`) and open `/?shared=<fake-token>` — the read-only view renders sentences + vocab cards with no writes possible.
5. **TTS**: fulfill `**/api/tts` with a small WAV (generate via python `wave` module). Headless Chromium plays it (launch with `--mute-audio`); duration/seek all work.

## Gotchas

- antd popovers have a zoom-in motion: wait ~800ms after opening before measuring `boundingBox()`, or positions/sizes are mid-animation garbage.
- The TTS speaker button is `button[aria-label="Pronounce <word>"]`.
- To close a popover that may cover its own trigger, click empty page space instead of the trigger.
- `text=使用示範帳號` matches explanatory text before the button — use `getByRole("button", { name: ... })`.
- Touch testing: Playwright's `touchscreen` only taps; for touch drags open a CDP session and send `Input.dispatchTouchEvent` (touchStart/touchMove.../touchEnd with empty touchPoints). Coordinates are CSS px — keep every point INSIDE the viewport, offscreen coords get clamped and produce garbage deltas.
