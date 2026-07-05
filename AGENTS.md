# AGENTS.md

Persistent context for coding agents other than Claude Code (Codex, and any tool that reads the AGENTS.md standard) working on NoteEnglish. This mirrors the facts in `CLAUDE.md` — if the two ever diverge, `CLAUDE.md` is the source of truth for Claude Code specifically; update both together when architecture changes.

See `WORKFLOW.md` for the review handoff process between Claude Code and Codex.

## Stack

- Frontend: React 19 + Vite, Tailwind CSS v4, Ant Design, Recharts, TypeScript (`strict: false`, `allowJs: true`, but `noImplicitAny` enforced and CI-checked)
- Backend: FastAPI, spaCy (`en_core_web_sm`), Google GenAI (Gemini)
- Auth: Supabase JWT only — the frontend never calls Supabase tables directly; all persistence goes through FastAPI
- Deployment: Vercel (frontend), Render (backend)

## Non-negotiable architecture rules

- `context/translationContext.tsx` is the single source of truth (`useReducer`). Every mutation auto-saves via `saveGeneratedProgress` — there is no manual save button; do not add one.
- Vocab items are keyed by `(lemma, pos)`, not by raw selected text. Adding the same word twice should merge fields, not duplicate the card.
- Backend vocab cache (`services/vocab_cache.py`) is in-memory only, keyed by `session_id|sentence_id|word_index`. It resets on server restart — do not assume persistence.
- Python 3.10–3.12 only (spaCy wheels don't support 3.13+).
- Every route except `/api/health` and `/api/debug/*` requires a valid Supabase bearer token; `/api/admin/*` additionally requires admin access.

## Style rules for frontend changes

- Priority order: Ant Design components first, then Tailwind utility classes using CSS-variable syntax (`bg-(--card-bg)`, not `bg-[var(--card-bg)]`), then plain CSS only as a last resort.
- Never hardcode colors/fonts/borders — use the CSS variables defined in `src/index.css` `:root`. Add new tokens there if needed.
- Do not modify `.summary-print-root` / `.vocab-print-root` font stacks or the `@media print` white-background rules without explicit approval — print/export is a core feature.
- Check `src/types.ts` for existing shared types before defining a new one; don't widen an existing type to fit a new use case.

## Rules for any change

- Propose the approach before implementing anything that changes UX behavior or adds a new dependency.
- Prefer the smallest safe diff — this project is pre/near-launch.
- Do not report a fix as verified without an actual check (print preview, curl request, or mobile-viewport screenshot).

## Known recurring regressions — avoid reintroducing

- View state not resetting when switching or creating a session (reported three times).
- Print preview silently dropping text or colors.
- Partial print-style fixes — the black/white/gray print rules must be applied everywhere in one pass, not piecemeal.
