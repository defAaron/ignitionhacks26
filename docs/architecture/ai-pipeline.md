# baio — AI Shape Pipeline

The full path from ink to validated shape commands. Two models, one deterministic spine. **Shapes-first (2026-07-18 pivot):** the canvas primitive is the shape, not the website component — vocabulary in `vocabulary.md`, contracts in `shared/schemas/README.md`. Companion docs: `master.md` (system context), `docs/freesolo/` (platform kit, esp. `08-baio-playbook.md`), `passover/PROPOSAL.md` (settled decisions).

```text
ink screenshot + stroke manifest ("prompt + points")
   ──▶ 1. Vision (Gemini): DESCRIBE stroke-sets → kind + glyph + text + colors
   ──▶ 2. Normalizer (pure code): geometry from ink — centroid+extents, smoothed paths
   ──▶ 3. Builder (FreeSolo, text-only): kind+glyph+context → op + params + snap
   ──▶ 4. Validators (pure code): schema → domain; snap math applied deterministically
   ──▶ client: watercolor preview + "crisp it / keep as drawn / skip"
```

Division of labor, one sentence each:

- **Gemini is the eyes** — it alone sees pixels; it *describes* (geometric kind, glyph, text, colors), it never places and never decides ops.
- **FreeSolo is the hands** — text-only, blind; maps descriptions to `op + params + snap`, with **no coordinates anywhere in its output**.
- **Everything between and after is deterministic code** — geometry derivation, snap math, validation, rendering.

## 1. Vision layer (Gemini)

**Model:** Gemini 2.5 Flash-Lite ($0.10/M in, $0.40/M out — cheapest capable vision model; ≈$0.0002 per autocomplete call). Regular 2.5 Flash is the quality fallback; the labeling-window bake-off (§6) decides. Env-swappable behind `lib/vision/`.

**Input — image + points, both load-bearing:**

- The **screenshot** answers *what does it look like*. This is why a vision model exists in the pipeline at all: geometry heuristics can tell a wide-rect from a small-rect but fundamentally cannot read a glyph letter, tell a **wave** squiggle from handwriting, or spot a night sky.
- The **stroke manifest** `[{id, bbox, point_count}]` answers *which strokes*. Every detection must bind to stroke ids so accepting a shape can wipe exactly the right ink.

**Output (structured JSON per `detection-shapes.json`, temperature 0) — a shape DESCRIPTION, not a component guess:**

```json
{ "detections": [ {
    "stroke_ids": ["s4", "s5"],
    "kind": "rect",
    "glyph": "b",
    "text": "Login",
    "colors": ["#1a1a2e"],
    "gradient_direction": null,
    "confidence": 0.87,
    "bbox": { "x": 540, "y": 400, "width": 180, "height": 52 }
} ] }
```

Prompt rules: `kind` is one of 7 **geometric** kinds (`rect`, `ellipse`, `line`, `arrow`, `scribble`, `smooth_path`, `text_writing`) — what the ink *looks like*, never what to make; a single letter alone in a box goes in `glyph`, any word/sentence goes in `text` (a word is never a glyph); colors and `gradient_direction` are reported as observed; a stroke id appears in at most one detection; unrecognizable strokes are omitted, never guessed. Disambiguation rules feed verbatim from `vocabulary.md` §4. **Describes, never places** — bboxes are advisory only.

There are **no top-3 candidates anymore** — a single kind + confidence. Classifying 7 geometric kinds is a far easier question than ranking 66 component types, so the old pill-bar-of-alternates UX collapses into a simpler affordance (`master.md` §6.7): each ghost offers **"crisp it / keep as drawn / skip"**, and **forced-component mode** covers the case where the user wants a specific op regardless of recognition. Every tap is still a gold label.

**Forced-component mode bypasses this layer entirely** (PRD §6.4b): when the user pre-selects an op from the palette, the client synthesizes the detection itself — matching kind/glyph, confidence 1.0, bbox from stroke bounds — and the pipeline proceeds from the normalizer as usual. No Gemini call, near-zero latency, guaranteed op.

## 2. Normalizer (no model)

Pure function, `lib/interpretation/` — this is where **geometry lives**, because geometry always comes from ink:

- Compute each detection's real geometry from its claimed strokes: **centroid + extents** for boxes and ellipses, **endpoints** for lines and arrows, a **Catmull-Rom-smoothed path** for freeform — and overwrite the advisory vision bbox with the stroke-union bounds
- Drop detections whose confidence is below the low-tier floor, or whose stroke ids don't exist
- Resolve stroke-id conflicts (two detections claiming one stroke → keep higher confidence)
- Emit the canonical detection list — the single input format the builder depends on

