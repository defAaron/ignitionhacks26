# HackHub submission — baio

Paste-ready copy for each submission field on **HackHub** ([Base44](https://base44.com/) — Ignition Hacks V7 **Blaze** sponsor and submission host). Ignition Hacks 2026 — virtual **Arts & Technology**, Aug 21–22.

**There is no Devpost for this event.** Register on [portal.ignitionhacks.org](https://portal.ignitionhacks.org/), then submit the project on HackHub. Paste from the sections below into whatever fields the form asks for.

---

## Project name

**baio** — autocomplete for drawing

## Tagline

> Our essays have autocomplete — shouldn't our imagination? Sketch a page, watch it bloom in like wet ink, Seal it, and Frame the space into a working website.

---

## Inspiration

In the figments of your imagination, a world appears — picturesque scenes that flow like a river. And every second, it fades. Artists, engineers, thinkers: we all race to pin that flowing thought to paper. Drawing is the least restrictive way to capture an idea — no syntax, no menus, no blank-page paralysis — but the pen is slow. By the time the hand catches up, the palace in your mind is a fragment of what it was.

We stopped accepting that trade for text years ago. Our essays have autocomplete. Our code has autocomplete. **Shouldn't our imagination?**

That's the tool we wanted: a magic paintbrush. You begin the picture, and the whole of it appears — the idea on the canvas, whole and full, not a fragment. Digital paper with magic in it.

We named it **baio** (毛笔) — "brush pen," the calligraphy brush — and made the interaction true to the name. Suggestions don't pop in. They **bloom in like wet ink**: soft, translucent, unmistakably a suggestion. Accept, and they dry into crisp, editable structure.

Ignition Hacks is Arts & Technology. The art is the drawing. The technology is a model we actually trained, plus a website you can download. Watercolor in; working HTML out.

---

## What it does

baio is a drawing canvas where sketches become real, editable structure — then a real website.

**Sketch, then autocomplete.** Hold a key, draw naturally, press Enter. Rough ink becomes crisp shapes and working UI, exactly where you drew them. Watercolor ghosts bloom over each shape; accept and they dry into vectors you can move, resize, and relabel. When the model isn't sure, it abstains — your ink stays ink.

**Shapes first, function opt-in.** Every enclosed shape is just a shape: a wobbly box becomes a clean rect, a roundish loop an ellipse, a freeform doodle *your* silhouette, smoothed — never replaced. Shade inside and it fills; shade two colors and you get a gradient. A single letter alone in a box adds function: `b` button · `n` navbar · `f` form · `i` image · `v` video · `?` placeholder · `p` a new page on the plane. A plain box stays a plain box. No surprise components. Words become labels ("Login"); color words and ink become fills; theme words ("rainbow", "sunset") become gradients.

**Decoratives and diagrams.** A dark rect with scattered dots becomes a procedural night sky. Long squiggles become wave dividers. Sketch the skeleton of a diagram and the cluster becomes one crisp composite: bar chart, pie, Venn, timeline, atomic structure, or the full 118-element periodic table.

**A real canvas.** Overlapping elements spawn layers, with a focus rail that peels the page into strata. The paper scrolls and grows. Drag or paste photos into any drawn enclosure — even a non-rectangular doodle, cropped to your silhouette. A glyph book on the canvas is the index for everything you can draw.

**Pages, wires, and sites.** The studio is an infinite plane. Place multiple pages on it. Draw an arrow between elements (or pages) and baio infers the logic: navigate, submit, store. Import a live URL or drop an HTML file and sketch *on top of* an existing site — or turn its buttons, headings, and images into editable elements.

**Seal and Frame — the finale.** Seal a page and Claude returns a complete, semantic, responsive, interactive website — real nav, working forms, your palette — as a single HTML file you can download. A second lane emits a runnable Vite + React + TypeScript project. Frame the whole space and sealed pages become one multi-page site (linked HTML, or a routed React app). Unseal anytime; the wireframe underneath is untouched.

Recognition is per-shape and local: one misread never ruins the page. The sketch is the spec.

---

## How we built it

The pipeline is a strict separation of powers. No single model sees, decides, places, and renders:

```text
ink screenshot + stroke manifest (per-stroke colors)
  → Gemini vision       DESCRIBES only: kind, glyph, text, colors — never places
  → normalizer (code)   geometry from YOUR strokes; containment (what's inside what)
  → FreeSolo builder    OUR fine-tuned 2B model DECIDES: op + params — zero coordinates
  → validators          fail closed: junk output → nothing happens, never a broken page
  → renderer            deterministic seeded templates; the model can't draw an ugly button
```

**Geometry from ink, semantics from the model, precision from code.** The builder never emits coordinates. Placement is centroid + extents of the strokes you actually drew, plus named snap policies (`full_width_top` for a navbar, `square` for a near-circle) applied by deterministic math. A model cannot misplace what it never places.

The decision-maker is **Qwen3.5-2B, LoRA-fine-tuned by us on FreeSolo** this weekend:

- Answer-first synthetic data: generate the gold scene, then derive the noisy description a sketch of it would produce. Correct by construction. ~25% of examples teach `wait` (abstention).
- An independent 165-case test bank and an eval harness measuring op accuracy, detail routing, containment, hallucination, and abstention. Full ledger in `freesolo/eval-results.md`.
- ~30 SFT runs across 4 waves. Wave 1 hallucinated; the test bank caught it; data fixes (sparsity mix, non-sequential ids) cured it; wave 3 was promoted. Campaign spend ≈ **$1.30**.

**Held-out test — our 2B fine-tune vs prompted Gemini:**

| Metric | Gemini baseline | Our 2B fine-tune |
|---|---|---|
| Op accuracy | 75.0% | **96.7%** |
| Detail routing (word-in-box → label, colors → fill) | 58.7% | **90–93.5%** |
| Night-sky-from-rect | 25.0% | **100%** |
| Containment respected | 100% | 100% |
| Hallucination | 0% | 0–1.7% |
| Abstention P / F1 | 0.51 / 0.67 | **1.00 / 0.97** |

The app is **Next.js 16 / React 19 / TypeScript**: perfect-freehand ink on SVG, Framer Motion for the watercolor blooms, Zod for every contract. Frame/Seal is Claude Sonnet 5 with a fidelity-constrained prompt (every visual block must trace to a wireframe element). Wires are two-stage: Gemini analyzes the arrow, Claude Haiku writes the logic block. App exports zip via JSZip.

---

## Challenges we ran into

**Our first fine-tunes were disasters — and our eval caught them.** Wave-1 adapters hallucinated commands at 48–72% (a length prior plus id-memorization overfit). The independent test bank exposed it; we fixed the dataset and the next wave was clean. Building the eval *before* scaling training was the single best decision of the weekend.

**Constrained decoding lies.** The serving stack ignored OpenAI `response_format` (its presence even broke guided decoding), and guided JSON was only partially enforced. We built a client-side repair-and-retry layer with a tightened grammar and a JSON walk-back parser. Serving parse rate: 100%.

**Frame wanted to "improve" the sketch.** Claude initially turned three plain buttons into a dark rainbow site with aurora glows. We rewrote the prompt so every visual block must trace back to a wireframe element — same payload now yields a clean, faithful page. Fidelity over flourish.

**Color had to survive the whole pipe.** Getting "shade a rect purple" to come out as `fill #7c3aed` meant threading per-stroke color through the screenshot, the stroke manifest, the vision prompt, the builder schema, and the renderer. Drop any hop and the magic dies.

**The last training round failed — and that's the system working.** Densifying weak skills 3× taught them better but warped the general distribution (op accuracy fell 11 points). The promote bar rejected it; the champion stood. A benchmark that can say "no" is the whole point.

**Messy real handwriting is still the honest risk.** Vision was tuned mostly on synthetic ink. Mitigations: abstention, keep-as-drawn, forced-component mode. The failure mode users feel is "nothing happens" — never "the wrong thing happens."

---

## Accomplishments we're proud of

- **A 2B model we trained ourselves beats a frontier API on our task** — 96.7% vs 75.0% op accuracy, abstention F1 0.97 vs 0.67, for about a dollar thirty across the whole campaign.
- **An interaction that feels new:** autocomplete for a canvas, with abstention as a first-class feature. The tool knows when to stay quiet.
- **Safe by construction:** no coordinates, no markup, no scripts from any model. Geometry from ink, rendering from validated templates. A hallucination becomes *nothing*, never a broken page.
- **End-to-end completeness in one flow:** sketch → crisp components → layers → photos → diagrams → pages → wires → **a downloadable working website** (or a Vite + React app, or a multi-page routed site).
- **The product generates its own data.** Every accept, reject, keep-as-drawn, and forced-mode correction is a gold training label. A GRPO config is already staged.

---

## What we learned

**Evals before scale.** A small, honest, independent test bank turns "the model feels better" into "the model is 21.7 points better" — and catches overfit that eyeballing never would. Held-out splits share the generator's blind spots; independent exams don't.

**Small models win when you shrink the problem.** Perception goes to Gemini, geometry goes to code, and the trainable core is a clean text-to-text decision. A 2B model can dominate that. One giant vision call would have been untrainable on a weekend.

**Post-training is data engineering.** Every point of improvement came from the dataset — sparsity, id randomization, color threading, containment examples — not from knob-turning.

**Fail closed.** Never trust the sampler. Validate everything. The failure mode users experience should be "no suggestion," which costs one press of Enter, not trust.

**Describe, never decide.** Vision classifies 7 geometric kinds instead of ranking dozens of component types. Semantics live in the trained builder, where we can measure and improve them. Plain shapes stay shapes unless a glyph says otherwise — the worst UX failure (surprise components) becomes unrepresentable.

---

## What's next for baio

**Smarter drawing logic.** Today's engine is a snapshot classifier: press Enter, one screenshot, one hop per cluster. People don't draw that way. Next is a persistent scene graph — incremental, relational, aware of what's already on the page. Alignment means grouping. Repetition means a list. An arrow means flow. The recognition should feel like how a person actually builds a drawing up over time, not a one-shot exam.

**Full-site design.** Pages and wires exist; databases and functions are next. Sketch a collection, a form, a list; generate a real data model and actions. Two targets from the same IR: a downloadable SPA with a client-side store, and a real app (routes, tables, server actions). Claude styles the pages; deterministic codegen owns structure, data, and safety.

**Real-ink hardening.** A labeling pass on genuinely messy handwriting, then preference tuning (GRPO) on the accept/reject signals the app already logs. Every tap is a gold label — the product is its own flywheel.

**New vocabularies.** Flowcharts, circuits, chemistry, org charts. The engine is domain-agnostic: a domain pack is vocabulary + templates + validators + training data. A button and a periodic table are the same problem.

**New surfaces.** Tablet and whiteboard SDK. Design-tool export. A magic wand: circle anything, say what it should become.

Start the drawing. baio finishes the thought — and next, the whole site.

---

## Tools and integrations

Everything the project actually uses — libraries in the app, models in the pipeline, platforms we trained and served on, and the stacks Frame emits.

### App stack
- **Next.js 16** (App Router, Turbopack) — studio, gallery, labeler, landing, API routes
- **React 19** + **React DOM**
- **TypeScript**
- **Framer Motion** — watercolor blooms, ink shake-off, overlays, layer rail
- **perfect-freehand** — pressure-aware ink strokes
- **Zod** — schema validation for detections, builder output, labels, wires
- **JSZip** — download Frame App / Frame Space projects as a `.zip`
- **SVG** — one coordinate system for ink, ghosts, and committed elements
- **HTML Canvas** — rasterize ink to PNG for vision
- **Pointer Events** — pen / finger / mouse
- **next/font + Google Fonts** — Bricolage Grotesque, Hanken Grotesk

### Models & APIs
- **Google Gemini** (`gemini-flash-lite-latest` / Gemini 2.5 Flash-Lite) via the Generative Language API
  - Vision: describes ink (kind, glyph, text, colors) — never decides, never places
  - Baseline builder fallback when the fine-tune is down
  - Wire stage 1: analyzes what a drawn arrow connects
- **Anthropic Claude** via the Messages API
  - **Claude Sonnet 5** — Seal (single-file HTML), Frame App (Vite + React + TypeScript project), Frame Space (multi-page routed app)
  - **Claude Haiku 4.5** — Wire stage 2: writes the logic block for a connection
- **FreeSolo Flash** — managed post-training (SFT / LoRA), `flash` CLI, OpenAI-compatible serving
- **Qwen3.5-2B** (champion builder) and **Qwen3.5-0.8B** (fast-path probes) — LoRA adapters we trained
- **Modal** — FreeSolo LoRA serving host (OpenAI-compatible `/v1`)

### Training & eval
- **FreeSolo environments** — `environment.py`, datasets, TOML train configs
- **uv** — install / run the `flash` CLI
- Synthetic datagen (`lib/datagen`) — answer-first scenes + hand-jitter corruption
- Eval harness (`scripts/eval-harness.ts`) + 165-case independent test bank
- In-app **labeler** (`/labeler`) — gold sketches for calibration
- **GRPO** config staged for preference tuning on accept/reject logs (not yet the serving champion)

### Geometry & rendering (deterministic — no model)
- **Ramer–Douglas–Peucker** stroke simplification
- **Catmull–Rom** path smoothing for freeform silhouettes
- Snap policies (full-width top, square, straighten, …) as pure code
- Seeded procedural templates (Mulberry32) — night skies, waves, auroras, diagrams
- Fail-closed validators: schema (Zod) → geometric → domain

### Frame / Seal output targets (what we generate, not what we depend on at runtime)
- Single-file **HTML/CSS/JS** website
- **Vite** + **React 19** + **TypeScript** project
- **react-router-dom** — one route per sealed page (Frame Space)

### Product surfaces
- `/` landing
- `/studio` — draw, autocomplete, pages, wires, Seal / Frame, import site
- `/gallery` — live template pack
- `/labeler` — training-data blitz
- **existing-site module** — fetch a public URL or drop `.html`, sketch on top or extract elements (SSRF-safe server fetch)

### Built-with tags (short form for the form)

`next.js` · `react` · `typescript` · `framer-motion` · `perfect-freehand` · `zod` · `jszip` · `svg` · `gemini` · `claude` · `claude-sonnet` · `claude-haiku` · `freesolo` · `qwen` · `lora` · `modal` · `vite` · `react-router` · `google-fonts`

---

## Theme blurb — Arts & Technology

baio is a drawing tool that becomes a website. The art is the interaction: you sketch on digital paper, suggestions bloom in like wet ink, and you stay in control of every stroke. The technology is a two-model pipeline we actually trained — Gemini describes the ink, a 2B FreeSolo fine-tune decides the command, geometry always comes from your strokes — plus fail-closed validators so a bad guess becomes *nothing*, never a broken page. When you're done, Seal and Frame turn the wireframe into a downloadable working site, a React app, or a multi-page product. Arts and technology, in one motion.

## Base44 / HackHub notes

**HackHub** is the submission platform (Base44 hosts it as Blaze sponsor). baio's core product is a custom Next.js canvas with a trained model — not a Base44-built app. Submit on HackHub with the copy above; link the public GitHub repo and live demo URL. Only claim a separate "built on Base44" track if organizers publish one and we actually ship something real there (not a token landing page).

**Model / training (if HackHub asks how we built the brain):** The decision layer is Qwen3.5-2B, LoRA-SFT on FreeSolo, 22-op schema, zero coordinates. Synthetic datagen, ~30-run sweep, independent 165-case test bank. Wave-1 overfit (48–72% hallucination) was caught by the bank, fixed in data; wave 3 beat Gemini 96.7% vs 75.0% op accuracy, abstention F1 0.97. Campaign ≈ $1.30.

**Gemini:** Perception only. Constrained JSON — kind, glyph, text, colors — from an ink screenshot plus a per-stroke color manifest. Also analyzes drawn wires. Geometry is recomputed from strokes; the fine-tune decides; validators fail closed.

**Claude:** Seal/Frame (Sonnet 5) and wire logic (Haiku 4.5). Fidelity-constrained: every visual block traces to a wireframe element.
