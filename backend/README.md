# NoteEnglish Backend

FastAPI service for translations and vocabulary enrichment.

## Prerequisites
- Python 3.10–3.12 (spaCy wheels don't support 3.13 yet)
- Poetry
- Gemini API key (for translation/vocab endpoints)

## Setup
1) Install dependencies (includes spaCy model + Google GenAI client):
```
poetry install
```
2) Create `.env` in `backend/`:
```
GEMINI_API_KEY=your_key_here
FRONTEND_ORIGINS=http://localhost:5173  # comma-separated when needed
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
This repo includes a root-level `render.yaml` that deploys the FastAPI backend from `backend/`.

Set these Render environment variables before the first deploy:
```
FRONTEND_ORIGINS=https://note-english-gbysku9hc-lisas-projects-8870c4b9.vercel.app
GEMINI_API_KEY=your_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Notes:
- `PYTHON_VERSION` is pinned in `render.yaml` because this app requires Python 3.10-3.12.
- `FRONTEND_ORIGINS` supports multiple origins as a comma-separated list.
- In production, keep `FRONTEND_ORIGINS` limited to your real frontend domain. Use `backend/.env` for local `http://localhost:5173`.
- Render health check path should be `/api/health`.

## Quick checks
- Health: `curl http://localhost:8000/api/health`
  > **Note:** `app/routes/test.py` contains the health and debug/split routes but is not registered in `main.py`. Register `test_router` there to re-enable these endpoints.
- Translate (requires auth token):
```
curl -X POST http://localhost:8000/api/translate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <supabase_access_token>" \
  -d '{"text":"I like apples.","target_lang":"zh-TW","mode":"normal"}'
```

## Authenticated APIs
All non-health endpoints require a Supabase access token in `Authorization: Bearer <token>`.
- `POST /api/translate`
- `POST /api/vocab/detail`
- `POST /api/profile/ensure`
- `GET /api/sessions`
- `GET /api/sessions/{id}`
- `POST /api/sessions/save`
- `PATCH /api/sessions/{id}/title`
- `DELETE /api/sessions/{id}`

In Swagger UI, use the `Authorize` button and paste only the Supabase access token. Swagger will send it as a Bearer token automatically.
