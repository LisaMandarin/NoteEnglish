# 句句通 Backend

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
| `POST` | `/api/vocab/lookup` | Enrich selected vocab (with in-memory cache) |
| `POST` | `/api/parse` | Analyze a sentence into a five-pattern constituent tree via Gemini (spaCy validates/repairs; cached in memory + Supabase) |
| `POST` | `/api/ocr` | Extract text from a base64 image via Gemini vision (JPEG/PNG/WebP, max 8 MB) |
| `POST` | `/api/profile/ensure` | Create or verify user profile |
| `GET` | `/api/sessions` | List sessions (supports `limit` / `offset`; items include `share_token`) |
| `GET` | `/api/sessions/{id}` | Load a single session |
| `POST` | `/api/sessions/save` | Save or overwrite a session |
| `PATCH` | `/api/sessions/{id}/title` | Rename a session |
| `DELETE` | `/api/sessions/{id}` | Delete a session (cascade-removes everyone's favorites) |
| `POST` | `/api/sessions/{id}/share` | Create or return the session's share token (idempotent, owner only) |
| `DELETE` | `/api/sessions/{id}/share` | Revoke the share link (hides favorites until re-shared) |
| `GET` | `/api/shared/{token}` | Read-only shared article (any signed-in user; 404 if revoked) |
| `POST` | `/api/shared/{token}/favorite` | Favorite a shared article |
| `DELETE` | `/api/favorites/{session_id}` | Remove a favorite |
| `GET` | `/api/favorites` | List favorited shared articles (revoked/deleted ones excluded) |
| `POST` | `/api/shared/{token}/fork` | Copy a shared article into the caller's own sessions |
| `POST` | `/api/tts` | Synthesize speech via edge-tts (neural voice, cached) |
| `GET` | `/api/quiz/vocab-pool` | Vocab pool across sessions for quiz building |
| `POST` | `/api/quiz/generate` | Gemini reading-comprehension questions (cached per session) |
| `POST` | `/api/quiz/results` | Submit quiz answers (updates word mastery) |
| `GET` | `/api/quiz/mastery` | Word mastery levels |
| `GET` | `/api/quiz/runs` | Quiz history (one item per submitted run) |
| `DELETE` | `/api/quiz/runs` | Delete one run and rebuild affected word mastery |
| `POST` | `/api/issue-report` | Submit a user issue report |
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
