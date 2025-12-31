# NoteEnglish Frontend (React + Vite)

Single-page app for translations and vocabulary lookup.

## Prerequisites
- Node.js 18+ (LTS recommended)
- npm (comes with Node)
- Backend running on `http://127.0.0.1:8000` (default) or another URL

## Setup
1) Install dependencies:
```
npm install
```
2) Configure API base URL (optional if using default):
   - Create `frontend/.env` (or `.env.local`) with:
```
VITE_API_BASE=http://127.0.0.1:8000
```
   - Omit this to use the default `http://127.0.0.1:8000`.

## Run in development
```
npm run dev
```
Open the printed localhost URL (usually http://localhost:5173).

## Build for production
```
npm run build
npm run preview   # serve the build locally
```

## Expected backend endpoints
- `POST /api/translate`
- `POST /api/vocab/detail`

Ensure the backend is reachable at `VITE_API_BASE` before using the app. Also, the backend needs a valid Gemini API key; see `backend/README.md` for details.
