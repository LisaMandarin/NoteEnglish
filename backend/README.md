# NoteEnglish Backend

FastAPI service for translations, vocabulary enrichment, session storage, and token usage tracking. For features and usage, see the [root README](../README.md).

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

All endpoints except `/api/health` require a Supabase Bearer token (`Authorization: Bearer <token>`). In Swagger UI, use the `Authorize` button to set it.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (no auth) |
| `POST` | `/api/translate` | Split and translate text, return base vocab |
| `POST` | `/api/vocab/detail` | Enrich selected vocab (with in-memory cache) |
| `POST` | `/api/profile/ensure` | Create or verify user profile |
| `GET` | `/api/sessions` | List sessions (supports `limit` / `offset`) |
| `GET` | `/api/sessions/{id}` | Load a single session |
| `POST` | `/api/sessions/save` | Save or overwrite a session |
| `PATCH` | `/api/sessions/{id}/title` | Rename a session |
| `DELETE` | `/api/sessions/{id}` | Delete a session |
| `GET` | `/api/usage` | Gemini token usage stats (hourly / daily / monthly) |

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

> **Note:** `app/routes/test.py` contains health and debug/split routes but is not registered in `main.py` by default. Register `test_router` there to re-enable them.
