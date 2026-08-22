# baio — Recognition Vocabulary (shapes-v1 / shapes-v2)

**The pivot (2026-07-18): the canvas primitive is the SHAPE, not the website component.** Users draw approximate shapes; baio makes them crisp and styled. Semantics are opt-in via **glyphs** — a single letter alone inside a box. **Wave 1.5 (2026-07-19, shapes-v2):** six diagram ops join the vocabulary (16 → 22, §1.5) — recognized as multi-stroke *composites* reported by vision as a single `scribble`, mapped by the builder via bbox/color signatures. This doc is the **single source of truth** consumed by four things:

1. The **labeler**'s label list and number-key ordering
2. The **vision prompt**'s kind/glyph vocabulary + disambiguation rules
3. The **op whitelist** in `shared/schemas/shapes-v1.json` / `shared/schemas/shapes-v2.json`
4. The **template backlog** (each op needs a renderer)

Cap discipline: every op costs schema entry + renderer + prompt vocabulary + training examples.

Pre-pivot component vocabulary (18/66 ops): retained in `shared/schemas/components-v1.json` / `components-v2.json` for the `flash-1784430057` run — do not extend it.

## 0. The no-coordinates principle

**Geometry from ink, semantics from the model, precision from code.**

The builder model outputs **no coordinates** — no x/y/width/height anywhere in its schema. Geometry always derives deterministically from the source strokes: centroid + extents for boxes and ellipses, endpoints for lines and arrows, a smoothed path for freeform. The model only outputs:

```text
op          what the ink should become        (semantic, 16-op enum)
params      styling knobs (fill, gradient…)   (conventions, open object)
snap        one named geometry adjustment     (policy enum, default none)
```

This kills placement drift by construction: a model cannot misplace what it never places. The only geometry influence it has is choosing a **snap policy** from a closed enum (e.g. `full_width_top` for a navbar) — and the snap math itself is pure code. Full snap table: `shared/schemas/README.md`.

## 1. The shapes-v1 cut — 16 ops

### Base shapes (6) — every stroke-set becomes one of these unless a glyph or decorative signature says otherwise

| # | Op | Sketch signature | Notes |
|---|---|---|---|
| 1 | `rect` | four roughly straight sides, roughly closed | crisped to a clean rectangle; `snap: square` if nearly square |
| 2 | `ellipse` | closed convex curve, roundish | circle when nearly round (`snap: square`) |
| 3 | `line` | single open stroke, low curvature | `straighten_h`/`straighten_v` when near-axis |
| 4 | `arrow` | line + head (chevron/triangle) at one end | direction from ink endpoints |
| 5 | `text` | handwriting: a word, phrase, or sentence | content preserved, typeset by the renderer |
| 6 | `smooth_path` | any freeform closed/open doodle | kept as **the user's own shape**, smoothed (Catmull-Rom); with a gradient fill this covers the old `blob` |

### Glyph components (6) — a single letter alone inside a box opts into semantics

| # | Op | Glyph | Renders as |
|---|---|---|---|
| 7 | `image` | box + `i` | image placeholder frame |
| 8 | `form` | box + `f` | stacked labeled inputs + submit button |
| 9 | `button` | box + `b` | styled button (any `text` nearby/inside routes to its label) |
| 10 | `navbar` | box + `n` | full-width top bar (`snap: full_width_top`) |
| 11 | `video` | box + `v` | video player frame |
| 12 | `placeholder` | box + `?` | generic "something goes here" slot |

**The rule: a single letter alone in a box = glyph; a word or sentence = text content.** "i" in a box → `image`; "Login" in a box → a rect containing the text "Login" (or a `button` label if the box carries the `b` glyph too — see §2).

### Decorative (4) — the model emits `{op, from, params}`; the renderer owns the beauty

| # | Op | Sketch signature | Renderer draws | Params |
|---|---|---|---|---|
| 13 | `wave_divider` | long free curved-crest squiggle at a section boundary | smooth layered bezier wave (`snap: full_width`) | amplitude, layers, flip, seed |
| 14 | `night_sky` | dark-ish rect + scattered dots/asterisks, upper region | gradient sky + procedural starfield | density, size_range, cluster_bias, seed |
| 15 | `sparkles` | small 4-point asterisk scribbles near a heading | 4-point star cluster ("AI shimmer") | count, size_range, spread_zone, seed |
| 16 | `aurora_gradient` | loose overlapping scribbled ovals in a hero region | blurred color-mesh glow (Stripe/Linear look) | palette, blob_count, blur_radius, seed |

`blob` is **removed** — `smooth_path` with a gradient fill covers it, and keeps the user's own silhouette instead of substituting a generic potato.

