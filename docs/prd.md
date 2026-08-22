# baio — Product Requirements Document

## 1. Summary

baio is sketch-to-interface autocomplete. The user draws on a transparent **ink layer** floating over a persistent **page layer** (the actual website being built — see `architecture/master.md` §2); baio recognizes each sketched shape (navbar, button, card, wave, night sky…), and proposes real structured components at exactly the positions drawn. Proposals bloom in as a translucent watercolor preview with one-tap suggestion chips (Crisp it / Keep as drawn / Skip); accepting applies the component to the page and wipes the consumed ink. baio is a predictive editing system, not an image generator.

**Shapes-first pivot (2026-07-18):** the canvas primitive is now the **shape**, not the website component. Users draw approximate shapes; baio makes them crisp and styled (a wobbly box becomes a clean rect, a doodle becomes a smoothed path). Semantics are **opt-in via glyphs** — a single letter alone inside a box (`i` → image, `b` → button, `n` → navbar, …). The builder emits **no coordinates**: geometry comes from ink, semantics from the model, precision from code. Canonical vocabulary, glyph book, and disambiguation rules: `architecture/vocabulary.md`.

This PRD covers the weekend prototype (hackathon MVP).

## 2. Problem

Getting an interface idea out of your head is a tradeoff today:

| Approach | Failure mode |
|---|---|
| Pen and paper / raw sketching | Fast and free, but the result is a dead end — not structured, not shareable, not iterable |
| Figma / design tools | Structured, but slow — menus, component browsers, precision dragging interrupt thinking |
| AI mockup generators (text → image) | Uneditable output, detached from what you already drew, no spatial control |

baio keeps the speed and freedom of sketching and produces the structured result of a design tool. The sketch itself is the spec.

## 3. Goals & non-goals

### Goals (MVP)

- Working end-to-end loop: **sketch → recognize shapes → watercolor preview of components → accept → editable wireframe**
- A fixed vocabulary of ~8 UI components, all **SVG-rendered on the same canvas as the strokes** (one coordinate system — no HTML overlay, no alignment problem)
- Per-shape local recognition: one misread shape never ruins the page
- All output schema-validated and template-derived
- Demo-able in under 3 minutes: blank canvas → sketched landing page → structured wireframe

### Non-goals (MVP)

- Live HTML rendering or HTML overlay on the canvas
- HTML/CSS export (stretch goal only), Figma connectors (future)
- Native tablet app (browser canvas only)
- Automatic triggering (explicit Autocomplete button; pause-trigger is stretch)
- Responsive layout inference — components render at sketched positions, absolutely placed
- Diagram families (periodic table, coordinate plane, flowcharts) — see §12; a parallel FreeSolo training track may pursue these if time allows, but they are not on the MVP critical path

## 4. Target user

A designer, engineer, or founder wireframing a web page — someone who thinks faster than they can operate Figma. The demo persona: sketching a landing page live on stage in ~10 strokes.

## 5. Sketch vocabulary → component mapping

The recognition contract. Each is local — recognizable from the shape and its immediate context alone.

**Shapes-first:** wave 1 is the **shapes-v1 16** — 6 base shapes (`rect`, `ellipse`, `line`, `arrow`, `text`, `smooth_path`), 6 glyph components (box + single letter: `image`, `form`, `button`, `navbar`, `video`, `placeholder`), 4 decorative (`wave_divider`, `night_sky`, `sparkles`, `aurora_gradient`). A plain shape stays a crisp shape; semantics require a glyph — never surprise components. **The canonical op tables, phases, and rankings live in `architecture/vocabulary.md` + `architecture/label-tree.md`** (16 ops in wave 1, a 55-item bench for wave 2). The tables below are the original pre-pivot illustrative core, kept for historical context (the X-box = image convention is retired; `avatar` was absorbed — too small to classify reliably):

| You draw | baio substitutes |
|---|---|
| Wide rectangle spanning the top | **Navbar** (logo block + nav links) |
| Small rounded rectangle, optionally with scribble inside | **Button** |
| Rectangle with an X through it | **Image placeholder** |
| Rectangle with short horizontal lines inside | **Card** (with text) |
| Long thin rectangle with a scribble | **Text input** |
| Short single squiggle / large text | **Heading** |
| Multiple stacked horizontal squiggles | **Paragraph / text block** |
| Circle | **Avatar / icon** |

Written text near a shape (e.g. "Login" inside a button sketch) becomes the component's label.

### Extended majors (add after core 8 works)

| You draw | baio substitutes |
|---|---|
| Very wide rect below navbar with big squiggle | **Hero** |
| Wide rect at the bottom | **Footer** |
| Tall rect on the left/right edge | **Sidebar** |
| Rounded rect containing several thin rects | **Form** |
| Column of short lines with leading dots/dashes | **List** |
| Thin full-width horizontal line | **Divider** |

### Decorative elements (the "cool" set — why the vision model earns its keep)

The model emits only `{op, bbox, params}`; the **renderer owns all the beauty** (procedural, seeded, reproducible, editable):

| You draw | baio substitutes |
|---|---|
| Horizontal squiggle spanning a section boundary | **Wave divider** (amplitude, layers) |
| Dark-ish rect + scattered dots/asterisks | **Night sky** (gradient + procedural stars) |
| Small asterisk scribbles | **Stars / sparkles** |
| Bumpy arc line (top vs. bottom of region) | **Clouds / mountains** |
| Circle in a sky/hero region | **Sun / moon** |
| Rough blob | **Gradient blob accent** |

Hard cap for v1: core 8 + extended + decorative ≈ **16–20 ops**. Every op costs a schema entry + renderer + prompt vocabulary + training examples — resist creep.

