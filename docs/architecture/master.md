# baio — Master Architecture

## 1. Architectural principle

No single model is responsible for seeing the canvas, deciding intent, generating output, and validating it. baio separates concerns, each with a narrow contract:

```text
Perception   →  what did the user draw?
Building     →  what tool calls turn that into page edits?
Validation   →  are those edits legal and sane?
Rendering    →  deterministic component tree → rendered page
```

Model layers exchange **compact JSON** only. Only the deterministic renderer produces markup. Malformed or malicious output is structurally impossible to render.

## 2. The two surfaces

The browser holds two stacked surfaces — this is the core interaction model:

```text
┌─ Ink layer ────────────────────────┐  transparent SVG on top —
│  ephemeral strokes, tracing paper  │  ink is INSTRUCTION, not content
├─ Page layer ───────────────────────┤  the actual website being built —
│  component tree → rendered stage   │  the persistent artifact
└────────────────────────────────────┘
```

- **Ink layer** — a transparent drawing surface. Strokes live here only until they're interpreted and applied; consumed ink is wiped. Digital tracing paper.
- **Page layer** — a blank slate ("digital paper") that accumulates real components. Its source of truth is a **component tree** (JSON); the renderer projects the tree into the DOM.

Pages themselves sit on an **infinite plane** (the liminal space): each page is a 1200px-wide object with page-native coordinates; the camera pans and zooms between a focused page and the plane. Loose elements and wires live on the plane, not inside any page. Ink coordinates map through one camera module (`lib/camera.ts`) so a gesture never mixes spaces.

The page is a **stage, not a document**: overlapping commits spawn stacking layers; z-order = layer order. Document-flow layout is deliberately excluded from live editing — it's what Seal / Frame (§10) are for.

## 3. Component tree — the page as code

```json
{
  "artboard": { "width": 1280, "height": 800 },
  "layers": [
    { "id": "background", "components": [] },
    { "id": "content", "components": [
      { "id": "cmp_1", "type": "navbar", "x": 0, "y": 0, "width": 1280, "height": 64,
        "props": { "links": ["Home", "About"] } },
      { "id": "cmp_2", "type": "button", "x": 540, "y": 400, "width": 180, "height": 48,
        "props": { "label": "Sign up" } }
    ]}
  ]
}
```

The tree **is** the code the builder model gets access to — same information as the HTML, but structured, so every proposed edit can be validated against a whitelist before touching the page, and rendering stays deterministic. The model never emits raw markup.

## 4. Domain packs: the engine is domain-agnostic

The pipeline doesn't know what a button is. A domain is data plugged into the engine:

```text
Domain pack = vocabulary        (what the vision prompt looks for)
            + templates         (type → (bbox, props) → rendered component)
            + domain validators (component-specific sanity rules)
            + training data     (FreeSolo examples: interpretation → tool calls)
```

- **MVP ships `web-ui` + `shapes` + `diagrams`**: navbar, button, form, image, video, placeholder, plus base geometry, four decoratives, and six diagram composites (bar, pie, Venn, timeline, periodic table, atomic structure).
- A **page** (`box + p`) is a product-side glyph: it is not a trained builder op. The client remaps a clean `p` glyph onto a page spawn in the liminal space after validation.

One schema rule makes this true from day one: **a recognition candidate always claims a *set* of stroke IDs** (size 1 for a button, size n for a sketched periodic-table region).

## 5. System overview

```text
┌───────────────────────────── Browser ─────────────────────────────┐
│  Ink layer (strokes)  +  Page layer (component tree → stage)      │
│  undo/redo · watercolor preview · accept/reject · Seal / Frame    │
│  camera (focused page ↔ liminal plane) · layers · wires           │
└──────────────┬────────────────────────────────────▲───────────────┘
               │ POST /api/autocomplete             │ validated tool
               │ ink screenshot + stroke data       │ calls, applied
               │ + current component tree           │ by confidence
┌──────────────▼────────────────────────────────────┴───────────────┐
│                        Next.js backend                            │
│  1. Vision layer      ink screenshot → candidates JSON            │
│                       (each claims a stroke set + label text)     │
│  2. Normalizer        snap bboxes to real stroke bounds,          │
│                       drop noise → canonical interpretation       │
│  3. Builder model     interpretation + component tree →           │
│                       tool calls (FreeSolo-ready)                 │
│  4. Validators        schema → geometric → domain pack            │
└───────────────────────────────────────────────────────────────────┘
```

## 6. Subsystems

### 6.1 Ink layer (client)

Pointer Events capture; stroke storage `{id, points[], width, color}`; undo/redo; screenshot export. Wipes consumed strokes after application; unconsumed (unrecognized / low-confidence) ink remains.

### 6.2 Vision layer

