# 08 — baio Playbook: FreeSolo for sketch→component autocomplete

The concrete plan for this repo. Context: baio (see `docs/prd.md`, `docs/vision.md`) turns pen sketches into structured wireframe components — ~8-component vocabulary, SVG-rendered on the sketch canvas, schema-validated, template-derived.

## Where FreeSolo fits (and where it doesn't)

```text
Strokes on canvas
      ↓
Local recognizer / heuristics          ← deterministic + vision, NOT FreeSolo
  (shape detection, bboxes, text)
      ↓
Normalized detection JSON
      ↓
FreeSolo model                          ← THE ONE TRAINED COMPONENT
  (detections → component commands)
      ↓
Schema validator                        ← deterministic
      ↓
SVG renderer / editor state             ← deterministic
```

The model's only job: map normalized shape detections (+ optional user text) to component command JSON. It never sees raw strokes, never emits SVG, never mutates editor state.

**MVP note:** the PRD's critical path is template-derived recognition — a *prompted* model (or pure heuristics) can ship the demo. FreeSolo is the parallel training track: same input/output contract, so the trained adapter is a drop-in swap behind the same backend call. Build the contract + baseline first; train second.

## Input contract (model prompt payload)

```json
{
  "task": "substitute_components",
  "canvas": { "width": 1440, "height": 900 },
  "detections": [
    { "id": "s1", "kind": "rect",    "bbox": [0, 0, 1440, 80],       "features": ["wide", "top"] },
    { "id": "s2", "kind": "rounded", "bbox": [620, 400, 200, 56],    "features": ["scribble_inside"], "text": "Login" },
    { "id": "s3", "kind": "rect",    "bbox": [100, 200, 400, 300],   "features": ["x_through"] },
    { "id": "s4", "kind": "circle",  "bbox": [60, 20, 40, 40],       "features": [] }
  ]
}
```

## Output contract (versioned command schema)

```json
{
  "schema_version": "1.0",
  "components": [
    { "op": "navbar",  "id": "c1", "from": "s1", "x": 0,   "y": 0,   "width": 1440, "height": 80 },
    { "op": "button",  "id": "c2", "from": "s2", "x": 620, "y": 400, "width": 200,  "height": 56, "label": "Login" },
    { "op": "image",   "id": "c3", "from": "s3", "x": 100, "y": 200, "width": 400,  "height": 300 },
    { "op": "avatar",  "id": "c4", "from": "s4", "x": 60,  "y": 20,  "width": 40,   "height": 40 }
  ]
}
```

`op` ∈ `navbar | button | image | card | input | heading | paragraph | avatar` (the PRD's 8). `from` ties each component to its source detection — this is what makes recognition *local* (one misread shape never ruins the page) and makes evaluation trivial.

Encode this as a JSON Schema in `shared/schemas/` and use it in three places: the backend validator, `[train] structured_outputs`, and per-request `response_format`. One schema, three enforcement points.

## Phase plan

**Phase 1 — contract (no FreeSolo yet):** schema + validator + renderer + 30–50 hand-checked test cases.

**Phase 2 — prompted baseline:** any general model prompted to emit the schema; record per-op accuracy, parse rate, latency, cost on the test set. This is the bar to beat.

**Phase 3 — SFT:**

Dataset generation is nearly free because the mapping is invertible — generate wireframes, derive detections:

```text
Sample a plausible page layout (navbar? hero? card grid? form?)   ← procedural templates
      ↓  components with real coordinates = gold OUTPUT
Derive the detection each component's sketch would produce
  (op → kind/features, bbox + jitter, drop/perturb text, shuffle order)
      ↓  = INPUT
```

Add noise deliberately: jittered bboxes, missing `features`, ambiguous cases (rounded-vs-sharp rect), extra stray detections that should map to nothing. 150–300 reviewed examples is a credible first run; keep 10% eval / 10% test held out.

`freesolo/configs/sft.toml`:

```toml
model = "Qwen/Qwen3.5-0.8B"      # cheapest; escalate to 2B only if eval says capacity is the limit
algorithm = "sft"
seed = 42
thinking = false

[environment]
id = "<your-org>/baio-components"

[environment.params]
split = "train"

[train]
epochs = 1
max_examples = 300
lora_rank = 32
structured_outputs = '<contents of shared/schemas/components-v1.json as a string>'
```

Then the standard loop: `flash env push --name baio-components .` → `--dry-run` → `--cost` → `flash train` → `flash deploy <run-id>` → evaluate C (trained) vs. B (prompted baseline) on the untouched test set.

**Phase 4 — improvement:** log accept/reject/correction events from the app; corrected rejections become reviewed training examples; retrain; promote only on better held-out metrics. GRPO becomes worth considering only once the renderer-based reward exists (schema validity + per-detection op accuracy + bbox IoU + label match − hallucinated-component penalty).

## Evaluation metrics (per PRD)

- parse rate / schema-valid rate (should be ~100% with structured outputs — watch `finish_reason`)
- per-detection op accuracy (the core metric), label accuracy, bbox fidelity (IoU vs. gold)
- hallucinated-component rate (components with no `from`, or `from` not in input)
- missed-detection rate
- latency (autocomplete must feel instant — 0.8B on L4 helps)
- **acceptance rate with little or no correction** — the product metric

## Cost sanity check

A request is roughly ~600 prompt + ~300 completion tokens. On the 0.8B model that's ~$0.000025 per completion uncached — effectively free for a demo; the stable system prompt + schema prefix hits the always-on prefix cache. Training a 300-example, 1-epoch SFT run on a 0.8B model is a small fraction of a GPU-hour; `--cost` will quote it exactly before you spend anything.