## 6. Core features

### 6.1 Drawing canvas (P0)

Browser SVG canvas; pen/finger/mouse via Pointer Events; stroke rendering, undo/redo, erase, clear. Strokes, previews, and components share one SVG coordinate system.

### 6.2 Autocomplete trigger (P0)

Explicit **Autocomplete** button. Stretch: auto-trigger after a drawing pause.

### 6.3 Watercolor ghost preview + suggestion chips (P0)

Recognized shapes bloom in as a translucent watercolor wash at the sketched positions. Post-pivot the pill bar is a simpler affordance: each ghost offers **`Crisp it ✓ | Keep as drawn | Skip`** (vision now reports a single geometric kind + confidence, not top-3 component candidates); when the user wants a specific component regardless of recognition, **forced-component mode** (§6.4b) covers it. Every tap is an instant client-side re-render and is logged as a gold correction label. Accept all, reject, or keep drawing (dismisses). P1: accept/reject per shape.

### 6.4 Editable result (P0)

On accept, the preview dries into individual vector objects. Every component is selectable, movable, and relabelable. The original pen strokes it replaced are removed (undoable).

### 6.4b Forced-component mode (P1)

Pick a component type from a palette *before* drawing; the next strokes are guaranteed to become that component. Under the hood: vision classification is skipped — a detection is synthesized with the chosen type at confidence 1.0 and handed to the builder, which still does geometry snapping and label extraction. The ambiguity escape hatch and demo safety net.

### 6.5 Abstention (P0)

Shapes below the confidence threshold are left untouched as raw strokes — no forced guesses. Knowing when not to substitute is a feature.

### 6.6 Feedback capture (P1)

Log accept/reject/move/relabel per suggestion as future training data.

### 6.7 Chrome & brand (P0)

Two-ink risograph, not cream-paper AI chrome. Pure white paper, aubergine ink for structure, celadon for the one primary action and the suggestion state. Wordmark is **baio** in Bricolage Grotesque with a celadon misregistration; the mark is a cat head. Tokens: `product/app/tokens.css`. Full system: `product/DESIGN.md`.

## 7. User flow

```text
Open app → clean canvas
Sketch rough page (boxes, squiggles, labels)
Press Autocomplete
  → "analyzing" indicator (<3s target)
  → watercolor components bloom in at sketch positions
     (unrecognized strokes stay as ink)
Accept → wireframe dries into editable vectors
  or Reject / keep drawing → preview fades out
Repeat — sketch more, autocomplete again, page grows
```

## 8. Functional requirements

- **FR1** — Capture canvas as PNG screenshot + structured metadata (dimensions, stroke count/bounds)
- **FR2** — Vision layer (Gemini) returns constrained JSON per `shared/schemas/detection-shapes.json`: per-detection geometric **kind + glyph + text + colors + gradient direction** with confidence, claimed stroke ids, and advisory bbox
- **FR3** — Builder layer (FreeSolo, text-only) converts detections into shape commands per `shared/schemas/shapes-v1.json` — one command per detection (`op` + `params` + `snap`, **no coordinates**, or `wait`), each linked to its source detection via `from`
- **FR4** — Three validation levels: schema (Zod), geometric (in-bounds, sane sizes, no heavy overlap), domain (valid component IDs, labels sane)
- **FR5** — Deterministic renderer maps component IDs → SVG template functions; the model never emits raw SVG, scripts, URLs, or event handlers
- **FR6** — Strokes not consumed by an accepted substitution are preserved untouched
- **FR7** — Feedback endpoint records suggestion outcomes

## 9. Success metrics (weekend targets)

```text
Shape → component recognition:  >80%
Valid command responses:        >95%
Snap-policy accuracy:           >85%
Median completion latency:      <3 seconds
```

Plus qualitative: on-stage acceptance rate; "sketched a landing page in under 60 seconds."

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Shape ambiguity (button vs. input vs. card) | Small vocabulary with distinct sketch conventions; use handwritten labels; abstain below threshold |
| Inaccurate vision bboxes | Snap component bbox to the source strokes' bounding box — vision only needs to classify; geometry comes from the strokes |
| Invalid model output | Structured output + Zod + component whitelist; fall back to no suggestion |
| Latency (two model calls) | Manual trigger, small schemas, analyzing indicator; possibly single vision call that classifies directly |
| Overengineering | 8 components, SVG-only, no export, no auto-trigger — protect the loop |

## 11. Open questions

- Watercolor reveal implementation (SVG filters + opacity animation vs. animated masks) — resolve in renderer spike
- Resolved: two model calls (Gemini vision → FreeSolo builder); full pipeline detail in `architecture/ai-pipeline.md`

## 12. Stretch track: diagrams via parallel FreeSolo training

The engine is domain-agnostic — a button and a periodic table are both `(bbox, params) → rendered component`. Since FreeSolo usage is unlimited (founder-confirmed) and training is agent-run, the **diagrams pack runs as a fully parallel track**, not an "if time allows":

- Candidates already claim stroke *sets* (1..n), so region-level components (two sketched cells → one periodic table) need zero schema changes — just a second vocabulary, templates, and dataset
- Training data generation and the SFT sweep run in parallel without touching the MVP critical path
- Demo spice only: if diagram recognition is flaky by Sunday, the website-builder demo stands alone

Human effort for the MVP totals ~2–3 hours across four checkpoints (schema sign-off, ~40–60 labeled drawings in the labeling window, canonical-example review, promote decision) — see `architecture/ai-pipeline.md` §4.6 and §6.
