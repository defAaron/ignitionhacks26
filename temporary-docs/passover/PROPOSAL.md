# baio × FreeSolo — Proposal & Transfer Doc

> **⚠️ SUPERSEDED (historical).** This describes the pre-pivot plan (single text-only builder call, deterministic browser recognizer, component-first vocabulary). The 2026-07-18 **shapes-first pivot** replaced it: two model calls (Gemini vision describes, FreeSolo builds), 16-op shape vocabulary, no coordinates in builder output. Current source of truth: `docs/architecture/master.md` + `ai-pipeline.md` + `vocabulary.md`. Kept for history only.

> Handoff document. Everything decided in the planning conversation on 2026-07-18, self-contained — read this cold and you know the plan. Companion references: `docs/vision.md`, `docs/prd.md`, and the FreeSolo agent kit in `docs/freesolo/` (esp. `08-baio-playbook.md`).

## 1. What we're building

baio is sketch autocomplete: draw rough shapes with a pen, and real structured components snap in at exactly the positions drawn (watercolor preview → accept → editable vector structure). First product: **sketch-to-website-wireframe**, plus a small set of decorative elements that make demos pop (waves, night sky, stars).

## 2. The core architectural facts (settled)

**FreeSolo is text-only.** Its models (Qwen3.5 0.8B–9B etc.) accept no images. It can never see the canvas. Therefore recognition and generation are split:

```text
strokes → recognizer (browser-side geometry heuristics — deterministic, NOT a model)
        → detection JSON (text)
        → FreeSolo fine-tuned model (text → text)
        → component command JSON
        → schema validator → SVG renderer (watercolor preview / accept / reject)
```

The fine-tuned model does exactly one thing: **detections in, component commands out.** It never sees ink and never emits SVG. Everything before it and after it is deterministic code.

**Why fine-tune at all:** a frontier model can do this hop but is too slow (2–5s vs. autocomplete-instant), too expensive per stroke-pause, and inconsistent in output format. A FreeSolo 0.8B adapter is fast, ~$0.0000025/request, and with `structured_outputs` (guided decoding) it is *physically incapable* of emitting anything but schema-valid JSON.

**Contract-first, model-swappable:** define the JSON schema + validator before anything else. The demo runs on a *prompted* general model behind that contract from day one; the trained FreeSolo adapter is a one-line env-var swap when it's ready. Training is never on the critical path.

## 3. Scope decision: not 1000 models — one vocabulary, maybe two adapters

We explored "1000 fine-tuned adapters in a tree with a router model." Verdict:

- **Serving-side it's actually feasible** — LoRA adapters share one base model (FreeSolo GPUs hold 16 hot adapter slots each; idle deployments cost nothing) — but **training-side it's not** (1000 datasets + 1000 runs ≫ budget), and a deep routing tree multiplies error rates and latency per hop.
- **Adapters only earn their existence when tasks interfere.** Website elements and simple decorative elements share structure (boxes, positions, labels), so:

**Decision: ONE adapter covering the full MVP vocabulary.** A flat router (a choice-constrained 0.8B classifier) gets added only if/when a second genuinely-conflicting domain (e.g. circuit diagrams) arrives. That is the long-term expansion story — router → specialist, one flat hop, never a tree search at runtime.

## 4. The vocabulary (v1)

### Website elements (core — from PRD §5)

| Sketch | Component `op` |
|---|---|
| Wide rect spanning the top | `navbar` |
| Small rounded rect (± scribble inside) | `button` |
| Rect with an X through it | `image` |
| Rect with short horizontal lines inside | `card` |
| Long thin rect with a scribble | `input` |
| Short single large squiggle | `heading` |
| Stacked horizontal squiggles | `paragraph` |
| Circle | `avatar` |

### Website elements (extended majors — add after core 8 works)

| Sketch | `op` |
|---|---|
| Very wide rect below navbar with big squiggle | `hero` |
| Wide rect at the bottom | `footer` |
| Tall rect on the left/right edge | `sidebar` |
| Rounded rect containing several thin rects | `form` |
| Column of short lines with leading dots/dashes | `list` |
| Thin full-width horizontal line | `divider` |

### Decorative elements (the "cool" set)

Key insight: decorative elements are **still command JSON** — the model emits `{op, bbox, params}` and the *renderer* owns all the beauty (procedural generation with a seed, so results are reproducible and editable):

| Sketch | `op` | Renderer draws |
|---|---|---|
| Horizontal squiggle spanning a section boundary | `wave` | Smooth SVG wave divider (params: amplitude, layers) |
| Dark-ish rect + scattered dots/asterisks | `night_sky` | Gradient sky + procedurally placed stars (params: density, seed) |
| Small asterisk scribbles | `stars` / `sparkles` | Star/sparkle cluster at position |
| Bumpy arc line | `clouds` or `mountains` (by position: top vs. bottom) | Layered silhouette shapes |
| Circle in a sky/hero region | `sun_moon` | Sun or moon by context |
| Rough blob | `blob` | Smooth gradient blob background accent |

