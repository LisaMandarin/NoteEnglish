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
FRONTEND_ORIGIN=http://localhost:5173   # optional override
GEMINI_MODEL=gemini-2.5-flash           # optional override
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Run the server
```
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Quick checks
- Health: `curl http://localhost:8000/api/health`
- Translate (requires valid key):
```
curl -X POST http://localhost:8000/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"I like apples.","target_lang":"zh-TW","mode":"normal"}'
```

## Authenticated APIs
These endpoints expect a Supabase access token in `Authorization: Bearer <token>`.
- `POST /api/profile/ensure`
- `GET /api/sessions`
- `GET /api/sessions/{id}`
- `POST /api/sessions/save`
