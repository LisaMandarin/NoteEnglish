# NoteEnglish Backend

FastAPI service for translations and vocabulary enrichment.

## Prerequisites
- Python 3.10+
- Poetry
- Gemini API key (for translation/vocab endpoints)

## Setup
1) Install dependencies:
```
poetry install
poetry run pip install spacy google-genai
poetry run python -m spacy download en_core_web_sm
```
2) Create `.env` in `backend/`:
```
GEMINI_API_KEY=your_key_here
FRONTEND_ORIGIN=http://localhost:5173   # optional override
GEMINI_MODEL=gemini-2.5-flash           # optional override
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
