---
name: noteenglish-theme-style
description: Use when editing or adding frontend UI in this NoteEnglish project and the work should preserve the existing visual theme, CSS variable usage, typography, spacing, card styling, and summary-page font behavior.
---

# NoteEnglish Theme Style

Use this skill when changing UI in `frontend/src` so new work matches the current theme instead of introducing a new visual language.

## Theme Tokens

Read [frontend/src/index.css](../../../frontend/src/index.css) first and reuse the existing CSS variables:

- `--bg-main`: page background
- `--card-bg`: card and panel backgrounds
- `--card-border`: borders and strong outlines
- `--text-main`: primary text color
- `--accent`: emphasis color
- `--font-body`: default body font stack
- `--font-heading`: heading font stack

Do not hardcode replacement colors or fonts when an existing token already fits.

## Current Style Rules

- Keep the soft editorial look: pale teal page background, light cards, dark green borders, restrained accent color.
- Use rounded cards and panels. Existing components commonly use `rounded-2xl`, `rounded-[28px]`, or `rounded-[30px]`.
- Preserve the heavier card framing used across the app, especially `border-4 border-(--card-border)` on major panels.
- Keep shadows subtle. Prefer `shadow-sm`, `shadow-md`, or similarly restrained depth.
- Use `var(--font-heading)` for headings and `var(--font-body)` for normal app text.
- Preserve `.summary-page` font behavior for Traditional Chinese content. Do not replace it with the default body stack.

## Tailwind Usage

- Prefer existing Tailwind patterns already used in this repo, such as `bg-(--card-bg)`, `border-(--card-border)`, and `text-(--text-main)`.
- When a component already uses arbitrary value syntax like `text-[var(--text-main)]`, keep the surrounding pattern consistent instead of rewriting unrelated code.
- Reuse spacing and radius patterns from neighboring components before inventing new ones.

## Editing Guidance

- Before adding a new color or font token, check whether the current variables already cover the need.
- Prefer extending `:root` in `frontend/src/index.css` over scattering raw hex values across components.
- If print output is affected, preserve the existing white-background print behavior in `@media print`.
- For summary or generated reading content, keep legibility ahead of ornament.

## Avoid

- Introducing a new palette that conflicts with the teal, cream, and dark-border theme.
- Replacing serif headings with generic sans-serif headings.
- Flattening the UI into borderless white boxes.
- Removing the CJK-friendly summary font stack.