The same module owns **snap application** after the builder runs: the builder only *names* a snap policy from a closed enum; the math (`full_width_top`, `straighten_h`, `square`, …, full table in `shared/schemas/README.md` §1) is deterministic code here.

## 3. Builder (FreeSolo)

**FreeSolo is text-only — it never sees the canvas.** Its one job: descriptions + tree summary → shape commands. **It outputs no coordinates** — no x/y/width/height anywhere in its schema.

### 3.1 How geometry works without the model ever placing anything

**Geometry from ink, semantics from the model, precision from code.** A worked example:

```text
User draws a rough box, writes "b" alone inside, "Login" beside it   ← ink
  ↓ vision describes (no ops, no placement decisions)
detection:  {"kind": "rect", "glyph": "b", "text": "Login",
             "colors": ["#1a1a2e"], "confidence": 0.87, ...}
  ↓ FreeSolo maps kind+glyph+context → op — no coordinates in its output
command:    {"op": "button", "from": "det_1",
             "params": {"label": "Login", "fill": "#1a1a2e"}}
  ↓ geometry deriver (pure code)
placement = centroid + extents of det_1's actual strokes; snap math if named
```

A model cannot misplace what it never places — placement drift, the old pipeline's main geometric failure mode, is **unrepresentable by construction**. The only geometry influence the builder has is choosing one **snap policy** from a closed enum (`full_width_top` for a navbar, `square` for a near-circle, default `none` = geometry exactly from ink).

### 3.2 The frozen contract (rule zero)

**Freeze this schema before generating any training data.** Training inputs must be byte-for-byte the format the backend sends at runtime; schema drift between training and serving silently poisons everything. Versioned at `shared/schemas/shapes-v1.json`, enforced at three points: backend validator (`shapesOutputSchema` in `types/schemas.ts`), `[train] structured_outputs`, per-request `response_format`.

Input: `{artboard, tree_summary (ops only — no geometry to summarize), detections (kind + glyph + text + colors)}`.
Output: **one command per detection, no exceptions** (makes outputs mechanically checkable):

```json
{ "schema_version": "shapes-1.0",
  "components": [
    { "op": "navbar",       "from": "det_1",
      "params": { "label": "baio", "fill": "#1a1a2e" }, "snap": "full_width_top" },
    { "op": "smooth_path",  "from": "det_2",
      "params": { "gradient": { "colors": ["#7c3aed", "#db2777"], "direction": "diagonal" } } },
    { "op": "wait",         "from": "det_3", "reason": "low_confidence" }
] }
```

`op` ∈ the active wave's vocabulary (canonical tables: `vocabulary.md` + `label-tree.md`). `from` ties every command to a source detection — recognition stays local (one misread never ruins the page) and evaluation becomes per-detection comparison. `params` are styling conventions only (fill, gradient, stroke, text, label, seed + decorative knobs) — never geometry. Decorative ops carry `params` + `seed`; the **renderer owns all the beauty** (procedural, reproducible, editable).

**Wave schemas:** `shapes-v1.json` = wave 1, the shapes-v1 16-op whitelist (6 base + 6 glyph + 4 decorative). The **wave-2 whitelist is frozen from the bench** (`label-tree.md`: 20 web-ui + 15 decorative + 20 diagrams) before any wave-2 data generation — bench membership is a backlog, not a schema. Each wave's generator, validator, training config, and serving `response_format` import their wave's file. Confidence tiers (high/medium/low → apply/suggest/ignore) derive from the **detection's kind confidence** (vision), not from the builder. (`components-v1.json`/`components-v2.json` are the legacy pre-pivot contracts, retained for the `flash-1784430057` run.)

### 3.3 What the model learns (the policy, not the syntax)

Guided decoding owns syntax. The weights learn: the **kind+glyph+context → op** mapping (a plain box is a `rect`, box+`b` is a `button`, a long boundary scribble is a `wave_divider`); glyph discipline (single letter alone → component op; word → `text` content, never a glyph); **snap policy selection** (navbar → `full_width_top`, near-square box → `square`, default `none`); label routing (`text` → `button.label` / `navbar` brand / `text` op content); color routing (observed colors + `gradient_direction` → `fill`/`gradient` params — a gradient-filled `smooth_path` is the old blob); calibrated abstention (`wait` on junk); minimality.

