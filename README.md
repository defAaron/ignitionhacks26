# baio — autocomplete for drawing

> In the figments of your imagination, a world appears — picturesque scenes that flow like a river. And every second, it fades. Drawing is the least restrictive way to capture an idea, but the pen is slow — by the time the hand catches up, the palace in your mind is a fragment of what it was.
>
> Our essays have autocomplete. Our code has autocomplete. **Shouldn't our imagination?**

baio is autocomplete for drawing: digital paper with magic in it. Sketch a rough webpage — a box for a navbar, a letter `b` for a button, a purple-shaded circle — press **Enter**, and real, editable components **bloom in like wet ink**, exactly where you drew them. **Seal** freezes a page into a working site; **Frame** stitches every sealed page on the plane into a multi-page website you can download as HTML or a project zip.

The sketch is the spec. Built at **Ignition Hacks 2026**.

---

**Contents:** [Vision](#the-vision) · [Problem](#the-problem) · [What it does](#what-baio-does) · [Quickstart](#quickstart) · [Features](#features) · [Architecture](#the-architecture) · [Decision rationale](#design-decisions--why) · [The model](#the-model-story) · [Gemini](#the-perception-layer) · [Sketch is the spec](#sketch-is-the-spec) · [Roadmap](#where-this-goes)

## The vision

baio predicts your next stroke — it completes the figments of your imagination. The end state is a canvas where:

1. **You draw naturally.** No menus, no template browsers, no text prompts. The canvas is the interface.
2. **baio watches and understands.** When you've drawn enough for the structure to be recognizable, it infers where you're going.
3. **The completion blooms in like watercolor.** Soft, translucent, unmistakably a suggestion — never a finished mark imposed on you.
4. **You stay in control.** Accept it and the watercolor dries into crisp, editable structure; ignore it and it fades away.
5. **The result is real structure, not a picture.** Individual vector elements — move one bar of a chart, relabel one button. Never a flattened image.

Three things baio is deliberately **not**: not an image generator (it never produces raster output or improvised visuals), not a template picker (recognition comes from the drawing, never from browsing), and not a chatbot (no prompting, no describing).

## The problem

Getting an idea out of your head is a trade-off today, and every option loses something:

| Approach | What you get | What you lose |
|---|---|---|
| Pen and paper / raw sketching | Speed and total freedom | A dead end — not structured, not editable, not shareable |
| Figma and design tools | Real structure | Speed — menus, component browsers, and precision dragging interrupt thinking |
| AI mockup generators (text → image) | A pretty picture | Everything else — uneditable, detached from what you drew, no spatial control |

Everyone who builds things faces this trade: engineers sketching systems, students sketching diagrams, designers wireframing pages, founders whiteboarding products. They all think faster than they can draw. baio ends the trade: the speed and freedom of sketching **and** the structured result of a design tool — fast *and* faithful, for the first time.

## What baio does

```text
draw naturally  →  press Enter  →  watercolor suggestions bloom in
     ↑                                        │
     └── keep drawing (they fade away)   accept → they dry into editable structure
```

It works like autocomplete in a code editor: instant, ignorable, never in the way. Recognition is per-shape and local, so it fails gracefully — one misread shape never ruins the page. And when the model isn't confident, it **abstains**: your ink stays ink. Knowing when to stay quiet is a feature.

Everything you accept lands as individual, editable vector elements — move one bar of the chart, relabel one button, resize one frame. Never a flattened image.

## Quickstart

```bash
cd product
npm install
cp .env.example .env    # fill in GEMINI_API_KEY (required for Enter);
                        # ANTHROPIC_API_KEY for Seal/Frame;
                        # FREESOLO_* to use the trained builder (else Gemini baseline)
npm run dev
# open http://localhost:3000/studio
```

**Try:** hold `d` and draw a box, write `n` inside it, press `Enter` twice. Then a box with `b` and the word "Login". Then shade a rectangle dark and scatter dots in it — night sky. Seal the page, zoom out to the plane, Frame the space. Full controls and vocabulary: **[docs/features](docs/features/README.md)** (also the in-app 📖 book).

## Features

- **Shapes — draw anything, it gets crisp.** Every enclosed shape is a shape: a wobbly box becomes a clean rect, a roundish loop becomes an ellipse, any freeform doodle becomes *your* silhouette, smoothed — never replaced. Shade inside an outline and it fills with that color; shade two colors and you get a gradient.
- **Glyphs — the only thing that adds function.** A single letter alone inside a box turns it into a working component: `b` button · `n` navbar · `f` form · `i` image · `v` video · `?` placeholder · `p` page (spawns a new page on the plane). A plain shape stays a plain shape — no surprise components, ever.
- **Details — words and colors that style, not clutter.** "Login" inside a `b` box labels the button; "purple" fills it; theme words like "rainbow" or "sunset" become gradients.
- **Decoratives.** A dark rect with scattered dots becomes a night sky with a procedural starfield; long squiggles become layered wave dividers; scribbled ovals become aurora glows. All seeded and reproducible.
- **Diagrams (6 types).** Sketch the skeleton and the cluster becomes one crisp composite: bar chart, pie chart, Venn diagram, timeline, atomic structure, and the full 118-element periodic table.
- **A real canvas.** Pages sit on an infinite plane you can pan. Overlapping elements spawn layers automatically, with a focus rail that peels the page into strata. The paper grows without limit. Drag photos into any drawn enclosure — non-rectangular frames crop the photo to your drawn silhouette. An element dock lists, renames, and deletes what's on the page. Work autosaves.
- **Wires.** Draw an arrow between two objects (elements or pages) and it becomes a logic connection — click to navigate, submit to write data — used when Frame builds the site.
- **Seal, then Frame.** Seal freezes one page into a working HTML site (and a downloadable Vite/React project). Frame, from the plane, stitches every sealed page into a linked multi-page site. Optional: import a live URL and sketch edits onto it (`NEXT_PUBLIC_MODULE_EXISTING_SITE=1`).

## The architecture

### The principle

No single model is responsible for seeing the canvas, deciding intent, generating output, and validating it. baio separates concerns, each with a narrow contract:

```text
Perception   →  what did the user draw?
Building     →  what commands turn that into page edits?
Validation   →  are those edits legal and sane?
Rendering    →  deterministic component tree → rendered page
```

Model layers exchange **compact JSON** only. Only the deterministic renderer produces markup — malformed or malicious model output is structurally impossible to render.

### The two surfaces

The browser holds two stacked surfaces — this is the core interaction model:

```text
┌─ Ink layer ────────────────────────┐  transparent canvas on top —
│  ephemeral strokes, tracing paper  │  ink is INSTRUCTION, not content
├─ Page layer ───────────────────────┤  the actual website being built —
│  component tree → rendered stage   │  the persistent artifact
└────────────────────────────────────┘
```

Ink is instruction, not content: strokes live only until they're interpreted and applied, then the consumed ink is wiped. The page's source of truth is a **component tree** (JSON) that the renderer projects into the DOM — the tree *is* the code the builder edits, which is what makes every proposed edit validatable before it touches the page. End state of a session: an empty ink layer and a real website on the stage.

### The full pipeline

```text
ink screenshot + stroke manifest (per-stroke colors)
  → Gemini vision       DESCRIBES only: kind, glyph, text, colors — never places
  → normalizer (code)   geometry from YOUR strokes; containment analysis
  → FreeSolo builder    our fine-tuned 2B model DECIDES: op + params — ZERO coordinates
  → validators          fail closed: junk output → nothing happens, never a broken page
  → renderer            deterministic seeded templates — the model can't draw an ugly button
```

**1 · Gemini vision — the eyes.** The only layer that sees pixels. Input is *image + points*: the ink screenshot (what does it look like — heuristics can't read a glyph letter or spot a night sky) plus a stroke manifest with ids, bounds, and per-stroke colors (which strokes — so accepting a shape can wipe exactly the right ink). Output is constrained JSON *describing* each shape, at temperature 0:

```json
{ "stroke_ids": ["s4", "s5"], "kind": "rect", "glyph": "b", "text": "Login",
  "colors": ["#1a1a2e"], "confidence": 0.87 }
```

`kind` is one of 7 *geometric* kinds — what the ink looks like, never what to build. A single letter alone in a box is a `glyph`; a word is always `text`, never a glyph. Unrecognizable strokes are omitted, never guessed. Bounding boxes are advisory only.

**2 · Normalizer — the ruler.** Pure code. Computes each detection's real geometry from its claimed strokes (centroid + extents for boxes, endpoints for lines, smoothed paths for freeform) and overwrites the advisory vision bbox with the true stroke bounds. Resolves containment — what's inside what — so a word inside a box is *known* to belong to that box. Drops low-confidence detections and stroke-id conflicts.

**3 · FreeSolo builder — the brain.** Our fine-tuned 2B model, and it's text-only — it never sees the canvas. Its one job: map each description to a command from a closed 22-op schema. **Its output contains no coordinates anywhere.** A worked example:

```text
You draw a rough box, write "b" alone inside, "Login" beside it        ← ink
  ↓ vision describes (no ops, no placement)
{"kind": "rect", "glyph": "b", "text": "Login", "colors": ["#1a1a2e"]}
  ↓ builder decides (no coordinates)
{"op": "button", "from": "det_1", "params": {"label": "Login", "fill": "#1a1a2e"}}
  ↓ geometry deriver (pure code)
placement = centroid + extents of det_1's actual strokes, plus snap math
```

The only geometry influence the builder has is naming one **snap policy** from a closed enum (`full_width_top` for a navbar, `square` for a near-circle, default `none`) — the snap *math* is deterministic code. One command per detection, every command tied to its source via `from`, and `wait` is a first-class op for abstaining.

**4 · Validators — the law.** Three gates, fail closed: **schema** (known ops, field types — Zod), **geometric** (in-bounds, sane sizes), **domain** (a navbar should be wide; a periodic table shouldn't be 40px tall). Any failure degrades to `wait` — never a half-applied edit.

**5 · Renderer — the hand.** Deterministic projection of the component tree into the DOM. Every op renders from a hand-crafted, seeded template — procedural night skies and wave dividers reproduce identically on every render. Two visual states: watercolor preview (translucent, blooming) and applied (crisp, editable).

**Confidence policy.** The detection's confidence picks a tier: high applies immediately, medium shows the watercolor ghost with one-tap chips — **Crisp it / Keep as drawn / Skip** — and low does nothing (ink stays). Every chip tap is a client-side action *and* a logged gold training label. **Forced-component mode** (pick the op before drawing) bypasses vision entirely: a synthetic detection at confidence 1.0, geometry still from your strokes.

### Design decisions — & why

1. **Two models, not one.** One big vision call would have to see, decide, and place in a single shot — and be untrainable on a weekend. Splitting perception (Gemini) from decision (FreeSolo) makes each layer's job small, lets each fail independently, and turns the decision core into a text-to-text task cheap enough to fine-tune with synthetic data.
2. **Describe, never decide.** Vision classifies 7 geometric kinds instead of ranking 66 component types — a dramatically easier question, which is why the UX needs no "top-3 alternates" picker. Semantics live in the trained builder, where we can measure and improve them.
3. **Zero coordinates from any model.** Geometry from ink, semantics from the model, precision from code. A model cannot misplace what it never places — placement drift, the classic failure mode of sketch-to-UI systems, is *unrepresentable by construction* here.
4. **Shapes first, glyphs opt-in.** Every enclosed shape is just a shape unless a lone letter says otherwise. This kills the worst UX failure — surprise components appearing where you wanted a rectangle — and makes behavior fully predictable: no glyph, no function.
5. **The component tree is the code.** The builder edits structured state, never raw markup, so every edit is whitelist-validated before touching the page and the model can never emit scripts, URLs, or broken HTML.
6. **Fail closed.** Any validation failure means *nothing happens* — never a broken page. The failure mode users experience is "no suggestion," which costs one press of Enter, not trust.
7. **Templates own the beauty.** The model picks op + params + seed; hand-reviewed procedural templates do the rendering. The model can't draw an ugly button — only choose the wrong one, which validators and chips catch.
8. **Abstention is trained, not bolted on.** ~25% of training examples contain a `wait` — knowing when to stay quiet is the behavior generic models are worst at, and it became our biggest win (abstention F1 0.97 vs 0.67).
9. **One frozen schema (rule zero).** The same schema file drives the data generator, the training config, the serving grammar, and the runtime validator. Training inputs are byte-for-byte the runtime format — schema drift between train and serve silently poisons everything, so it's made impossible.
10. **Every tap is training data.** Accept, reject, keep-as-drawn, and forced-mode corrections are logged as gold labels on real ink — the product generates its own preference-tuning dataset (a GRPO config is already staged).
11. **Local recognition, local failure.** Every command ties to one detection; one misread shape never ruins the page, and each accept is its own small moment of magic instead of one risky big one.

## The model story

The decision-making core of baio is **Qwen3.5-2B, LoRA-fine-tuned by us on FreeSolo** over the weekend, in an agent-driven loop:

- **Synthetic data, answer-first:** `lib/datagen` procedurally generates gold shape scenes (the *output*), then derives the noisy description each scene's sketch would produce (the *input*) — correct by construction, with hand-jitter corruption calibrated against real labeled sketches. Training scale with no manual labeling: 640 examples × 4 epochs for the champion.
- **Honest evaluation first:** an independent 165-case test bank plus an eval harness (`scripts/eval-harness.ts`) measuring op accuracy, detail routing, containment, hallucination, and abstention — full ledger in [`freesolo/eval-results.md`](freesolo/eval-results.md).
- **A real post-training arc:** wave-1 adapters hallucinated commands at 48–72% (a length prior plus id-memorization overfit). The test bank caught it; data fixes (sparsity mix, non-sequential ids) cured it; wave 3 was promoted to production serving.
- **Total training spend: under $0.25** across ~10 runs.

**Held-out test split — our 2B fine-tune vs the Gemini Flash baseline (gemini-2.5-flash-lite):**

| Metric | Gemini Flash baseline | Our 2B fine-tune |
|---|---|---|
| Op accuracy | 75.0% | **96.7%** |
| Detail routing (word-in-box → label, colors → fill) | 58.7% | **90–93.5%** |
| Night-sky-from-rect | 25.0% | **100%** |
| Containment respected | 100% | 100% |
| Hallucination | 0% | 0–1.7% |
| Abstention precision / F1 | 0.51 / 0.67 | **1.00 / 0.97** |

A 2B model we trained for a quarter beats a frontier API at this task — because we shrank the problem until a small model could dominate it: perception goes to Gemini, geometry goes to code, and the trainable core is a clean text-to-text decision. A GRPO config (`freesolo/configs/`) is staged for preference tuning on the accept/reject signals the app already logs.

## The perception layer

Gemini (`gemini-2.5-flash-lite`) is used the way a vision model should be: **it describes, it never decides.** Per sketched shape it returns constrained JSON — kind, glyph, text, colors, gradient direction, confidence, claimed stroke ids — from an ink screenshot plus a per-stroke color manifest. Its output is always advisory: geometry is recomputed from the strokes, decisions go to the trained builder, and validators gate everything, so a misread can never break the page. Gemini also serves as the always-on fallback builder when the fine-tune abstains — frontier perception and a safety net in one API.

## Sketch is the spec

baio collapses the idea → interface pipeline: sketch a page (or a whole space of pages), get a structured wireframe, Seal, Frame, download a working site — no design-tool detour, no prompt engineering. The repo is a developer artifact in its own right: a reproducible eval harness, an independent test bank, a synthetic-data generator, and a complete training ledger, all runnable from the command line.

## Where this goes

- **Real-ink hardening:** a labeling pass on messy real handwriting, then preference tuning (GRPO) on logged accept/reject signals — every tap in the app is a gold label, so the product generates its own data flywheel.
- **New vocabularies:** flowcharts, circuits, chemistry, org charts — the engine is domain-agnostic; a domain pack is just vocabulary + templates + validators + training data, plugged into the same pipeline. A button and a periodic table are the same problem.
- **New surfaces:** tablet and whiteboard SDK, design-tool export, component-code export.
- **The market:** everyone who wireframes. Per-seat design tool → embedded SDK → domain packs for education and engineering.

## Repo map

```text
product/           the Next.js app (deployable artifact)
  app/studio/      the studio (also /gallery, /labeler; / is the landing page)
  app/api/         autocomplete, Seal/Frame, wire, import-site, health, labels
  components/      Studio, canvas, ghosts, layers, Seal/Frame overlay, glyph book
  lib/interpretation  pipeline: normalizer, containment, orchestration
  lib/models/      Gemini + FreeSolo clients (guided-JSON repair layer)
  lib/packs/       shape/component/diagram renderers (templates own the beauty)
  lib/datagen/     synthetic sketch-scene generator + corruption
  lib/frame/       Seal (one page → HTML + Vite app) and Frame (space → site)
  lib/wire/        drawn arrows → logic blocks
  lib/space.ts     infinite plane: pages, loose elements, wires
  modules/existing-site/  optional: sketch edits onto a live URL
  shared/schemas/  frozen contracts (detection, shapes v1–v3, logic-v1)
freesolo/          training kit: configs, datasets, eval ledger, test bank
scripts/           dataset generation, eval harness, showcase
docs/              vision, PRD, architecture, features guide, pitch, hackathon
```

## Docs

- [Vision](docs/vision.md) · [PRD](docs/prd.md) · [Features guide](docs/features/README.md) (how to drive everything)
- [Architecture](docs/architecture/master.md) · [AI pipeline](docs/architecture/ai-pipeline.md) · [Vocabulary & glyphs](docs/architecture/vocabulary.md)
- [FreeSolo training kit](docs/freesolo/README.md) · [baio playbook](docs/freesolo/08-baio-playbook.md)
- [Pitch kit](docs/pitch/README.md) · [Ignition Hacks 2026](docs/hackathon/README.md)

---

*baio (毛笔) means "brush pen" — which is why suggestions bloom in like wet ink and dry into structure when you accept them. Start the drawing; baio finishes the thought.*
