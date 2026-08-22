# baio — Features Guide

Everything the app can do and how to drive it. This file is the source for the in-app **book** (the draggable 📖 on the canvas — click it for this index). App lives at `/studio` (from `product/`).

## 1. The two modes

| Mode | What it is | Get there |
|---|---|---|
| **Browse** (default) | Your page as a real website — buttons hover, checkboxes click, toggles flip. No chrome, just the page and a quote. | **✓ Done**, `Esc` (with nothing pending), or `H` |
| **Edit** | A white glaze lifts over the page and the drawing tools come out. | **✏ Edit** pill (top-right) or `H` |

## 2. Drawing (edit mode)

| Key | Tool |
|---|---|
| `d` | pen |
| `e` | eraser — drag near a stroke to remove the whole stroke (works on typed labels too) |
| `t` | text — click to place a typed label |
| `m` | move/select — drag, resize (corner handle), delete committed elements |
| `1`–`9` | ink color (aubergine, jade, mustard, cocoa, teal, sky, violet, rose, graphite) |
| custom swatch | any colour via the native picker |
| `w` / `s` | brush size up / down (2–24px) |
| `Enter` | recognize the sketch → ghost preview → `Enter` again commits |
| `Esc` | deselect → shake off sketch → exit to browse |
| `Ctrl/Cmd+Z` | undo (strokes, text, whole erase-drags) |
| `Delete` / `Backspace` | remove the selected element |

Press **Enter** and the ink goes through the AI pipeline (Gemini describes → trained FreeSolo model decides → validators gate). High-confidence results commit as crisp components; a watercolor splotch blooms over each and the consumed ink shakes away.