Multimodal model (Gemini 2.5 Flash-Lite; regular Flash as quality fallback), tightly constrained prompt assembled from the active domain packs' vocabularies, JSON-only output. Input is **image + points**: the ink screenshot plus a stroke manifest (ids, bboxes, point counts), so answers bind to stroke ids. **Describes, never places** (shapes-first pivot): returns per detection `{kind, glyph, text, colors, gradient_direction, confidence, stroke_ids[], bbox}` — a geometric description (7 kinds), never an op and never top-3 component candidates. Bboxes are advisory. Full detail: `architecture/ai-pipeline.md`.

### 6.3 Normalizer

Pure function. Snaps each candidate's bbox to the union of its claimed strokes' real bounds (geometry always comes from the strokes, killing placement drift), filters noise, emits the canonical interpretation.

### 6.4 Builder model

Input: canonical interpretation + stroke data + **current component tree**. Output: component commands per `shared/schemas/components-v1.json` — one command per detection: an `op` from the active vocabulary with bbox, layer, label/params (optional `replaces: <component_id>` to update an existing tree component instead of inserting), or `wait`. This is a tool-calling task over a small vocabulary, which is exactly FreeSolo's sweet spot. Phase 1: general model + strict prompt + structured output. Phase 2: FreeSolo adapter behind the same OpenAI-compatible interface — config swap, not refactor.

### 6.5 Validation pipeline

