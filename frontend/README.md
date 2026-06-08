# NoteEnglish Frontend

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

## Build for production
```
npm run build
npm run preview   # serve the build locally
```