## 4. Training on FreeSolo (docs-verified against `docs/freesolo/`)

### 4.1 Mental model: you upload a *task*, not just data

FreeSolo's unit is an **environment** — task-as-code. A folder with the dataset plus `environment.py` (`EnvironmentSingleTurn` subclass: `load_environment()` factory, `build_prompt_messages`, `score_response → RewardResult`). Workers pull examples, build prompts, and for **SFT** compute next-token loss against the gold `output` — training a **LoRA adapter** (`lora_rank = 32`): the Qwen3.5-0.8B base stays frozen; small low-rank matrices learn the delta. That's why runs cost ~$1 and deploy instantly. `score_response` isn't used for SFT gradients but is the grader for evals and the reward if we run GRPO — and our validator pipeline *is* that grader.

The pre-pivot run **`flash-1784430057`** (trained against `components-v1.json`) already proved this pipe end-to-end — env push → train → deploy → serve behind the OpenAI-compatible endpoint — so the shapes wave is a re-run of a known-good path with a new environment, not a first flight.

### 4.2 The drawings are never in the training set

Every training example is a **text pair** (detection-description JSON string → shape-command JSON string), minted by a program. Real drawings influence FreeSolo only indirectly: they calibrate the generator's noise model (§6) and later, correction taps become new text pairs. The training file contains zero images, zero strokes, and — post-pivot — zero coordinates on the output side.

### 4.3 Answer-first synthetic generation (the mapping is invertible)

```text
1. Procedurally generate a plausible SHAPE SCENE (boxes? a glyph box? a wave
   squiggle at a boundary? a dark starfield rect? freeform doodles?)
      → shape commands {op, params, snap} = gold OUTPUT
2. Derive the description each shape's sketch would produce
      (op → geometric kind, glyph present/garbled/dropped, text noise,
       color/gradient signals, shuffled order, stray extra detections
       that must map to `wait`)
      → = INPUT
3. Noise is CALIBRATED, not invented: measured from real labeled sketches (§6)
```

Correct by construction. 300–500 reviewed examples, 80/10/10 train/eval/test; ~25% of examples contain at least one `wait` (abstention is the behavior generic models are worst at — our headline differentiator).

### 4.4 The workflow (steps 1–7 free; step 8 is the first paid command)

```bash
uv tool install freesolo-flash && flash login --api-key <key>
flash models                                   # confirm Qwen/Qwen3.5-0.8B id
cd freesolo/ && flash env setup --single-turn --no-reasoning
# → environment.py, dataset/, configs/sft.toml
flash env push --name baio-shapes .           # → org/baio-shapes → sft.toml
flash train configs/sft.toml --dry-run         # server-side validation, free
flash train configs/sft.toml --cost            # exact quote = exact bill, free
flash train configs/sft.toml                   # paid; Ctrl-C DETACHES (flash cancel to stop)
flash deploy <run-id>                          # smoke-test + activate
flash chat <run-id> -m '<detection json>'      # manual sanity check
flash deployments --json                       # → openai_base_url for the backend
```

Config: `model = "Qwen/Qwen3.5-0.8B"`, `algorithm = "sft"`, `epochs = 1`, `lora_rank = 32`, `structured_outputs = <shapes-v1.json as string>`, `thinking = false`.

### 4.5 Platform gotchas (from the docs — respect all of these)

1. **Silent-drop rule (biggest footgun):** dataset rows keep only `input`/`output`/`metadata`; every other top-level key is silently discarded. Gold scene info, noise params, source geometry → under `metadata` or gone.
2. **`input` is a string** — our detection JSON serialized; exact key names required.
3. **First-run discipline:** smallest model, ≤100 examples, 1 epoch to prove the pipe; change one variable per run.
4. **Never train and eval on the same records** — test split untouched until the promote decision.
5. **Ctrl-C detaches, doesn't cancel** — `flash cancel <run-id>`; `flash undeploy` when idle (serving bills per token).
6. **Check `finish_reason`** before parsing; keep `max_completion_tokens` above the biggest command list.
7. Env upload cap 64 MB compressed (irrelevant at our size).

### 4.6 Parallel sweep plan (unlimited usage confirmed by founder)

Budget is not a constraint, so the old "one retrain" discipline becomes a sweep — but two disciplines survive because they're about *information*, not money: **change one variable per axis**, and **held-out test stays untouched** until promotion.