Cap v1 at roughly **core 8 + 4–6 extended + 4–6 decorative ≈ 16–20 ops**. Every op needs: a schema entry, a renderer, a recognizer rule, and training examples. Each op added multiplies work across all four — resist vocabulary creep.

## 5. Output schema (single source of truth)

Versioned JSON Schema at `shared/schemas/components-v1.json`, enforced in **three places**: the backend validator, FreeSolo's `[train] structured_outputs`, and per-request `response_format`. Shape:

```json
{
  "schema_version": "1.0",
  "components": [
    { "op": "navbar",    "id": "c1", "from": "s1", "x": 0,   "y": 0,   "width": 1440, "height": 80 },
    { "op": "button",    "id": "c2", "from": "s2", "x": 620, "y": 400, "width": 200,  "height": 56, "label": "Login" },
    { "op": "night_sky", "id": "c3", "from": "s3", "x": 0,   "y": 80,  "width": 1440, "height": 500, "params": { "density": 0.6, "seed": 7 } }
  ]
}
```

`from` links every component to a source detection — recognition stays per-shape and local (one misread never ruins the page), and evaluation becomes trivial (compare op/bbox per detection).

## 6. Training plan (FreeSolo, SFT)

Full mechanics in `docs/freesolo/01-quickstart.md` + `08-baio-playbook.md`. Summary:

1. **Dataset is nearly free — the mapping is invertible.** Procedurally generate plausible pages (components with real coordinates = gold *output*), then derive what the recognizer would have detected (op → shape kind + features, bbox jitter, dropped text, stray extra detections = *input*). 300–500 reviewed examples, 80/10/10 train/eval/test.
2. **Environment:** `flash env setup --single-turn --no-reasoning` in `freesolo/`, fill `dataset/`, `flash env push --name baio-components .`
3. **Config:** `model = "Qwen/Qwen3.5-0.8B"`, `algorithm = "sft"`, `epochs = 1`, `structured_outputs = '<components-v1.json>'`.
4. **Always free-preflight:** `flash train configs/sft.toml --dry-run` then `--cost` (the quote is exactly what gets billed). Ctrl-C detaches, it does NOT cancel — use `flash cancel`.
5. **Deploy:** `flash deploy <run-id>` → `flash deployments --json` gives `openai_base_url`; backend calls it with the standard OpenAI client, `model = <run-id>`. Key stays server-side, always.
6. **Promote only if it beats the prompted baseline** on the held-out test set (per-detection op accuracy, label accuracy, bbox IoU, hallucinated-component rate, latency).

## 7. Budget ($100 credit)

| Item | Est. cost |
|---|---|
| All scaffolding, publishing, dry-runs, cost quotes | $0 |
| SFT run, 0.8B, ~300–500 examples, 1 epoch | ~$0.50–2 each |
| ~10–20 training iterations over the weekend | ~$10–30 |
| Escalation experiment on 2B or 4B (only if eval shows capacity limit) | ~$2–5 each |
| All demo-weekend inference | pennies (0.8B ≈ $0.012/1M prompt tokens; prefix caching always on) |
| **Headroom remaining** | **~$60+** |

The budget is not the constraint. Dataset quality and demo polish time are.

## 8. Build order (critical path)

1. Canvas + stroke capture + shape recognizer (geometry heuristics for the vocabulary table above)
2. `components-v1.json` schema + validator + deterministic SVG renderer (incl. procedural decor generators)
3. Watercolor preview + accept/reject flow (explicit Autocomplete button — no auto-trigger in MVP)
4. Prompted baseline behind the contract → **working end-to-end demo**
5. *(parallel, off critical path)* Dataset generator → FreeSolo SFT → evaluate → swap in if it wins
6. Log accept/reject/correction events → reviewed retraining data → iterate

## 9. Risks

| Risk | Mitigation |
|---|---|
| Recognizer quality on messy real ink (the actual hard part) | Per-shape local recognition + graceful failure; constrain demo to the trained vocabulary |
| Vocabulary creep (each op costs schema+renderer+recognizer+data) | Hard cap ~20 ops for v1 |
| Training doesn't beat prompted baseline in time | Baseline IS the demo; adapter is an upgrade, not a dependency |
| Model output drift | Impossible by construction: `structured_outputs` + validator + `finish_reason` check |
| Burning budget on big models early | Fix dataset → schema → prompt before ever leaving 0.8B; `--cost` before every run |
