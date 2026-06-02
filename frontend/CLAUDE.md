# CLAUDE.md — Frontend

## TypeScript Rules

`tsconfig.json` has `strict: false` and `allowJs: true` — the codebase is gradually typed. Follow these rules when adding or modifying code:

- Every variable, parameter, and return value must have an explicit type — no implicit `any`
- Use `unknown` instead of `any` when the shape is genuinely uncertain, then narrow it
- Before defining a new type, check `src/types.ts` for existing shared types; add new shared types there
- Component props should be typed inline for one-off components, or as a named type if reused
- Do not widen an existing type to accommodate a new use case — refine or extend it instead
