# 句句通 Frontend

React 19 + Vite single-page app. For features and usage, see the [root README](../README.md).

## Prerequisites
- Node.js 18+ (LTS recommended)
- Backend running — see [backend/README.md](../backend/README.md)

## Setup
```
npm install
```

Create `frontend/.env` if your backend runs at a non-default address:
```
VITE_API_BASE=http://127.0.0.1:8000
```

## Run in development
```
npm run dev
```

Open the printed localhost URL (usually `http://localhost:5173`).

## App routes
The app is a single page with view switching via path and query params:

| URL | View |
|-----|------|
| `/` | Main study page (login if unauthenticated) |
| `/?shared={token}` | Read-only view of a shared article (sign-in required; the login page preserves the query so the link works when logged out) |
| `/?profile={userId}` | Read-only public profile page (sign-in required; 404s if the profile is private) |
| `/?view=summary` | Printable summary window (original + translation or vocab notes) |
| `/?view=vocab-print` | Printable vocab cards window |
| `/admin-dashboard` | Admin dashboard (admin login + access check) |

Sub-views (`?view=summary`, `?view=vocab-print`, `?profile=`) normally open in a new tab via `window.open`. When the app is running in PWA standalone display mode (added to the home screen), there are no tabs to open into, so `frontend/src/lib/openView.ts` switches to same-window navigation instead — see `openAppView` / `leaveAppView`.

## Build for production
```
npm run build
npm run preview   # serve the build locally
```

## Deploy to Vercel
`vercel.json` rewrites all URLs to `index.html` so the path-based views above work on direct navigation. Set `VITE_API_BASE` in the Vercel project settings to your deployed backend URL.