Three gates, fail closed: **schema** (Zod: known tools, registered component types, field types), **geometric** (in-artboard, sane sizes, target layer exists, referenced components/strokes exist), **domain** (pack rules — a navbar should be wide, a periodic table shouldn't be 40px tall). Any failure → response degrades to `wait`; never half-apply.

### 6.6 Renderer / stage (client)

Deterministic projection: component tree → DOM. Each pack template renders its type as absolutely-positioned HTML (or SVG for diagram-like components) inside its layer container. Stable IDs, selectable/movable/relabelable components. Two visual states: **watercolor preview** (translucent wash, bloom-in animation) and **applied** (crisp).

### 6.7 Confidence policy (client)

Three tiers govern what happens to validated tool calls:

| Tier | Behavior |
|---|---|
| **High** | Apply immediately, wipe consumed ink (Copilot-style) |
| **Medium** | Watercolor preview → user accepts (apply + wipe) or rejects (preview fades, ink stays) |
| **Low** | Do nothing; ink stays |

Plus an **"always ask" mode** that clamps High down to Medium for users who want veto power on everything. Applied edits are always undoable (restores ink too).

**The suggestion chips** (replaced the pre-pivot autocorrect pill bar — see `ai-pipeline.md` §1). Classifying 7 geometric kinds is a far easier question than ranking 66 component types, so there are no top-3 alternates anymore. Every watercolor ghost instead offers three one-tap choices:

```text
   ┌ ~ ~ ~ ~ ~ ~ ~ ~ ┐
   │      Login       │   ← watercolor ghost
   └ ~ ~ ~ ~ ~ ~ ~ ~ ┘
   [ Crisp it ] [ Keep as drawn ] [ Skip ]
```

**Crisp it** applies the template at the snapped geometry; **Keep as drawn** commits the raw ink as a `smooth_path` (the user's own silhouette); **Skip** drops the ghost and the ink stays. **Forced-component mode** covers wanting a specific op regardless of recognition. Every tap is a client-side action, not a model call — and every tap is also a gold training label (§6.8).

### 6.8 Feedback store

`POST /api/feedback` logs `{interpretation, tool_calls, tier, outcome}` — applied / accepted / rejected / undone / moved / relabeled / **alternative-chosen** — as append-only JSONL tagged by pack. Alternative-chosen (a keep-as-drawn or forced-op correction) is the highest-value event: the user explicitly states "your #1 was wrong, the truth is X" on real ink — a gold supervised correction for both the vision prompt and the FreeSolo adapter. Tomorrow's training data.

## 7. The ink lifecycle

```text
draw ──▶ press Autocomplete ──▶ interpret ──▶ build ──▶ validate
  ──▶ high tier: apply + wipe consumed ink
  ──▶ medium:    watercolor preview ──accept──▶ apply + wipe
  │                                 └─reject──▶ ink stays
  ──▶ low:       nothing; ink stays
repeat — the page accumulates, the ink keeps clearing
```

End state of a session: an empty ink layer and a real website on the stage.

## 8. Technology choices

| Layer | Choice | Why |
|---|---|---|
| App | Next.js + React + TypeScript | API routes + client in one repo |
| Ink layer | Transparent SVG + Pointer Events | Simple stroke capture, easy screenshot |
| Page layer | Component tree (JSON) → absolutely-positioned divs in layer containers | Divs are enough for a stage; tree keeps it validatable |
| Validation | Zod | Shared schemas client/server |
| Vision | Gemini 2.5 Flash-Lite (structured output; regular Flash as fallback) | Cheapest capable vision model (~$0.0002/call); accuracy bake-off on real sketches decides Lite vs Flash |
| Builder | Prompt-only baseline → FreeSolo adapter (Qwen3.5-0.8B SFT, `structured_outputs`) | Hosted via `flash deploy`, OpenAI-compatible = config-only swap |
| Frame / Seal | Claude (Sonnet) HTML + Vite project; stitch for multi-page | Semantic HTML/CSS is its strength; space Frame HTML is deterministic |

## 9. Key decisions (made)

1. **Two-surface model** — ephemeral ink over a persistent page; ink is instruction, not content.
2. **Component tree as code** — the builder edits structured state via tool calls; never raw markup.
3. **Stage, not document** — absolute positioning in layers; flow layout is Seal/Frame's job, not live editing's.
4. **Candidates claim stroke sets (1..n)** — region-level domains are plug-and-play data.
5. **Vision classifies, strokes place** — geometry from real stroke bounds.
6. **Confidence tiers** — don't-edit / suggest / auto-apply, plus always-ask mode.
7. **Domain packs** — `shapes` + `web-ui` + `diagrams` (six composites) ship; the engine stays pack-agnostic.
8. **Fail closed** — validation failure means nothing happens, never a broken page.
9. **Pages live on a plane** — focused page vs liminal space; `box + p` spawns pages; arrows become wires.

## 10. Extension points

### 10.1 Seal / Frame / Unframe (**shipped**)

Two user actions, two scopes:

- **Seal** (focused page, browse mode): the committed page goes through Claude on two lanes — HTML (`/api/frame`, a single-file site) and a Vite/React project (`/api/frame-app`). The page locks with a green border. Editing the wireframe **unseals** it (the tree stays canonical; framed output is a projection).
- **Frame** (liminal plane): every sealed page is **stitched** into a linked static site (`lib/frame/stitch.ts`, no model) and a slower lane (`/api/frame-space`) builds a routed multi-page project. Drawn **wires** (`/api/wire`, `logic-v1.json`) are the connections.
- **Unframe**: close the overlay — the editable wireframe underneath is untouched. The original "measure the framed DOM back into the tree" idea is not the live path; unsealing is "edit the wireframe again."

Optional module `modules/existing-site/`: import a live URL, sketch on top, Seal *edits* that document instead of generating from scratch (`NEXT_PUBLIC_MODULE_EXISTING_SITE=1`).

### 10.2 Others

- **HTML/CSS export** — **shipped** (Seal download HTML; Frame download site.zip / project.zip).
- **Figma connector** — project the component tree into Figma components. Still future.
- **`diagrams` pack** — **shipped** (six composites).
- **Auto-trigger** — pause-detection replaces Enter. Still future.
- **Scrollable / multi-page space** — **shipped** (camera, growing page, liminal plane, `box + p` spawns pages).
- **Wires / logic** — **shipped** (arrow → logic block). The reactive runtime that *executes* blocks on the live page is still thin.

## 11. Open decisions

- ~~One model call or two?~~ **Resolved: two** — vision (Gemini) + builder (FreeSolo); see `ai-pipeline.md`.
- **Watercolor technique** — SVG `feTurbulence`/`feDisplacementMap` + opacity animation vs. animated masks; spike in the renderer doc.
- **Stroke→candidate matching** — trust vision's claimed `stroke_ids` vs. re-derive by bbox IoU.
- **Wipe policy details** — wipe only consumed strokes (leaning) vs. wipe all ink on apply.

## 12. Repository layout

```text
baio/
├── product/                 # Next.js app (the deployable artifact)
│   ├── app/                 # studio, gallery, labeler, landing; api/*
│   ├── components/          # Studio, SketchLayer, Toolbar, GlyphBook, FrameOverlay…
│   ├── lib/
│   │   ├── vision/          # Gemini: describe, never decide
│   │   ├── interpretation/  # normalizer, snap, diagrams, pipeline
│   │   ├── models/          # baseline + FreeSolo clients
│   │   ├── packs/           # shapes/, web-ui/, diagrams/
│   │   ├── frame/           # Seal HTML, Frame-app, Frame-space, stitch
│   │   ├── wire/            # arrows → logic-v1 blocks
│   │   ├── space.ts         # liminal plane: pages, loose, wires
│   │   └── datagen/         # synthetic scenes + corruption
│   ├── modules/existing-site/  # optional: sketch onto a live URL
│   └── shared/schemas/      # shapes-v*, detection-shapes, logic-v1
├── freesolo/                # training project (environment.py, dataset/, configs/)
├── scripts/                 # eval harness, dataset gen, showcase
└── docs/                    # vision, PRD, architecture, features, pitch
```

## 13. Component deep-dive docs

1. `architecture/ai-pipeline.md` — the full AI component pipeline: vision (Gemini), normalizer, FreeSolo builder (contract, training, serving), validation gates, fallback chain
2. `architecture/vocabulary.md` — ops, glyphs (including product-side `p` → page), disambiguation
3. `architecture/wave3-semantics.md` — containment: details route into the parent, never spawn siblings
4. How to drive the product: `docs/features/README.md`
