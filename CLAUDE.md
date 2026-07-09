# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Architecture Decisions

**Single source of truth**: `context/translationContext.tsx` owns all app state via `useReducer`. Every mutation (vocab add/remove/reorder) immediately calls `saveGeneratedProgress`, which auto-saves to the backend — there is no manual save button.

**Vocab deduplication**: vocab items are keyed by `(lemma, pos)` — not by the selected text. Adding the same word twice merges the fields rather than creating a duplicate card.

**Backend vocab cache**: `services/vocab_cache.py` keeps an in-memory dict keyed by `session_id|sentence_id|word_index`. Partial cache hits reuse existing fields and only call Gemini for missing ones. The cache resets on server restart.

**Auth**: frontend gets a Supabase JWT and sends it as `Authorization: Bearer` on every request via `lib/api.ts:apiFetch`. The backend validates the token by calling the Supabase auth API (`GET /auth/v1/user`) with the anon key; the service role key is used only for data reads/writes. `supabase-js` is auth-only — all data persistence goes through FastAPI, not direct Supabase table calls.

**Summary view**: `SummaryWindow.tsx` is opened via `?view=summary` query param and reads from the same `TranslationContext` — it must be rendered inside `TranslationProvider`.

## Constraints

- Python 3.10–3.12 only (spaCy wheels don't support 3.13+)
- `GEMINI_API_KEY` is required for all AI routes: `/api/translate`, `/api/vocab/lookup`, `/api/parse`, `/api/ocr`, and `/api/quiz/generate`
- All routes except `/api/health` and `/api/debug/*` require a valid Supabase Bearer token

## Working Rules

- **Verify before claiming fixed**: after a UI or rendering change, verify the actual rendered result (screenshot, print preview, or curl) — do not report done based on the code change alone. Past misses: stale favicon, missing metadata, print preview dropping text, stale summary title.
- **Propose before implementing** when a change alters UX behavior or adds a new dependency: state the approach and wait for confirmation.
- **View-state regression to guard**: switching or creating a session must reset the main section view (e.g. leaving the token-usage view). This bug has been reported three separate times.
