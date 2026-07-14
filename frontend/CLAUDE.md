# CLAUDE.md — Frontend

## UI & Styling

When styling components, follow this priority order:

1. **Ant Design** — use AntD components and props first (`Button`, `Card`, `Space`, `Typography`, etc.)
2. **Tailwind CSS** — use utility classes if AntD doesn't cover the need. Use CSS variable syntax: `bg-(--card-bg)`, `border-(--card-border)`, `text-(--text-main)`. Do not mix in arbitrary value syntax like `bg-[var(--card-bg)]` unless the surrounding component already does so.
3. **Plain CSS** — only if neither AntD nor Tailwind can achieve the result

When any UI work involves color, background, font, or border, always use the CSS variables defined in `src/index.css` `:root` rather than hardcoding values. If a new token is needed, add it to `:root` in `src/index.css` — do not scatter raw hex values across components.

| Variable | Use |
|---|---|
| `--bg-main` | Page background |
| `--card-bg` | Card / surface background |
| `--card-border` | Card borders |
| `--text-main` | Default text |
| `--accent` | Highlights and emphasis |
| `--font-body` | Body text font stack |
| `--font-heading` | Heading font (Playfair Display) |

## Accessibility — W3C standards are mandatory

All frontend work must comply with W3C standards (WCAG 2.1 AA and valid semantic HTML). These are hard requirements, not suggestions:

- **Color contrast (WCAG AA)**: text ≥ 4.5:1 against its effective background; large text (≥24px, or ≥18.66px bold) and meaningful icons/UI components ≥ 3:1. Check the *composited* result — `text-black/40`, `opacity-*`, and translucent backgrounds lower the real ratio.
- **Verify rendered colors, not class names**: antd's unlayered `button` color rules silently beat Tailwind's layered utilities (a `text-white` button once rendered dark-on-dark at 2.7:1). For colors on raw `<button>` elements, use a plain-CSS class in `src/index.css` (existing pattern: `.btn-accent`, `.quiz-choice`) and confirm the computed style in the browser.
- **Known-safe tokens**: `--text-muted` (#5f6b77), `text-black/60`, and `gray-500`+ pass on white and `--card-bg`; `text-black/55` and lighter, and `gray-400`, fail — do not reintroduce them for text or meaningful icons. antd `Text type="secondary"` is only safe because `ThemedApp.tsx` overrides `colorTextDescription`; keep that override.
- **Semantics**: interactive elements are real `<button>`/`<a>` with an accessible name (`aria-label` for icon-only buttons); images/icons that are decorative get `aria-hidden="true"`.
- After changing any color, background, or opacity, re-check the affected text/controls' contrast in the rendered app (screenshot or computed styles), same as the print-style verification rule below.

## Protected Behaviors

- **`.summary-print-root` / `.vocab-print-root` font stacks** (`src/index.css`) — do not replace or remove them. They carry the CJK-friendly fonts for Traditional Chinese print output.
- **`@media print` styles** — do not remove the white-background print behavior. Print/export is a core feature.
- **Print color rules** — printed output is black/white/gray only: white page background, `.spp-num` number badges dark gray on white, `.pos-badge` light gray background, example blocks light gray background. Apply these rules everywhere in one pass when touching print styles — partial application has required repeated corrections.

## Verification Rules

- **Print styles**: after changing anything under `@media print` or the summary/vocab print windows, verify via actual print preview (or a rendered screenshot), not just the browser view — print preview has silently dropped text and colors before.
- **Layout changes**: verify at a mobile viewport width and confirm nothing overflows the screen height (100vh) or overlaps neighboring elements. Overflow on mobile and footer/height overflow are recurring regressions.

## TypeScript Rules

`tsconfig.json` has `strict: false` and `allowJs: true` — the codebase is gradually typed. `noImplicitAny` is enabled and enforced by `npm run type-check` (also run in CI). Follow these rules when adding or modifying code:

- Every variable, parameter, and return value must have an explicit type — no implicit `any` (compiler-enforced)
- Use `unknown` instead of `any` when the shape is genuinely uncertain, then narrow it
- Before defining a new type, check `src/types.ts` for existing shared types; add new shared types there
- Component props should be typed inline for one-off components, or as a named type if reused
- Do not widen an existing type to accommodate a new use case — refine or extend it instead