Every decorative template takes a `seed` — re-rolling the seed live (scatter reshuffles) is itself a demo beat.

Plus the **`wait`** command variant (not an op): calibrated abstention on a detection that shouldn't become anything yet.

## 1.5 The wave-1.5 cut — +6 diagram ops (shapes-v2, 22 ops)

Promoted from the bench (`bar_chart`, `pie_chart`, `venn_diagram`, `timeline`) plus two new ops (`periodic_table`, `atomic_structure`). Detection kinds stay the **same 7** — these arrive as multi-stroke composites; vision may report an obvious diagram composite as a **single detection with `kind: "scribble"`** (plus the existing fields), and the builder maps it via **bbox/color signatures** (measurable thresholds in `lib/datagen/scenes.ts` POLICY, kept pairwise disjoint from the four decorative signatures).

| # | Op | Sketch signature | Signature thresholds (POLICY) | Params (seeded, optional) | Snap |
|---|---|---|---|---|---|
| 17 | `bar_chart` | 3–6 vertical rects of varying heights sharing a baseline, often L-shaped axes strokes | exactly 1 **bright** color; w 300–520; h ≥ 160; aspect 1.3–2.4 | `values[]`, `seed` | `none` |
| 18 | `pie_chart` | circle with 2+ radial lines from center | exactly 1 bright color; near-square; w,h ≥ 330 | `values[]`, `seed` | `none` |
| 19 | `venn_diagram` | 2–3 overlapping circles | ≥ 2 colors; y ≥ 520 (below aurora's ceiling); w 380–760; aspect 1.4–2.4 | `sets`, `seed` | `none` |
| 20 | `timeline` | long horizontal line with 3+ tick marks or dots | w ≥ 0.6·width (wave band); h ≤ 40 (< wave's new 48 floor) | `events`, `seed` | `full_width` when w ≥ 0.8·width, else `none` |
| 21 | `periodic_table` | wide grid-ish cluster of many small rects, or rect grid with 1–2 letter cell labels | ≤ 1 color; y ≥ 90; w ≥ 560; aspect 1.5–2.6 | none by default | `none` |
| 22 | `atomic_structure` | small filled circle with 1+ concentric ellipses, dots on the rings | exactly 1 bright color; near-square; w,h 210–310 | none by default (`shells` allowed) | `none` |

"Bright" = luminance ≥ the `darkLuminance` threshold (60). The bright-ink rule is what keeps `bar/pie/atomic` disjoint from `night_sky` (needs dark), from `aurora`/`venn` (need ≥2 colors), and from stray/ambiguous scribbles (colorless or dark → `wait`). `wave_divider` gains a **min-height floor (48px)** so the timeline band (h ≤ 40) never overlaps it. Cell letters in a periodic-table grid are **not glyphs** (a glyph is one letter alone in ONE box). Legality: all six are legal from kind `scribble`; `periodic_table` also from a plain `rect`; `wait` is always legal (`lib/validate/shapes.ts`, wave 2).

## 2. The glyph drawing book (the baio cheat-sheet)

The printable prop. Six glyphs, deliberately tiny — grow the set only when demand is proven:

```text
box + i  → image        box + n  → navbar
box + f  → form         box + v  → video
box + b  → button       box + ?  → placeholder
box + p  → page         (product-side: spawns a page on the plane, not an element)
```

Rules of the book:

- **One letter, alone, inside a box.** That's the entire trigger. Case-insensitive.
- **A word is never a glyph.** "b" → button; "buy" → a rect containing the text "buy".
- Glyph boxes may also contain a word elsewhere: the letter picks the op, the word becomes its `label` param ("b" + "Login" → a Login button).
- No glyph, no semantics: a plain box stays a crisp `rect`. Semantics are **opt-in** — the default experience is shape beautification, never surprise components.
- The old X-in-a-box = image convention is retired; `image` is `box + i` only. (An X-box now crisps to a rect + two lines — exactly what was drawn.)
- **`p` is not a trained builder op.** The frozen 22-op grammar never learned `page`. Vision still reports glyph `"p"`; the builder treats it as an unknown glyph (rect/placeholder fallback); `lib/recognize.ts` remaps a *clean single-letter* `p` onto op `page` after validation. Committing that result **spawns a new page object** in the liminal space (`lib/space.ts`), it does not land an element on the current page. Ambiguous ink cannot spawn a page.

## 3. Labeler menu ordering

Labels are selected from the labeler's hamburger menu (number keys are the **color palette**, not label jumps — see `ai-pipeline.md` §6). Menu order = expected drawing volume during the blitz, so `Tab`-stepping walks the highest-value labels first:

```text
rect, ellipse, line, arrow, text, smooth_path,
button, image, form, navbar, video, placeholder,
wave_divider, sparkles, night_sky, aurora_gradient
(Phase 2 labels follow, grouped as in label-tree.md)
```

## 4. Disambiguation rules (feed verbatim into the vision prompt)

Recognition is now two much easier questions — **kind classification** (7 geometric kinds: `rect`, `ellipse`, `line`, `arrow`, `scribble`, `smooth_path`, `text_writing`) and **glyph reading** (a single character alone in a box, else null). Kinds are *geometric* (what it looks like); ops are *semantic* (what to make); the builder maps kind + glyph + context → op.

**Kind keys:**

- Roughly-closed, roughly-4-corners → `rect`; closed and roundish → `ellipse`; closed and irregular → `smooth_path`
- Open, low curvature → `line`; open with a terminal chevron/triangle → `arrow`
- Handwriting → `text_writing` (report the characters); dense chaotic ink with no readable form → `scribble`
- **Glyph vs. text:** a *single letter alone* inside a box → report it in `glyph`; any word/sentence → report it in `text`, glyph stays null

**The squiggle family** (still our hardest confusions, now feeding decorative ops):

- *Curvature*: waves are **arcs**; zigzags/mountains are **straight segments**
- *Amplitude & count*: mountains = 1–3 big peaks; zigzag = many uniform peaks; waves = repeated crests, often stacked rows
- *Context*: a long free `scribble` of stacked crests at a section boundary → `wave_divider`; small 4-point asterisks near text → `sparkles`

**Position priors (real signal, decorative only):** dark rect + scattered dots in the upper region → `night_sky`; loose overlapping ovals in a hero region → `aurora_gradient`; long wave squiggles anchor at section boundaries.

**Color/gradient signal:** report observed ink colors per detection; if strokes shade from one color to another, report `gradient_direction` (`down` / `right` / `diagonal`) — the builder turns it into a gradient fill param.

**Anti-signal:** stroke *direction* is cultural noise (86% of US users draw circles counterclockwise, ~80% of Japanese clockwise) — classify on final geometry only, never on stroke order/direction.

## 5. The bench (wave 2 — do not add without paying the 4-cost)

Concept unchanged from the pre-pivot bench; entry to wave 1 is closed.

**Web-ui components** (candidates for new glyphs or composite recognition): `footer`, `card`, `card_grid`, `hero`, `search_bar`, `dropdown`, `text_input`, `cta_banner`, `tabs`, `modal`, `accordion`, `carousel`, `table`, `sidebar`, `testimonial`, `logo_cloud`, `newsletter_signup`, `pricing_table`, `image_gallery`, `map`
**Decorative:** `dot_grid`, `grid_lines`, `hero_glow`, `layered_waves`, `hand_drawn_underline`, `hand_drawn_highlight`, `shape_scatter`, `confetti`, `concentric_rings`, `squiggle_accents`, `landscape_silhouette`, `tiled_pattern`, `noise_grain`, `topo_contours` †, `low_poly_mesh` † (`hand_drawn_arrow` absorbed by the `arrow` base shape)
**Diagrams (16 remaining — `bar_chart`, `venn_diagram`, `timeline`, `pie_chart` promoted to wave 1.5, §1.5):** `flowchart`, `line_chart`, `table_grid`, `org_chart`, `quadrant_chart`, `scatter_plot`, `funnel_chart`, `cycle_diagram`, `pyramid_chart`, `coordinate_plane`, `mind_map`, `gantt_chart`, `sequence_diagram` †, `block_diagram` †, `state_diagram` †, `er_diagram` †

**Explicitly not ops:** headings/paragraphs (both are `text`), blob (`smooth_path` + gradient), sub-field widgets (checkbox/radio/toggle/slider — strokes inside a `form` box), hamburger (a navbar state), icons/badges/avatars-as-ops (too small to classify reliably), alerts/toasts/spinners (never sketched). Full absorption table: `label-tree.md`.

## 6. What this doc feeds

```text
vocabulary.md ──▶ labeler label list + number keys      (tools/labeler)
              ──▶ vision prompt kinds/glyphs + rules    (lib/vision)
              ──▶ op whitelist                          (shared/schemas/shapes-v1.json, shapes-v2.json)
              ──▶ template backlog                      (lib/packs/shapes, lib/packs/web-ui)
              ──▶ synthetic generator op distribution   (freesolo/dataset)
```

Change an op here → all five downstream artifacts must update together. That's the point of having one file.
