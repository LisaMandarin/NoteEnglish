# WORKFLOW.md

Standardized frontend/backend collaboration process for 句句通, and how Claude Code and Codex work together on this repo. Complements `CLAUDE.md` (root + frontend) — this file defines *process*, `CLAUDE.md` defines *architecture facts*. If a rule seems to duplicate `CLAUDE.md`, `CLAUDE.md` wins.

## 1. Contract-first for anything crossing the frontend/backend boundary

Before implementing, produce a review-only diff containing just:
- the backend Pydantic model / route signature change
- the matching TypeScript type in `src/types.ts`

Wait for confirmation before writing the actual endpoint logic or React component. This applies to any change touching `/api/translate`, `/api/vocab/lookup`, `/api/parse`, `/api/ocr`, `/api/sessions/*`, or `/api/admin/*`.

Reason: this project has had contract-drift issues (frontend assuming a shape the backend doesn't send). Locking the contract first removes that class of bug.

## 2. Model routing (Claude Code)

- **Fable 5** (`/model fable`) — architecture-level work: new caching layers, auth flow changes, OCR pipeline changes, refactors that touch both `context/translationContext.tsx` and backend services, or anything that needs to read several existing files before proposing a plan. Fable is not the default model — select it deliberately, and prefer it for planning/investigation over quick edits (it burns usage roughly 2x faster).
- **Sonnet** (default) — well-scoped single-file/single-endpoint changes, UI styling under the frontend `CLAUDE.md` rules, bug fixes with a known root cause.
- Either way, the root `CLAUDE.md` rule stands: **propose before implementing** anything that changes UX behavior or adds a dependency.

## 3. Skill boundary (optional — adopt only if CLAUDE.md starts feeling overloaded)

If task-specific detail grows past what belongs in a file loaded every session, split into skills:
- `noteenglish-frontend` — AntD > Tailwind > plain CSS priority, CSS-variable discipline, protected print behaviors
- `noteenglish-backend` — vocab cache pattern, Gemini call conventions, Supabase JWT validation flow

Keep `CLAUDE.md` for what's needed *every* session; move anything task-specific into a skill only once `CLAUDE.md` gets long or starts mixing unrelated task types.

## 4. Codex review handoff

`AGENTS.md` (root) mirrors the technical facts in `CLAUDE.md`, written for cross-tool consumption. When a change is ready for a second opinion:

1. Claude Code produces the diff and a short summary of what changed and why.
2. In a separate terminal, run `codex` against the same branch. Prompt:
   > "Review this diff against AGENTS.md. Flag anything that changes an API contract, weakens the JWT-only Supabase pattern, or touches print output rules."
3. Record both Claude's and Codex's notes in the PR description before merging.
4. Disagreements are resolved by Lisa — neither tool has final say.

## 5. Pre-launch conservatism gate

句句通 is pre/near-launch. Default to the smallest safe diff for anything that isn't an explicit bug fix or requested feature. Treat "nice to have" refactors suggested by either Claude Code or Codex as backlog items, not action items, until after launch.

## 6. Verification checklist (run after any frontend or backend change)

- [ ] UI change: viewed at mobile viewport width, nothing overflows
- [ ] Print-affecting change: checked via actual print preview, not just the browser view
- [ ] Session/view-state change: switching or creating a session resets the main view correctly
- [ ] Endpoint change: curl-tested with a real Supabase bearer token
- [ ] New dependency: confirmed with Lisa before implementing

## 7. Optional: ponytail-style markers

Not currently installed. If adopted, mark intentional simplifications inline so they're searchable later, e.g.:

```
// ponytail: hardcoded to first 3 results for now — revisit pagination after launch
```

This is additive and doesn't require changing anything above; add it whenever convenient.