If recognition fails (network, or the Gemini free tier's ~15 req/min rate limit), a pill appears top-right saying so — your ink is always kept; wait a moment and press Enter again. Silence never means "broken."

Missing API keys show a first-run setup notice. You can still draw, drop photos, and import a site without them; Enter and Seal need `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` respectively.

## 3. Shapes — draw anything, it gets crisp

Every **enclosed shape is a shape**: drawn approximately, filled with the color you drew/shaded it with.

| Draw | Get |
|---|---|
| rough 4-sided box | crisp `rect` (near-square snaps square) |
| roundish closed loop | `ellipse` (near-round snaps to circle) |
| single open stroke | `line` (near-axis strokes straighten) |
| line with an arrowhead | `arrow` |
| handwriting (word/phrase) | typeset `text` |
| any freeform closed doodle | `smooth_path` — YOUR silhouette, smoothed, never replaced |

**Fills:** shade/hatch inside an outline and the shape fills with that color. Shade from one color into another → a gradient. Prefer your raw ink? Every preview offers **keep as drawn**.

## 4. Glyphs — the only thing that adds function

A **single letter alone inside a box** turns the shape into a working component. A word is never a glyph ("b" → button; "buy" → a box containing the text "buy").

```text
box + b  → button          box + n  → navbar (snaps full-width top)
box + f  → form            box + v  → video player
box + i  → image frame     box + ?  → placeholder slot
box + p  → page            (spawns a new page on the plane — not an element)
```

Words near/inside a glyph box become its **details**: `b` + "Login" → a button labeled *Login*. No glyph → no behavior, ever — plain shapes stay plain.

`p` is special: committing it does not land a component on the current page. It **spawns a new page object** on the infinite plane (§10). Ambiguous ink never becomes a page — only a clean, single-letter `p`.

## 5. Details — words and colors that style, not label

Inside or beside a shape:

- **A label word** → the component's text ("Login", "Search", a navbar brand)
- **A color word** ("purple", "teal") → that fill
- **A theme word** ("rainbow", "sunset", "ocean", "neon", "fire", "pastel", "gold") → a themed gradient. `b` + "Login rainbow" → a rainbow-gradient Login button
- **Shading in ink** always wins over words if both are present

## 6. Decoratives

| Draw | Get |
|---|---|
| long wavy squiggle at a section edge | `wave_divider` — layered bezier waves, full-width |
| dark-shaded rect + scattered dots (upper page) | `night_sky` — gradient sky + procedural starfield |
| little 4-point asterisks near text | `sparkles` |
| loose overlapping scribbled ovals in a hero area | `aurora_gradient` — blurred color-mesh glow |

All are procedural + seeded — every re-render is identical.

## 7. Diagrams (6 live)

Sketch the *skeleton* of a diagram and the whole cluster becomes one crisp composite: **bar_chart** (axes + bars), **pie_chart** (circle + wedge lines), **venn_diagram** (2–3 overlapping circles), **timeline** (long line + tick marks), **periodic_table** (big grid of small boxes — renders all 118 elements), **atomic_structure** (nucleus + orbit rings).

One diagram per Enter, with clear space around it.

## 8. Picture frames

Drag an image file from your desktop onto the canvas — **works in every mode and tool**:

- Dropped **on any committed enclosure** (`box + i` frames, rects, ellipses, **or any closed doodle**) → the photo fills it. Non-rectangular frames **crop the photo to your drawn silhouette**, ink outline kept on top. The frame under your drag glows amber.
- Dropped **on empty paper** → an image frame is **auto-created** right there, sized to the photo's own aspect ratio.
- **⌘V pastes** a copied image/screenshot — into the selected frame if one is selected, otherwise a new frame mid-viewport.
- Double-click a frame (move mode) to replace its photo. Resize and the crop follows.

## 9. Layers

Commit something overlapping an existing element → it lands on a **new layer above it**. A rail of thin lines appears at the right edge (≥2 layers), topmost first.

Click a line to **focus that layer** — a saturation ladder, not a curtain: the focused layer pops to full color, layers *behind* it wash out (visible but muted), layers *above* it fade toward invisible, more so the higher they sit. Only the focused layer is interactive while peeled. Click the focused line again (or the ring above the stack) to restore.

**Focusing is slicing**: commit something while focused and it stacks against the visible slice — if it overlaps the focused layer it's **inserted between the strata** (everything above lifts by one) and the focus follows your new element. **Seal captures the focused view** (focused layer + those below), so you can seal one stratum of the page.

## 10. The page and the plane

A page is a 1200px-wide object sitting on an **infinite plane** (the liminal space). Two views:

| View | What you see | How |
|---|---|---|
| **Focused** | Inside one page — it fills the viewport, with window chrome (traffic lights + name) across the top | Default for a new project. Click a page object on the plane to fly in. |
| **Liminal** | Zoomed out onto the plane. Pages are bordered windows; loose elements sit on the paper around them | Red or green traffic light, or the close control. Wheel / drag the empty plane to pan. |

**Growing a page (focused):** wheel-down at the bottom and the paper **grows**; the **+ space** toolbar button adds a screenful too. Draw at any depth; chrome stays put. Hard cap ~15,000px (browser canvas limit).

**On the plane:** you can draw loose elements that belong to no page, drop photos, and connect objects with arrows (§12). Click a page to focus it. Work autosaves to the browser (pages, loose elements, wires, imported sites).

## 11. Elements dock

A column on the left lists everything on the focused page (topmost first). Open by default on wide windows; folded to a thin rail on narrow ones.

- Click a row to select it on the canvas
- Double-click the name to rename
- × deletes
- An imported site (when the module is on) pins a row above the list

## 12. Wires — arrows become logic

Draw an **arrow** whose tail and tip land on two *different* objects — two elements, or an element and a page, or two pages. baio consumes the ink and asks `/api/wire` what the connection means (click → navigate, submit → write data, and so on). The connection is stored on the plane; Frame uses sealed pages plus those links when it builds a multi-page site.

If the arrow hits bare paper, it stays a drawn arrow. If wiring fails, a toast says so and the dangling wire is removed.

## 13. Seal and Frame

These are two steps, not one.

**Seal** (browse mode, focused on a page, with at least one element): the celadon **Seal** pill. The wireframe goes to Claude on two lanes:

1. **HTML** — a complete, semantic, responsive, interactive single-file website (~45–60s; the veil rotates art quotes). Download HTML, or **Unframe** — your editable wireframe underneath is untouched.
2. **Project** — a Vite/React app zip (`baio-app.zip`) fills in behind the overlay.

A sealed page wears a **green border** and is ready to join a space-level Frame. Editing the wireframe **unseals** it.

**Frame** (liminal view, at least one sealed page): the **Frame** pill on the plane. Instantly stitches every sealed page into a linked static site (injected nav, rewritten links) — no extra model call for HTML. A slower lane builds a routed multi-page project behind it. Download **site (.zip)** and **project (.zip)**. Page switcher in the overlay walks the HTML files (sandbox iframes cannot follow in-page links).

Missing `ANTHROPIC_API_KEY` is a clean 503, not a hang.

## 14. Start from a site (optional module)

Flag: `NEXT_PUBLIC_MODULE_EXISTING_SITE=1` in `product/.env`. Off by default — no UI, `/api/import-site` 404s, Seal is unchanged.

With the flag on, browse mode shows **Start from a site** (left of Seal):

1. Paste a live URL, or drop an `.html` file onto the page.
2. **Sketch on top** — the site paints faintly under your ink as a guide. Seal sends the original document plus your sketch; Claude *edits* the existing site instead of generating from scratch.
3. **Turn into elements** — backgrounds, buttons, headings, paragraphs, links, inputs, images, and nav are measured from a hidden render and placed as ordinary editable elements. **Choose elements…** keeps a subset.

Private/loopback URLs are blocked. Best on pages under ~100KB. The Vite app lane still generates from sketched elements only; the stitched multi-page HTML site includes the modified page.

## 15. The pipeline (what happens on Enter)

```text
ink screenshot + stroke manifest (with per-stroke colors)
  → Gemini vision      describes only: geometric kind, glyph, text, colors
  → normalizer (code)  geometry from YOUR strokes; containment (what's inside what)
  → FreeSolo builder   trained model: kind+glyph+context → op + params (no coordinates!)
  → validators         fail closed — junk output means nothing happens, never a broken page
  → renderer           deterministic templates; the model can't draw an ugly button
```

The builder emits **zero coordinates** — geometry always derives from your actual ink, so nothing can ever be misplaced. A box + `p` is remapped to a page spawn after the model, so spawning a page never depends on the trained 22-op grammar.
