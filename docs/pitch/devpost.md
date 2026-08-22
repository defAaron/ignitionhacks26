# Devpost Submission — baio

Paste-ready copy for each submission field. Ignition Hacks 2026 (V7) is a **virtual Arts & Technology** hackathon, Aug 21–22 — register at [portal.ignitionhacks.org](https://portal.ignitionhacks.org/). Named prize tracks were not on the public site at scrape time; fill those boxes only after organizers publish them.

---

## Project name

**baio** — autocomplete for drawing

## Tagline (short, for the card)

> Our essays have autocomplete — shouldn't our imagination? Sketch a page on digital paper with magic in it, watch it bloom in like wet ink, and frame it into a real working website.

---

## Inspiration

In the figments of your imagination, a world appears — picturesque scenes that flow like a river. And every second, it fades. The artists, the engineers, the thinkers rush to engrave that flowing thought on paper. Drawing is the least restrictive way to capture an idea — no syntax, no menus, no blank-page paralysis — but the pen is slow, and by the time the hand catches up, the palace in your mind is a fragment of what it was.

We stopped accepting that trade for text years ago. Our essays have autocomplete. Our code has autocomplete. Shouldn't our imagination?

That's the tool we wanted: a magic paintbrush — you begin the picture, and the whole of it appears. The idea lands on the canvas whole and full, not as a fragment. Digital paper with magic in it.

We named it **baio** (毛笔) — "brush pen," the calligraphy brush — and made the interaction true to the name. Suggestions don't pop in; they **bloom in like wet ink** — soft, translucent, unmistakably a suggestion — and dry into crisp, editable structure when you accept. The product's chrome is a two-ink risograph: pure white paper, aubergine ink, celadon as the second ink, slightly off-register — printed, not glossy.

## What it does

baio is a drawing canvas where sketches become real, editable structure:

- **Draw anything, it gets crisp.** Every enclosed shape is a shape: a wobbly box becomes a clean rect, a roundish loop becomes an ellipse, any freeform doodle becomes *your* silhouette, smoothed — never replaced. Shade inside an outline and it fills with that color; shade two colors and you get a gradient.
- **Glyphs add function — and only glyphs.** A single letter alone inside a box turns it into a working component: `b` → button, `n` → navbar, `f` → form, `i` → image frame, `v` → video, `?` → placeholder. A plain shape stays a plain shape. No surprise components, ever.
- **Words and colors are details.** "Login" inside a `b` box labels the button; "purple" fills it; "rainbow" gives it a themed gradient.
- **Decoratives & diagrams.** A dark rect with scattered dots becomes a procedural night sky. Sketch axes and bars → a bar chart; overlapping circles → a Venn diagram; a grid of small boxes → the full 118-element periodic table. Six diagram types live.
- **A real canvas.** Layers spawn automatically on overlap (with a saturation-ladder focus rail), the paper scrolls and grows, and you can drag photos into any drawn enclosure — non-rectangular frames crop the photo to your drawn silhouette.
- **Frame — the finale.** When the page is done, one button sends the wireframe to Claude and returns a complete, semantic, responsive, interactive single-file website. Download the HTML and walk away. The sketch was the spec.

Recognition is per-shape and local, so it fails gracefully: one misread shape never ruins the page. And when the model isn't confident, it abstains — your ink stays ink.

## How we built it

The pipeline is a strict separation of powers — each layer does the one thing it's good at:

```text
ink screenshot + stroke manifest (per-stroke colors)
  → Gemini vision       DESCRIBES only: geometric kind, glyph, text, colors — never places
  → normalizer (code)   geometry from YOUR strokes; containment (what's inside what)
  → FreeSolo builder    OUR fine-tuned 2B model DECIDES: op + params — zero coordinates
  → validators          fail closed: junk output → nothing happens, never a broken page
  → renderer            deterministic seeded templates; the model can't draw an ugly button
```

The builder — the decision-maker at the core — is **Qwen3.5-2B, LoRA-fine-tuned on FreeSolo** by us, this weekend:

- We built a synthetic data generator (`lib/datagen`) that composes sketch scenes and corrupts them with hand-drawn jitter, then ran an agent-driven SFT sweep (~10 runs, 640 examples × up to 4 epochs, **<$0.25 total**).
- We built an independent 165-case test bank plus an eval harness measuring op accuracy, detail routing, containment, hallucination, and abstention — and kept a full eval ledger (`freesolo/eval-results.md`).
- Frontend: Next.js 15 / React 19, perfect-freehand ink, framer-motion for the watercolor blooms, everything on one SVG coordinate system. Frame is Claude Sonnet 5 with a fidelity-constrained prompt (every visual block must trace to a wireframe element).

**Final scores on the untouched test split — our 2B model vs the Gemini baseline:**

| Metric | Gemini baseline | Our 2B fine-tune | Margin |
|---|---|---|---|
| Op accuracy | 75.0% | **96.7%** | +21.7 |
| Detail routing (word-in-box → label, colors → fill) | 58.7% | **90–93.5%** | +33 |
| Night-sky-from-rect | 25.0% | **100%** | +75 |
| Containment respected | 100% | 100% | — |
| Hallucination | 0% | 0–1.7% | — |
| Abstention P / F1 | 0.51 / 0.67 | **1.00 / 0.97** | night and day |

## Challenges we ran into

- **Our first fine-tunes were disasters — and our eval caught them.** Wave-1 adapters hallucinated commands at 48–72% (a length prior plus id-memorization overfit). The independent test bank exposed it; we fixed the dataset (sparsity mix, non-sequential ids) and the next wave was clean. Building the eval before scaling training was the single best decision of the weekend.
- **Serving quirks.** The serving stack ignored OpenAI `response_format` (its presence even broke guided decoding), and guided JSON was only partially enforced. We built a client-side repair-and-retry layer with a tightened grammar and a JSON walk-back parser.
- **Frame fidelity.** Claude initially "improved" three plain buttons into a dark rainbow site with aurora glows. We rewrote the prompt so every visual block must trace back to a wireframe element — same payload now yields a clean, faithful page.
- **The color chain.** Getting "shade a rect purple" to come out as `fill #7c3aed` required threading per-stroke color through the entire pipeline — manifest, vision prompt, builder, renderer.

## Accomplishments that we're proud of

- **A 2B model we trained ourselves beats a frontier API on our task** — for less than a quarter of training spend.
- An interaction that feels genuinely new: autocomplete for a canvas, with abstention as a first-class feature — the tool knows when to stay quiet.
- Safe-by-construction output: no coordinates, no markup, no scripts from any model — geometry from ink, rendering from validated templates.
- End-to-end completeness: sketch → components → layers → photos → diagrams → **a downloadable working website**, all in one flow.

## What we learned

- **Evals before scale.** A small, honest, independent test bank turns "the model feels better" into "the model is 21.7 points better" — and catches overfit that eyeballing never would.
- **Small models win when you shrink the problem.** By moving perception to Gemini and geometry to code, the trainable core became a text-to-text decision task a 2B model can dominate.
- **Post-training is data engineering.** Every point of improvement came from the dataset (sparsity, id randomization, color threading, containment examples) rather than knob-turning.
- **Constrained decoding lies.** Never trust the sampler; validate everything, fail closed.

## What's next for baio

- **Real-ink hardening** — a labeling blitz on genuinely messy handwriting, then a preference-tuning pass (GRPO config already written) on the accept/reject signals the app logs today: every tap is a gold label, so the product generates its own training-data flywheel.
- **More vocabularies** — flowcharts, circuits, chemistry, org charts. The engine is domain-agnostic: each new domain is a template pack, not a rewrite.
- **Magic wand** — circle anything, say "make it three.js," and it is. Plus a `/runAi` text box for elements you'd rather type than draw.
- **Export targets** — Figma connectors, component-code export, tablet/whiteboard SDK.

## Built with

`next.js` · `react` · `typescript` · `freesolo` (Qwen3.5-2B LoRA fine-tune) · `gemini` (vision) · `claude` (Frame) · `perfect-freehand` · `framer-motion` · `zod` · `svg`

---

## Theme blurb — Arts & Technology

baio is a drawing tool that becomes a website. The art is the interaction: you sketch on digital paper printed in two inks (aubergine and celadon), suggestions bloom in like wet ink, and you stay in control of every stroke. The technology is a two-model pipeline we actually trained — Gemini describes the ink, a 2B FreeSolo fine-tune decides the command, geometry always comes from your strokes — plus fail-closed validators so a bad guess becomes *nothing*, never a broken page. When you're done, Frame turns the wireframe into a downloadable, working site. Arts and technology, in one motion.

## If a sponsor challenge is published

Paste from here only after the official track exists. Until then, don't claim Base44 / ElevenLabs / Shopify / etc. prize eligibility.

**Model / training (if they ask how we built the brain):** Our model is the product's decision layer. We fine-tuned Qwen3.5-2B with LoRA SFT on FreeSolo to turn per-shape sketch descriptions into structured draw-commands (22-op schema, zero coordinates). Agent-driven workflow: synthetic dataset generation with hand-jitter corruption, ~10-run sweep, an independent 165-case test bank, full eval ledger in `freesolo/` and `scripts/eval-harness.ts`. Wave-1 overfit (48–72% hallucination) was caught by the bank, fixed in data, and wave-3 beat the Gemini baseline 96.7% vs 75.0% op accuracy with abstention F1 0.97.

**Gemini (if they ask about vision):** Gemini is the perception layer: it describes but never decides. Per sketched shape it returns constrained JSON — kind, glyph, text, colors — from an ink screenshot plus a per-stroke color manifest. Geometry is recomputed from the strokes; the fine-tuned builder decides; validators fail closed.

**Base44 (Blaze sponsor — only if a build-on-Base44 challenge is announced and we actually ship one):** [describe the Base44-built companion surface — e.g. accounts / gallery / waitlist wrapping the canvas. Do not enter this track with a token landing page.]
