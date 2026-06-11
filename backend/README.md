# NoteEnglish Backend

FastAPI service for translations, vocabulary enrichment, image-to-text (OCR), session storage, token usage tracking, and admin stats. For features and usage, see the [root README](../README.md).

## Prerequisites
- Python 3.10–3.12 (spaCy wheels don't support 3.13+)
- Poetry
- Gemini API key

## Setup
```
poetry install
```

Create `backend/.env`:
```
GEMINI_API_KEY=your_key_here
FRONTEND_ORIGINS=http://localhost:5173
GEMINI_MODEL=gemini-2.5-flash           # optional override
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Run the server
```
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Deploy to Render
A root-level `render.yaml` deploys the backend from `backend/`. Set these environment variables before the first deploy:
```
FRONTEND_ORIGINS=https://<your-vercel-domain>
GEMINI_API_KEY=your_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Notes:
- `PYTHON_VERSION` is pinned in `render.yaml` (3.10–3.12).
- `FRONTEND_ORIGINS` accepts a comma-separated list for multiple origins.
- Render health check path: `/api/health`.

## API Endpoints

All endpoints except `/api/health` and `/api/debug/*` require a Supabase Bearer token (`Authorization: Bearer <token>`). The `/api/admin/*` endpoints additionally require the token to belong to an admin user. In Swagger UI, use the `Authorize` button to set the token.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (no auth) |
| `POST` | `/api/debug/split` | Sentence-split text without translating (no auth) |
| `POST` | `/api/translate` | Split and translate text, return base vocab |
| `POST` | `/api/vocab/detail` | Enrich selected vocab (with in-memory cache) |
| `POST` | `/api/ocr` | Extract text from a base64 image via Gemini vision (JPEG/PNG/WebP, max 8 MB) |
| `POST` | `/api/profile/ensure` | Create or verify user profile |
| `GET` | `/api/sessions` | List sessions (supports `limit` / `offset`) |
| `GET` | `/api/sessions/{id}` | Load a single session |
| `POST` | `/api/sessions/save` | Save or overwrite a session |
| `PATCH` | `/api/sessions/{id}/title` | Rename a session |
| `DELETE` | `/api/sessions/{id}` | Delete a session |
| `GET` | `/api/usage` | Gemini token usage stats (hourly / daily / monthly) |
| `GET` | `/api/admin/check` | Verify the caller has admin access |
| `GET` | `/api/admin/users` | List all users (supports `page` / `per_page`) |
| `GET` | `/api/admin/users/{user_id}/usage` | Token usage stats for a single user |

## Quick checks
```bash
# Health
curl http://localhost:8000/api/health

# Translate (requires auth token)
curl -X POST http://localhost:8000/api/translate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <supabase_access_token>" \
  -d '{"text":"I like apples.","target_lang":"zh-TW","mode":"normal"}'
```