```text
Sat AM   human: freeze wave-1 schema — the shapes-v1 16-op whitelist (checkpoint 1)
                                        ← SERIAL: everything waits on this
Sat PM   human: Phase-1 labeling blitz — the 16 (checkpoint 2, §6) → SUBMIT
         agent: calibration + vision bake-off + baseline + eval harness
         human: review 30–50 canonical examples (checkpoint 3)
Sat eve  agent: generate wave-1 dataset → LAUNCH WAVE-1 SWEEP
           0.8B × {150, 300, 500 examples} × {1, 2 epochs}
           2B / 4B capacity probes; dataset variants (noise level, wait-ratio)
         human (while wave 1 trains): Phase-2 labeling blitz — the 55-item bench
Sun AM   agent: eval every wave-1 adapter vs. baseline; freeze wave-2 schema
                from the bench; generate wave-2 dataset → WAVE-2 SWEEP
         human: read wave-1 table, promote or keep baseline (checkpoint 4)
Sun PM   agent: eval wave-2 (full-vocabulary adapter) — promote if it wins
         demo polish; optional GRPO run using the validator-composite reward
```

**Total human time: ~2–3 hours across four checkpoints.** Everything else — labeler build, bake-off, generator, minting, validation, training orchestration, evals — is agent-run; FreeSolo is explicitly agent-oriented.

Founder questions outstanding: concurrent-run cap / queue behavior; turnaround for a 300-example 0.8B run (sets sweep generations per weekend); GRPO rollout config + `structured_outputs` during rollouts.

## 5. Eval harness

One script, runs against baseline AND every adapter — the demo chart is this table:

| Metric | How |
|---|---|
| Parse / schema-valid rate | should be ~100% with structured outputs; watch `finish_reason` |
| Per-detection op accuracy | command op vs. gold, matched via `from` (the core metric — kind+glyph → op) |
| Snap accuracy | named snap policy vs. gold, including correctly choosing/omitting `none` |
| Params accuracy | label/text preserved and routed to the right param; fill/gradient match the color signals |
| Hallucinated-command rate | commands with no valid `from` |
| Missed-detection rate | detections with no command |
| Abstention F1 | `wait` where required, not where not |
| Latency p50/p95 | per call |
| Layout quality (secondary) | **render-and-judge**: deterministic renderer → PNG → multimodal judge scores plausibility (proportions, param sanity, composition) |

**Bbox IoU is gone** — the builder emits no coordinates, geometry is a pure function of ink, so there is no placement fidelity to score. What was the old pipeline's hardest metric is now not model behavior at all.

