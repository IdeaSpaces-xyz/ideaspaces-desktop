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

Desktop follows the OS theme by default (`prefers-color-scheme`). `.light` /
`.dark` on `<html>` can force a theme later (a toggle isn't built yet). The CSP
is set; the webview is first-party.

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
