# baio — Design

## Visual theme
Two-ink risograph. Pure white paper, deep aubergine ink for everything that is content or structure, celadon as the second ink for the primary action, the suggestion state, and the printed blobs. Subtle grain on the marketing surface only. No gradients, no drop shadows as decoration, hairline borders.

## Color (OKLCH, single theme) — `app/tokens.css`
| Token | Value | Use |
|---|---|---|
| `--paper` | oklch(1 0 0) | page background |
| `--ink` | oklch(0.28 0.10 330) = #421040 | text, strokes, icons (15.2:1) |
| `--ink-soft` | oklch(0.46 0.07 330) = #6e496b | secondary text (7.4:1) |
| `--ink-faint` | ink / 0.14 | hairlines, dividers |
| `--wash` | oklch(0.96 0.015 160) = #eaf5ee | toolbar / panel / liminal plane surface |
| `--accent` | oklch(0.84 0.08 160) = #9ddbb9 | celadon fill: primary buttons (ink text, 9.6:1), mark under-print, ink blobs, wordmark offset |
| `--accent-ink` | oklch(0.50 0.11 160) = #0b764d | celadon as text / focus ring / selection outline on white (5.7:1) |
| `--accent-wash` | accent / 0.45 | suggestion preview tint (multiply) |
| `--seal`, `--focus` | alias of `--accent-ink` | sealed page state, focus rings |
| `--danger` | alias of `--ink` | delete (always paired with a label) |

Primary buttons are **ink text on celadon** (poster convention), never white on celadon.

Strategy: landing = Committed (celadon carries hero blobs + CTAs). Studio = Restrained (celadon only for primary action, selection, suggestion).

## Typography
- Display: **Bricolage Grotesque** (`--font-display`), 600–800. Landing h1/h2, wordmark, welcome CTA only.
- UI / body: **Hanken Grotesk** (`--font-ui`), 400/500/600. Everything else.
- Mono: `ui-monospace` for `kbd` and data tables.
- Studio scale (rem, fixed): 12 / 13 / 14 / 16 / 18 / 22. Landing headings: fluid `clamp()`, h1 max 5.5rem, letter-spacing >= -0.02em.
- `text-wrap: balance` on h1–h3.

## Components
- Buttons: pill, Hanken 600, 44px min hit area. Primary = celadon fill / aubergine text (poster convention). Secondary = white fill / aubergine hairline. Focus = 2px `--accent-ink` ring, 2px offset.
- Toolbar: `--wash` pill, hairline border, tools 44×44, active tool = aubergine fill / paper icon.
- Panels (book, frame bar): white, `--wash` header, hairline.
- Suggestion preview: `--accent-wash`, `mix-blend-mode: multiply`.
- Icons: inline SVG, 20px, `stroke="currentColor"`, strokeWidth 1.6. No emoji.

## Motion — `lib/motion.ts`
One spring (420/34/0.8) and one ease-out (`cubic-bezier(0.16,1,0.3,1)`, 220ms). The ink-blot bloom on commit is the single signature animation. `prefers-reduced-motion` disables bloom, shake and pulse.

## Identity
Wordmark "baio" in Bricolage 700 with a 2px celadon misregistration offset. Mark: a cat head (aubergine outline, celadon offset silhouette) — `components/Logo.tsx`, `app/icon.svg`.