Render-and-judge exists because shape *appearance* is owned by hand-crafted templates (a `button` op always renders the same reviewed template — the model can't draw an ugly button, only pick op/params/snap), but *composition* can still look wrong in ways schema gates don't catch (a wave with absurd amplitude, a clashing gradient). The judge is a **secondary signal, never a gate** — deterministic checks remain the gates; judge scores rank candidates and can join a GRPO reward.

Run the harness on the prompted baseline **before** any training so the comparison exists by construction. Promote only if the adapter beats baseline on held-out test.

## 6. The labeling window (human data tool)

A throwaway mini-app the agent builds first; converts ~45–60 minutes of human doodling into machine-readable gold data.

**Flow:** pick a label → spam examples of it ("blitz mode"). A randomized **guide box** shows approximately where to draw — the guide box *is* the gold bbox. The full label set (71 ops) and phase assignments live in `label-tree.md`.

```text
┌────────────────────────────────┬────────────────────────────────┐
│   ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐            │ ☰  LABEL: wave_divider         │
│   ╎  draw in here ╎            │    saved: 4 · PHASE 1 · 9/16   │
│   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘            │────────────────────────────────│
│                                │ hold D     ink flows (no D,    │
│                                │            no ink — mouse just │
│                                │            moves the pen)      │
│                                │ hold E     eraser              │
│                                │ 1–9        toggle ink color    │
│                                │            ■■■■■■■■■ palette   │
│                                │ Enter      save + clear,       │
│                                │            same label          │
│                                │ Tab        next label          │
│                                │ Backspace  clear, no save      │
└────────────────────────────────┴────────────────────────────────┘
   each save → {label, guide_bbox, strokes[], colors_used, png} → JSONL
```

**Hold-to-draw:** the mouse positions the pen, but ink only flows while `D` is held (accidental strokes are impossible); `E` held = eraser. **Number keys `1–9` toggle the ink color** — a fixed 9-swatch palette (black default, then the common hues) shown in the sidebar. Color matters more than ever: `colors` and `gradient_direction` are first-class fields in the vision contract (a dark-filled `rect` with dots reads as `night_sky`; strokes shading between colors become a gradient param), and `colors_used` is saved with every record. **The hamburger menu (☰) lists every label** that exists — grouped and phase-marked per `label-tree.md` — click to jump anywhere; `Tab` steps to the next label in menu order for sequential blitzing.

**Two-phase labeling (matches the two training waves):**

```text
Phase 1  blitz the shapes-v1 16 (2–5 variations each ≈ 32–80 drawings)
         → SUBMIT → agent runs calibration + synthetic generation
         → wave-1 sweep launches against the 16-op schema
Phase 2  blitz the 55-item bench while wave 1 trains
         → wave-2 whitelist frozen from the bench → wave-2 dataset → wave-2 sweep
```

Each wave freezes its own op whitelist before data generation (rule zero). More real sketches = better calibration + bigger golden set; blitz mode makes volume cheap. Guide boxes randomize position/size per drawing → free position/scale diversity.

**Each labeled drawing yields three measurements:**

1. **Description accuracy** — did Gemini report the right geometric kind, and read the glyph/text correctly? (drives the prompt + the Lite-vs-Flash bake-off)
2. **Bbox error** — Gemini's advisory bbox vs. guide box → the jitter distribution the synthetic generator copies
3. **Stroke-bounds error** — ink overflow vs. intent → calibrates the normalizer's geometry tolerance

**Anti-leak split (mandatory):** labeled drawings are split per label at save time — a **calibration half** (feeds the noise measurements and prompt tuning) and a **golden half** (the untouched end-to-end test set). Never calibrate on the golden half: tuning synthetic noise on your test set is test-set contamination in slow motion. Every stroke in a record carries its id so detections can bind to strokes exactly as at runtime.

**Variation coverage (multiple test points per op):** the labeler enforces a per-label checklist before marking a label done — minimum 3 saves spanning: ≥2 different guide-box sizes/positions (automatic), ≥1 "sloppy" and ≥1 "neat" pass (the sidebar prompts the style per rep), and ≥1 multi-color or filled variant where the op calls for it (`night_sky` dark fill, gradient-shaded `smooth_path`, colored `rect`/`ellipse` fills). This guarantees each library item has diverse test points in both the calibration and golden halves.

**Mode 2 — review gallery (human verification of built output).** The labeler's second tab: for each example, show the input (real sketch or rendered synthetic detections) beside the **rendered result page**, and blitz through with arrow keys — ← reject, → approve, ↓ flag ("right op, ugly composition"). This upgrades checkpoint 3 from reading JSON to *seeing renders* (much higher signal per human-second), doubles as the golden-set end-to-end review, and every verdict is logged as eval data. Vocabulary and ranking for both modes come from `vocabulary.md`.

## 7. Serving, fallback, latency, cost

| Role | Model | Cost/call | Fallback |
|---|---|---|---|
| Vision | Gemini 2.5 Flash-Lite | ~$0.0002 | Gemini 2.5 Flash |
| Builder | FreeSolo Qwen3.5-0.8B adapter (hosted, `flash deploy`, OpenAI-compatible, structured outputs default) | ~$0.000025 | Prompted frontier model behind the same contract → `wait`-everything |
| Frame (extension) | Claude | on demand | feature hidden |

The demo can never hard-fail: every hop degrades to something that works, and **the baseline is the demo** if no adapter wins in time.

Latency budget (target <3s button-press → preview): screenshot ~50ms · vision 1–2s (the long pole; crop to active-ink bounds if needed) · normalizer ~0 · builder 100–300ms · validation ~0 · bloom animation ~300ms.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Vision misdescribes messy ink | 7 geometric kinds are a far easier classification than 66 component types; "keep as drawn / skip" + forced-component mode make misses one-tap fixes; bake-off on real sketches |
| Glyph misread (b vs. 6, stray marks) | Single-letter-alone-in-a-box rule; no glyph → plain shape (never surprise components); forced mode as escape hatch |
| Synthetic noise ≠ real noise | Noise model is measured from labeled sketches, not invented |
| Adapter loses to baseline | Baseline is the demo; the harness itself becomes the FreeSolo story |
| Schema drift | Rule zero: one schema file imported by generator, harness, validator, serving config |
| Sweep produces unattributable results | One variable per axis; test split untouched until promotion |
| Vocabulary creep | Wave-1 entry is closed at 16; every bench promotion pays schema + renderer + prompt + data |
