# Design foundation

The desktop client uses the IdeaSpaces design system. The **canonical source** is
`projects/IdeaSpaces Design System/` (tokens in `colors_and_type.css`, Radix
component CSS, logo assets, mockups, and the `ideaspaces-design` skill). The
working web implementation in `projects/is_web` (`src/index.css`) is the closest
reference for an app surface; this doc captures how the desktop wires it.

## Tokens

Semantic `--is-*` CSS variables in `src/index.css`, mapped to Tailwind v4 via
`@theme` (`--color-is-*`). Components use the utilities, not raw hex:

- `bg-is-bg`, `bg-is-surface`, `bg-is-surface-alt`
- `text-is-text`, `text-is-text-secondary`, `text-is-text-tertiary`
- `border-is-border`, `text-is-accent` / `text-is-accent-text`
- `text-is-danger-text`, `is-focus-ring`, `is-overlay`

Tokens describe **function, not appearance** — both themes define the same names,
so components don't care which theme is active.

## Theme

Light / dark / system, via `useTheme` (`src/theme/useTheme.ts`) and the
`ThemeToggle` control (`src/components/ThemeToggle.tsx`). `system` (the default)
follows the OS through `prefers-color-scheme`; `light` / `dark` add a `.light` /
`.dark` class on `<html>` to force a theme. The choice persists in localStorage.

Known limitation: a brief flash on startup when a *forced* theme differs from the
OS — the strict CSP rules out an inline pre-paint script (see below). System mode
has no flash.

## CSP

`tauri.conf.json` sets a strict policy: `default-src 'self'`, `script-src 'self'`.
Fonts are bundled locally (`@fontsource`), so `font-src 'self'` suffices — no CDN.
`style-src` keeps `'unsafe-inline'`: Tailwind v4 emits a static stylesheet (which
would not need it), but React inline `style=` attributes and webview/HMR-injected
`<style>` tags do. It's a contained relaxation on a first-party local webview;
revisit if a future audit shows no runtime inline styles ship.

## Type system

Three faces, **bundled locally** via `@fontsource` (not a CDN — offline-first and
CSP-clean, unlike `is_web` which uses Google Fonts):

- **Inter** (`--font-sans`) — UI body. Loaded (variable).
- **Fragment Mono** (`--font-chrome`) — labels, URLs, the `idea / spaces` wordmark lockup. Loaded.
- **Sorts Mill Goudy** (`--font-prose`) — long-form reading. Token defined; load when a Note/editor surface ships.

## Brand rules (from the design system)

- **Voice:** calm, declarative, literary. Sentence case. **No emoji**, no marketing speak.
- **Name:** *IdeaSpaces* (one word, camel case) in body; *idea / spaces* (Fragment Mono lockup) as the logo.
- **Logo:** hexagonal mark, `currentColor` (theme-aware) — `src/components/LogoSymbol.tsx`.
- **Color:** near-neutral ink/slate/cream + one dusk gradient (`--grad-dusk`). The accent is the only saturated color — status/identity, not decoration.
- **Surfaces:** generous breathing room. Cards at radius 8 (`rounded-lg`), 1px borders, **no shadows**.
- **Icons:** Lucide stroke icons (16px, stroke-width ~1.333). No emoji, no filled icons.

## Next

When the editor/browse surfaces land, port `is_web`'s prose styles
(`.is-note-prose`) and Radix component patterns, and add the `lucide-react` icon
set + Sorts Mill Goudy.
