# baio — Shared Schemas

The frozen contracts of the AI pipeline ("rule zero", `ai-pipeline.md` §3.2). Everything downstream — the synthetic generator, the eval harness, the backend validators, the FreeSolo training config, the serving `response_format` — imports these files. **This README is the human review artifact for checkpoint 1: read it, approve or amend the schemas, then the wave-1 sweep launches against them.**

**Shapes-first pivot (2026-07-18):** the canvas primitive is now the **shape**, not the website component. The live contracts are `shapes-v2.json` (builder, wave 1.5 — `shapes-v1.json` remains the wave-1-strict subset) and `detection-shapes.json` (vision). `components-v1.json` / `components-v2.json` and `detection.json` are **legacy (pre-pivot), retained for the `flash-1784430057` run** — do not extend them, do not point new code at them.

Seven schemas, all JSON Schema draft-07, deliberately guided-decoding-friendly (plain objects, enums, `required` arrays, local `$ref` — no `$dynamicRef`, no conditionals, no numeric bounds or regex patterns that constrained-decoding engines handle inconsistently):

| File | Status | What it describes | Produced by | Consumed by |
|---|---|---|---|---|
| `shapes-v1.json` | live (wave-1-strict subset) | Builder output, shapes wave 1 (16-op vocabulary, **no coordinates**) | FreeSolo builder or prompted baseline | Backend validators → deterministic geometry + renderer; eval harness |
| `shapes-v2.json` | **live** | Builder output, shapes wave 1.5 (**22-op** vocabulary: the 16 + 6 diagram ops; §1.5) | FreeSolo builder or prompted baseline | Same as v1; the default validator wave |
| `shapes-v3.json` | **frozen (wave 3)** | Builder output, shapes wave 3 — the 22 trained ops plus product-side `page` in the enum (§1.6). Wave 3's *semantic* change is the INPUT-side `parent` containment field | FreeSolo builder or prompted baseline | Wave-3 training config + serving `response_format`; backend validators |
| `detection-shapes.json` | **live** | Vision-layer output: geometric kind + glyph + text + color signals | Vision model (`lib/vision/`); or the client in forced mode | Normalizer (`lib/interpretation/`) → builder input; labeler calibration |
| `logic-v1.json` | **live** | Wiring builder output: one logic **block** answering one drawn arrow (or `wait`) | `/api/wire` (Gemini intent → Claude body) | Wire validator; stored on the plane; Frame-space connections |
| `labeler-record.json` | live | One saved drawing from the labeling window | `product/app/labeler` (the throwaway blitz app) | Calibration measurements (noise model, bake-off), golden end-to-end test set |
| `components-v1.json` | legacy (pre-pivot), retained for the `flash-1784430057` run | Builder output, old wave 1 (18-op component whitelist) | — | reference only |
| `components-v2.json` | legacy (pre-pivot), retained for the `flash-1784430057` run | Builder output, old wave 2 (all 66 component ops) | — | reference only |
| `detection.json` | legacy (pre-pivot), retained for the `flash-1784430057` run | Old component-classifying vision output | — | reference only |

Zod mirrors with inferred TS types live at `types/schemas.ts` — keep them structurally identical to these files; a change to one without the other is schema drift, the exact failure rule zero exists to prevent.

---

## 1. `shapes-v1.json` — the builder contract (shapes-first)

Top-level shape:

```json
{
  "schema_version": "shapes-1.0",
  "components": [ <command>, ... ]
}
```

Each command is one of two variants (`anyOf` on a clean `op` discriminator): a **shape-command** or a **wait-command**.

### The no-coordinates rationale

The builder model outputs **no x/y/width/height — anywhere**. Geometry always derives deterministically from the source strokes: centroid + extents for boxes/ellipses, endpoints for lines/arrows, a smoothed path for freeform. The model contributes only *semantics* (`op`), *styling* (`params`), and at most one named geometry adjustment (`snap`, a closed enum whose math is pure code).

**Geometry from ink, semantics from the model, precision from code.** Consequences, all by construction:

- A model cannot misplace what it never places — placement drift, the old pipeline's main geometric failure mode, is unrepresentable.
- Training pairs shrink and sharpen: the policy to learn is kind+glyph+context → op + snap, not coordinate regression.
- Eval simplifies: geometry is a pure function of ink, so only op/params/snap choices are model behavior to score.

### Shape-command — "make this stroke-set crisp as `op`"

```json
{ "op": "navbar", "from": "det_1",
  "params": { "fill": "#1a1a2e" }, "snap": "full_width_top" }
```

| Field | Req | Meaning | Producer notes | Consumer notes |
|---|---|---|---|---|
| `op` | ✓ | What the ink becomes, from the 16-op vocabulary (enum below). Ops are **semantic**; detection kinds are geometric — the mapping kind+glyph+context → op is the core thing the model learns. | Builder | Renderer dispatches to the op's template; validator rejects unknown ops (belt-and-braces under guided decoding). |
| `from` | ✓ | Id of the source detection this command answers. Ties recognition to output — one misread never ruins the page; eval matches command↔gold on it; the client wipes exactly that detection's ink on accept. | Builder copies it from input | Eval matching; ink wipe; hallucination check (no valid `from`). |
| `params` | – | Styling knobs, free-form object at the grammar level (conventions below; the domain validator owns per-op checking). Never geometry. | Builder | Renderer styling + procedural generators. |
| `snap` | – | One named geometry adjustment from the policy enum below. **Default `none`** — omission means "geometry exactly from ink". The policy names an intent; the snap math is deterministic code. | Builder (the only geometry influence it has) | Geometry deriver (`lib/interpretation/`). |

**The 16-op vocabulary** (canonical tables + sketch signatures: `docs/architecture/vocabulary.md`):

- Base shapes (6): `rect`, `ellipse`, `line`, `arrow`, `text`, `smooth_path`
- Glyph components (6): `image` (box+i), `form` (box+f), `button` (box+b), `navbar` (box+n), `video` (box+v), `placeholder` (box+?)
- Decorative (4): `wave_divider`, `night_sky`, `sparkles`, `aurora_gradient`

### Snap policies

| Policy | Meaning |
|---|---|
| `none` | Default. Geometry exactly as derived from ink (smoothed/crisped, never moved or resized). |
| `full_width_top` | Stretch to full artboard width and pin to the top edge (y = 0). The navbar policy. |
| `full_width_bottom` | Stretch to full artboard width and pin to the bottom edge. Footer-band policy. |
| `full_width` | Stretch to full artboard width, keep the ink's vertical position. Section dividers (`wave_divider`). |
| `straighten_h` | Snap a near-horizontal `line`/`arrow` to exactly horizontal (endpoints' mean y). |
| `straighten_v` | Snap a near-vertical `line`/`arrow` to exactly vertical (endpoints' mean x). |
| `square` | Equalize width and height about the centroid — clean square from a rough box, circle from a roundish ellipse. |
| `center_in_region` | Keep size, center the shape within its enclosing region (containing box, or artboard column). |

### `params` conventions

Open object at the grammar level; per-op key sets are domain-validator conventions:

- `fill` — CSS color string (any op with area)
- `gradient` — `{ "colors": [<css>, ...], "direction": "down" | "right" | "diagonal" | "radial" }`; a gradient-filled `smooth_path` covers the removed `blob` op
- `stroke` — `{ "color": <css>, "width": <px> }` (outline styling)
- `text` — the content string, for the `text` op
- `label` — routed handwriting for glyph components (`button` label, `navbar` brand, `form` title)
- `seed` + decorative knobs, as before: `wave_divider` (`amplitude`, `layers`, `flip`), `night_sky` (`density`, `size_range`, `cluster_bias`), `sparkles` (`count`, `size_range`, `spread_zone`), `aurora_gradient` (`palette`, `blob_count`, `blur_radius`). Every decorative op takes a `seed` — re-rolling it live is a demo beat.

### Wait-command — calibrated abstention

```json
{ "op": "wait", "from": "det_3", "reason": "low_confidence" }
```

Unchanged from the pre-pivot contract: the literal `"wait"`, the source detection id, and a free-string diagnostic `reason` (never parsed for behavior). The 1:1 command-per-detection rule holds for waits too; ~25% of training examples contain at least one.

### Enforcement

Same three points as ever, now reading **this** file: backend validator (via `shapesOutputSchema` in `types/schemas.ts`), FreeSolo `[train] structured_outputs`, per-request `response_format`. All three must read the same file; training inputs are byte-for-byte the runtime format.

---

## 1.5 `shapes-v2.json` — the wave-1.5 builder contract (+6 diagram ops)

**Byte-identical in shape to `shapes-v1.json`; the ONLY difference is the `op` enum (16 → 22).** v1's enum is a strict subset of v2's, so any valid v1 document is also a valid v2 document. `schema_version` stays the literal `"shapes-1.0"` — it is the **contract revision**, not the wave; the wave is which *file* (op whitelist) is enforced. This mirrors the components-v1/v2 precedent exactly.

**The +6 diagram ops** (canonical tables + signature thresholds: `docs/architecture/vocabulary.md` §1.5): `bar_chart`, `pie_chart`, `venn_diagram`, `timeline`, `periodic_table`, `atomic_structure`.

Recognition model: detection kinds stay the same 7 — a diagram is a multi-stroke **composite** that vision may report as a **single detection with `kind: "scribble"`** (existing fields only); the builder maps it to a diagram op via bbox/color signatures (POLICY in `lib/datagen/scenes.ts`), kept pairwise disjoint from the four decorative scribble signatures.

**Per-op `params` conventions (all optional; seeded free values the renderer owns — scoring never checks them):**

- `bar_chart`: `values` (number[]), `seed`
- `pie_chart`: `values` (number[]), `seed`
- `venn_diagram`: `sets` (2–3), `seed`
- `timeline`: `events` (count), `seed`
- `periodic_table`: none by default
- `atomic_structure`: none by default (`shells` allowed)

**Snap:** `none` for all diagram ops except `timeline`, which takes `full_width` when very wide (≥ 0.8 of the artboard width — same band-rule style as `wave_divider`).

**Semantic legality** (`lib/validate/shapes.ts`, `wave` parameter, default `2`): all six legal from kind `scribble`; `periodic_table` additionally from a plain `rect` (a rect grid read as one box); `wait` always legal. Under `wave: 1` the diagram ops are rejected — a wave-1-strict adapter never learned them.

Zod mirror: `shapesOutputV2Schema` / `OPS_SHAPES_V2` in `types/schemas.ts`. The FreeSolo grader whitelist (`freesolo/environment.py`) carries the same 22 ops (rule zero: update together).

---

## 1.6 `shapes-v3.json` — the wave-3 containment contract

Frozen 2026-07-19 for the wave-3 training sweep (`freesolo/WAVE3-HANDOFF.md`; semantics: `docs/architecture/wave3-semantics.md`).

### The four semantic rules, in contract terms (highest precedence last)

1. **BASELINE** — every enclosed detection (`kind: rect | ellipse | smooth_path`) → its geometric op, with its drawn/shaded color as `params.fill` (or `params.gradient` when the shading transitions hues).
2. **DETAILS** — a detection whose `parent` is non-null is a DETAIL of that parent, **not a sibling**: its `text` routes into the parent command's `label`/text content, its colors into the parent's `fill`/`gradient`. **Child detections emit no commands of their own.**
3. **FUNCTION** — a glyph (single letter alone) inside a shape is the only source of function: it selects the glyph op (`b`→`button`, `f`→`form`, `i`→`image`, `n`→`navbar`, `v`→`video`, `?`→`placeholder`) for the *parent's* command, with sibling details still routed in (box + `b` + "Login" + purple shading → ONE button command, label "Login", fill purple). No glyph, no behavior. (In practice the normalizer's glyph merge collapses the letter into its host rect *before* containment runs, so the builder usually sees one rect detection with `glyph` set.)
4. **DIAGRAMS** — a cluster that reads as a diagram is the diagram composite op, consuming the whole cluster (the wave-1.5 mechanism, unchanged).

`wait` is unchanged; open/unenclosed ink keeps its wave-1 readings. The command-coverage rule becomes: **exactly one command per TOP-LEVEL detection** (`parent === null`); a command whose `from` is a child detection is a violation ("child-spawned command" — the failure mode this wave kills). Like the old 1:1 rule, this is a domain-validator check, not expressible in JSON Schema.

### Why the OUTPUT schema is mostly unchanged (v3 ≈ v2, fresh `$id`)

The wave-3 change is *which detections get commands and what routes into their params* — pure policy. The command grammar (`{op, from, params?, snap?} | wait`, 22 trained ops, zero coordinates) needs nothing new: details land in `params` keys that already exist (`label`, `fill`, `gradient`). `shapes-v3.json` therefore matches v2 in shape with a fresh `$id`/title, minted so the wave-3 `[train] structured_outputs` string and serving `response_format` reference the wave unambiguously.

**Product-side addition:** the v3 `op` enum also lists `page`. That is **not** a trained builder op (no retrain). Vision reports glyph `"p"`; the adapter treats it as an unknown glyph and emits the rect/placeholder fallback; `lib/recognize.ts` remaps a clean single-letter `p` onto `page` after validation, and committing it spawns a page object on the plane. The enum listing lets the renderer/client accept the remapped op. `schema_version` stays `"shapes-1.0"` — contract revision, not wave.

### The `parent` field (builder INPUT side)

Each builder-input detection gains exactly one field:

```
parent: <detection_id> | null     — REQUIRED, nullable
```

- The minted id (`det_N`) of this detection's **immediate (deepest) enclosing** detection, or `null` for a top-level detection. Parent chains are acyclic by construction (a parent's bbox area is strictly greater than its child's), and arbitrary nesting depth is representable — each detection names only its immediate parent.
- Zod mirror: `shapeBuilderDetectionV3Schema` / `shapeBuilderInputV3Schema` in `types/schemas.ts`. `detection-shapes.json` (the vision contract) is **unchanged** — vision never reports `parent`.

### Who assigns `parent`: the normalizer, deterministically (the decision)

Containment is geometry, and geometry is code's job (the same principle that removed coordinates from the output). Asking the vision model to report `parent` would put a probabilistic model in charge of a question that ink answers exactly, add a failure mode (hallucinated/missed parent links) needing its own calibration, and let the vision prompt drift out from under the training data. Instead, `lib/interpretation/normalize.ts` assigns it in a pure pass that runs **after the glyph merge**:

- Detection A is a child of B iff (a) B's `kind` ∈ {`rect`, `ellipse`, `smooth_path`} (enclosed kinds only), (b) ≥ **92%** of A's real stroke-union bbox area lies inside B's real bbox (`CONTAINMENT_MIN_OVERLAP = 0.92` — "strictly inside, with tolerance for ink that kisses the outline"), and (c) B's bbox area is **strictly greater** than A's.
- **Tie-breaks:** deepest container wins (smallest bbox area among candidates); an exact area tie breaks toward earlier vision order. Coincident/equal boxes never parent each other (rule (c)). Non-nested partial overlap (< 92%) assigns no parent. Degenerate child bboxes (straight lines, dots) get a 1px-per-axis floor so containment stays well-defined. Glyph letters already consumed by the glyph merge don't exist by this point and never become children.
- The same rules, run over synthetic scenes, mint the training inputs — code shared or mirrored exactly (see the parity warning).

### Training-input parity (rule zero)

The wave-3 builder input is `{artboard, detections: [{id, kind, glyph, text, colors, gradient_direction, confidence, bbox, parent}]}` — **byte-for-byte** what the serving pipeline serializes. Two consequences:

1. The dataset generator must emit `parent` exactly as the normalizer would assign it (same 92% rule, same tie-breaks, same key order in the serialized JSON) — a generator that hand-assigns parents the normalizer wouldn't produce is silently training on a different distribution.
2. **Do not thread `parent` into the live serving path until the wave-3 adapter promotes.** The deployed wave-2 adapter was trained on inputs *without* `parent`; adding the field to serving input while wave-2 is live is exactly the input drift rule zero forbids — in both directions.

---

## 1.7 Wave 3.1 — the builder-INPUT densification spec (`composite` on detections)

Frozen 2026-07-19 for the wave-3.1 training sweep (`freesolo/WAVE3.1-HANDOFF.md`). This is a **v3.1 builder-input revision only**: the OUTPUT schema is unchanged — still `shapes-v3.json` (22 ops, `schema_version` `"shapes-1.0"`, zero coordinates), still one command per TOP-LEVEL detection, children emit nothing. No new JSON schema file is minted (the output file is what training/serving configs reference); the input change below is the frozen contract.

### The `composite` field (builder INPUT side — the one contract addition)

Each builder-input detection gains exactly one field:

```
composite: "bar_chart" | "pie_chart" | "venn_diagram" | "timeline"
         | "periodic_table" | "atomic_structure" | null
```

- **Serialized AFTER `parent`, always present, `null` when absent.** The exact key order of a wave-3.1 builder-input detection IS the contract:

  ```
  id, kind, glyph, text, colors, gradient_direction, confidence, bbox, parent, composite
  ```

  This mirrors the runtime source byte-for-byte: `NormalizedDetection.composite` is `string | null` (the normalizer defaults it with `?? null` — `lib/interpretation/normalize.ts`), so the promotion-time serving serialization emits the key on every detection.
- **Zod**: OPTIONAL-nullable in the v3.1 input mirror (v3 documents without the key still parse — same grace `shapeDetectionSchema` gives the vision side). Until promotion the v3.1 mirror lives locally in `lib/datagen/build.ts` (`shapeBuilderDetectionV31Schema`); at promotion it moves to `types/schemas.ts`. Wave-3.1 **minted training rows always carry the key** (required-at-serialization, like `parent`).
- **Semantics — a glyph for diagrams, with glyph discipline.** `composite` is vision's advisory report of what a stroke cluster LOOKS like (`detection-shapes.json`, unchanged). It is meaningful **only on `kind: "scribble"`** detections: scribble + `composite: X` → the diagram op `X` (params optional/seeded free values). On any other kind it is **ignored entirely** — exactly as a word is never a glyph, a `composite` never changes a non-scribble's mapping (kind correction can promote a scribble to rect while a stale hint tags along; the hint must not resurrect the diagram). A composite-less ambiguous scribble → `wait` ("ambiguous"), **never a guessed diagram**; a low-confidence scribble waits even when `composite` is present (the confidence rule outranks the hint, as it outranks glyphs).

### Promotion-time serving change (staged exactly like `parent`, §1.6)

`lib/interpretation/pipeline.ts` `toBuilderDetection` currently ends at `parent: n.parent`. When the wave-3.1 adapter promotes, add **one line after it** — `composite: n.composite` — and nothing else (key order above falls out of the object literal order). Do **not** add it while the wave-3 adapter (`965bf6b6`, trained without the field) is live: that is the input drift rule zero forbids, in both directions. Once the field is sent, the hint-fallback branch in the pipeline's diagram step (`det.composite` rescue after `classifyDiagram` misses) becomes redundant — keep the measured-params recognizer FIRST regardless (real bar heights beat seeded defaults), and the builder handles what it misses.

### Policy-side densification (no contract change, wave-3.1 data only)

Also trained in this wave, all expressible in the existing grammar:

- **Style descriptors** (mirrors the serving baseline's "STYLE DESCRIPTORS" rule, `lib/models/baselineShapes.ts`): written words that describe appearance are styling, not labels. A color word → `params.fill` (fixed word→hex table); a theme word (`rainbow`, `sunset`, `ocean`, `fire`, `neon`, `pastel`, `gold`, `dark`, `midnight`) → a gradient — BASE shapes get `params.gradient = {colors: [3–7 theme hexes], direction: "right"}`, GLYPH components get `params.fill = "gradient"` + `params.colors = [hexes]`. Mixed text ("Login rainbow") → label "Login" + the style; descriptor-only text → style, NO label; brand-ish multi-word text ("Ocean Tours" on a navbar) stays wholly a label; observed ink colors always beat descriptor words. The deterministic word→hex / theme→palette tables live in `lib/datagen/scenes.ts` (`COLOR_WORDS`, `THEME_PALETTES`) — they are part of the labeling function.
- **Common labels**: the 16 high-frequency UI words (Login, Sign up, Submit, Search, Home, About, Contact, Buy, Menu, Send, Next, Learn more, Get started, Subscribe, Play, Download) densified across confidence tiers.
- **Diagram variation**: wider free-param ranges (bar counts 2–8, wedges 2–7, ticks 3–9) and sloppier/neater composite bboxes. The model's diagram duty is the composite-hint path + abstention; the code recognizer still owns clean diagrams.
- **Noise recalibration**: serving now runs a deterministic kind-correction pass (§2.5) that promotes closed ink misreported as `line`/`scribble`/`smooth_path`, so enclosed shapes rarely reach the builder mis-kinded — the closed-shape confusion rates in `lib/datagen/corrupt.ts` are halved accordingly (open-stroke line↔arrow confusion unchanged; correction never touches arrowheads).

---

## 2. `detection-shapes.json` — the vision contract (shapes-first)

What the eyes hand to the hands. **Kinds are GEOMETRIC (what the ink looks like); ops are SEMANTIC (what to make)** — the builder maps kind + glyph + context → op. Vision still classifies and never places.

```json
{ "detections": [ {
    "stroke_ids": ["s4", "s5"],
    "kind": "rect",
    "glyph": "b",
    "text": null,
    "colors": ["#1a1a2e"],
    "gradient_direction": null,
    "confidence": 0.87,
    "bbox": { "x": 540, "y": 400, "width": 180, "height": 52 }
} ] }
```

| Field | Req | Meaning | Producer | Consumer |
|---|---|---|---|---|
| `stroke_ids` | ✓ | The ink this detection claims (≥1). A stroke id appears in at most one detection (prompt rule; normalizer resolves violations by confidence). | Vision | Normalizer (conflict resolution, existence check, bbox snapping); client (ink wipe). |
| `kind` | ✓ | Geometric class: `rect` \| `ellipse` \| `line` \| `arrow` \| `scribble` \| `smooth_path` \| `text_writing`. What it *looks like*, never what to make. | Vision | Builder (op mapping); calibration metric #1. |
| `glyph` | ✓ (nullable) | The single character read *alone inside a box*, or `null`. Required-but-nullable so the model must always decide. A word is never a glyph — it goes in `text`. | Vision | Builder (glyph → component op). |
| `text` | ✓ (nullable) | Handwriting read as content (word/phrase/sentence), or `null`. | Vision | Builder (`text` op content, or `label` param routing). |
| `colors` | ✓ | Observed ink colors (hex/CSS strings); empty array when only default ink. | Vision | Builder → `fill`/`stroke`/`gradient` params. |
| `gradient_direction` | ✓ (nullable) | `down` \| `right` \| `diagonal` \| `null` — set when the strokes visibly shade from one color toward another. (`radial` exists only builder-side, as a params choice.) | Vision | Builder → `gradient.direction`. |
| `confidence` | ✓ | 0–1 score for the kind classification (range enforced by the normalizer, not the grammar). Tiers (apply/suggest/ignore) derive from it. | Vision | Tiering, low-tier floor drop. |
| `bbox` | ✓ | **Advisory** position/size `{x, y, width, height}` in screenshot px. The normalizer overwrites it with the union of the claimed strokes' real bounds — geometry always comes from ink. Kept for calibration (vision-bbox error → synthetic jitter model). | Vision | Normalizer (replaced), calibration (measured). |

Differences from legacy `detection.json`, for readers of the old contract: `candidates[]` (ranked component types) → a single geometric `kind` + `confidence`; `label_text` → split into `glyph` vs `text` (the single-letter-vs-word rule); `style_hints` → first-class `colors` + `gradient_direction`.

### 2.5 Serving-side kind correction + alternates (additive, no schema change)

Two deterministic serving-side behaviors layered on the contracts above — **neither file changes**; existing clients are unaffected.

**Kind correction** (`lib/interpretation/normalize.ts`, before the glyph merge/containment): vision sometimes misreports an enclosed shape as `line`/`scribble`. Closedness is measurable from the ink, so a reported `line`/`scribble`/`smooth_path` whose concatenated points are geometrically closed — closure ratio `dist(first,last)/pathLength < 0.15` (`KIND_CLOSURE_MAX_RATIO`), ≥ 8 points, bbox area ≥ 400px² — is promoted: **rect** when the coarse-RDP ring (epsilon 4% of the bbox diagonal) has 3–5 corners (turn ≥ 35°) with near-axis-aligned sides (≤ 20° off-axis), else **ellipse** when roundness `perimeter²/(4π·area) ≤ 1.2`, else **smooth_path**. Scribbles additionally require a single stroke with ≤ 1 self-intersection (multi-stroke scribbles may be diagram composites). Enclosed ink is never demoted to `line`; forced-op synthesized detections (confidence 1.0) are never corrected. The original vision kind is kept as `visionKind` on the normalized detection (telemetry only — the builder never sees it).

**Alternates** (`lib/interpretation/pipeline.ts`): each autocomplete result gains an **additive** response field —

```json
"alternates": [ { "op": "ellipse", "params": { "fill": "#123456" }, "note": "rounder reading of the same outline" } ]
```

`alternates: Array<{op, params?, note}>`, always present, length 0–2, never repeating the primary op. Ranked deterministically from the detection's measured ink-geometry scores (zero extra model calls): rect ↔ ellipse when roundness ≤ 1.35 (`ALT_ELLIPSE_ROUNDNESS_MAX`) / corners in the rect band, open `line`/`smooth_path` offer each other, glyph components offer `[rect, placeholder]`, decorative/diagram results offer only `smooth_path` ("keep as drawn"), `wait` gets none. Style params (`fill`/`gradient`/`stroke`) carry over from the primary command. The client re-renders an accepted alternate with the result's existing `geometry` — no server rework.

---

## 3. `components-v1.json` / `components-v2.json` — legacy builder contract (pre-pivot)

> **Legacy (pre-pivot), retained for the `flash-1784430057` run.** This contract has coordinates in the model output — exactly what the pivot removed. Kept verbatim so that run's dataset, adapter, and evals stay interpretable. Do not extend; new code targets `shapes-v1.json`.

Top-level shape (both waves):

```json
{
  "schema_version": "1.0",
  "components": [ <command>, ... ]
}
```

| Field | Meaning | Producer | Consumer |
|---|---|---|---|
| `schema_version` | Frozen at the literal `"1.0"` (a `const`). Guards against silently mixing outputs minted under a different contract. Note: this is the **contract revision**, not the wave — both wave files carry `"1.0"`; the wave is which *file* (op whitelist) was enforced. | Builder (guided decoding makes it impossible to omit) | Backend validator (rejects anything else before touching `components`) |
| `components` | Ordered list of commands, **exactly one per input detection, no exceptions**. This 1:1 rule is what makes outputs mechanically checkable (per-detection accuracy, hallucination rate, missed-detection rate all fall out of matching on `from`). | Builder | Validators, renderer, eval harness |

Each command is one of two variants (`anyOf` on a clean `op` discriminator):

### Op-command — "place/update this component"

```json
{ "op": "button", "id": "c2", "from": "det_1", "layer": "content",
  "x": 620, "y": 400, "width": 200, "height": 56, "label": "Login" }
```

| Field | Req | Meaning | Producer notes | Consumer notes |
|---|---|---|---|---|
| `op` | ✓ | Component type, from the wave's whitelist (enums below). | The core thing the model learns: vocabulary→op mapping. | Renderer dispatches to the op's hand-crafted template; validator rejects unknown ops (belt-and-braces — guided decoding should already make them impossible). |
| `id` | ✓ | New component's id in the tree (e.g. `"c2"`). Free-form string; uniqueness within the tree is a **domain-validator** check, not a grammar check. | Builder mints it. | Tree insertion; future commands may reference it via `replaces`. |
| `from` | ✓ | Id of the source detection this command answers (e.g. `"det_1"`). Ties recognition to placement — one misread never ruins the page, and eval is per-detection comparison. | Builder copies it from the input. | Eval harness matches command↔gold on it; client wipes exactly that detection's ink on accept; validator flags commands with no valid `from` (hallucination). |
| `layer` | ✓ | `background` \| `content` \| `overlay`. Render stacking: decorative backdrops (waves, skies, gradients) → `background`; structural UI → `content`; floating accents (sparkles, hand-drawn arrows, modals) → `overlay`. Conventions, not grammar: the *typical* layer per op is learned, and the domain validator may warn on odd pairings (e.g. `navbar` on `background`). | Builder | Renderer z-ordering |
| `x`, `y` | ✓ | Top-left corner, artboard coordinates (px, 1440-wide artboard). May be fractional. | Mostly copied from the detection bbox; snapped by learned policy (navbar→y=0, footer→bottom). | Renderer placement; geometric validator (bounds, overlap). |
| `width`, `height` | ✓ | Box size in px. Positivity/bounds are enforced by the **geometric validator**, not the grammar (numeric bounds are unevenly supported by guided-decoding engines, so the schema says only `number`). | Copied through with disciplined snapping (button heights to standard sizes, navbar full-width). | Same as above. |
| `label` | – | Routed handwriting: the detection's `label_text` delivered to the right prop — `button.label`, `heading` text, `text_input` placeholder. Omitted when the detection had none or the op takes no text. | Builder (label-routing is learned behavior §3.3) | Renderer template text slot; eval "label accuracy" metric. |
| `params` | – | Op-specific knobs, free-form object at the grammar level (per-op key sets are conventions documented below; the **domain validator** owns per-op checking). Decorative/diagram ops carry these + a `seed` — the renderer owns all the beauty, procedural and reproducible. | Builder | Renderer's procedural generators; render-and-judge "param sanity". |
| `replaces` | – | Id of an **existing tree component** this command updates instead of inserting fresh. This is how "overlap with existing same-type component → update, not duplicate" is expressed. Absent = fresh insert. | Builder (tree-awareness is learned §3.3) | Tree diff/patch logic; domain validator checks the id exists and types are compatible. |

**Per-op `params` conventions (v1):**

- `wave_divider`: `amplitude`, `layers`, `flip`, `seed`
- `night_sky`: `density`, `size_range`, `cluster_bias`, `seed`
- `sparkles`: `count`, `size_range`, `spread_zone`, `seed`
- `blob`: `points`, `irregularity`, `fill`, `seed`
- `aurora_gradient`: `palette`, `blob_count`, `blur_radius`, `seed`
- Structural ops (`button`, `card`, …): optional `fill` / `variant` styling hints (e.g. from vision `style_hints`)

Every decorative op takes a `seed` — re-rolling it live is a demo beat. Wave-2 diagram ops follow the same pattern (e.g. `bar_chart`: `values`, `seed`); their conventions get appended here when the wave-2 renderers land.

### Wait-command — calibrated abstention

```json
{ "op": "wait", "from": "det_3", "reason": "low_confidence" }
```

| Field | Req | Meaning | Producer | Consumer |
|---|---|---|---|---|
| `op` | ✓ | The literal `"wait"`: "this detection should not become a component (yet)". Abstention is the behavior generic models are worst at — our headline differentiator; ~25% of training examples contain at least one. | Builder | Client leaves the ink alone; eval "abstention F1". |
| `from` | ✓ | Source detection id, same semantics as above — the 1:1 command-per-detection rule holds for waits too. | Builder | Eval matching. |
| `reason` | ✓ | Short free-form cause, e.g. `"low_confidence"`, `"ambiguous"`, `"incomplete_sketch"`. Kept a free string (not an enum) so training data can grow reasons without a schema freeze-break; it's diagnostic, never parsed for behavior. | Builder | Logging/debug UI; never gates anything. |

### The wave-1 / wave-2 relationship

`components-v2.json` is **byte-identical in shape** to v1; the *only* difference is the `op` enum (18 + `wait` → 66 + `wait`). Wave 1 (Sat) freezes v1, labels the core 18, and trains against it; wave 2 (Sun) freezes v2, covers the remaining 48, and trains a full-vocabulary adapter. Each wave's generator, validator, training config, and serving `response_format` import **their wave's file** — never mix (a wave-1 adapter served under the v2 grammar could emit ops it was never trained to place). v1's enum is a strict subset of v2's, so any valid v1 document is also a valid v2 document.

**Wave-1 enum (18):** `navbar`, `footer`, `button`, `heading`, `paragraph`, `image`, `hero`, `form`, `text_input`, `card`, `card_grid`, `search_bar`, `dropdown`, `wave_divider`, `night_sky`, `sparkles`, `blob`, `aurora_gradient`

**Wave-2 enum (66):** the 18 above, plus structural `cta_banner`, `tabs`, `modal`, `accordion`, `carousel`, `table`, `sidebar`, `testimonial`, `logo_cloud`, `newsletter_signup`, `pricing_table`, `image_gallery`; decorative `dot_grid`, `grid_lines`, `hero_glow`, `layered_waves`, `hand_drawn_underline`, `hand_drawn_arrow`, `hand_drawn_highlight`, `shape_scatter`, `confetti`, `concentric_rings`, `squiggle_accents`, `landscape_silhouette`, `tiled_pattern`, `noise_grain`, `topo_contours`, `low_poly_mesh`; diagrams `bar_chart`, `venn_diagram`, `flowchart`, `timeline`, `line_chart`, `pie_chart`, `table_grid`, `org_chart`, `quadrant_chart`, `scatter_plot`, `funnel_chart`, `cycle_diagram`, `pyramid_chart`, `coordinate_plane`, `mind_map`, `gantt_chart`, `sequence_diagram`, `block_diagram`, `state_diagram`, `er_diagram`

(Ordering matches `label-tree.md`; `†`-flagged ops are in the enum but may ship recognition-only if their renderers slip.)

### The three enforcement points (why drift is impossible by construction)

1. **Backend validator** — the first of the three validator stages (schema → geometric → domain). Parses the builder's raw text (after checking `finish_reason` for truncation) and validates against the wave's file via the zod mirror in `types/schemas.ts`. Catches fallback-model output and anything the grammar engine's schema subset couldn't express (it is the *only* line of defense when the fallback frontier model, not the adapter, is serving).
2. **FreeSolo `[train] structured_outputs`** — the wave's file, serialized to a string, in `configs/sft.toml`. Constrains GRPO/OPD rollouts and becomes the **deployed adapter's default grammar**, so the sampler physically cannot emit off-schema text during training or serving.
3. **Per-request `response_format`** — the same file sent as OpenAI-standard `json_schema` on every builder call. Redundant with #2 for the adapter (that's the point — belt and braces), and the *only* grammar constraint when the request is routed to the prompted-baseline fallback. Overridable without redeploy.

All three must read the same file from this directory. Training inputs are byte-for-byte the runtime format; the moment any consumer inlines its own copy, drift silently poisons the dataset.

---

## 4. `detection.json` — legacy vision contract (pre-pivot)

> **Legacy (pre-pivot), retained for the `flash-1784430057` run.** New code targets `detection-shapes.json`.

What the eyes hand to the hands. Produced by Gemini (temperature 0, structured output) from screenshot + stroke manifest; in **forced-component mode** the client synthesizes it directly (chosen type, confidence 1.0, bbox from stroke bounds) with no Gemini call. Consumed by the normalizer, which snaps/filters and emits the canonical list the builder depends on.

```json
{ "detections": [ {
    "stroke_ids": ["s4", "s5"],
    "candidates": [ { "type": "button", "confidence": 0.71 },
                    { "type": "card",   "confidence": 0.18 } ],
    "label_text": "Login",
    "bbox": { "x": 540, "y": 400, "width": 180, "height": 52 },
    "style_hints": { "colors": ["#1a1a2e"], "fill": "dark" }
} ] }
```

| Field | Req | Meaning | Producer | Consumer |
|---|---|---|---|---|
| `detections` | ✓ | One entry per recognized stroke-set. Unrecognizable strokes are **omitted, never guessed**; an empty array is valid (nothing recognized). | Vision | Normalizer |
| `stroke_ids` | ✓ | The ink this detection claims (≥1). Every detection must bind to stroke ids so accepting a component wipes exactly the right ink. A stroke id appears in at most one detection (prompt rule; the normalizer resolves violations by confidence). | Vision | Normalizer (conflict resolution, existence check, bbox snapping); client (ink wipe). |
| `candidates` | ✓ | 1–3 type guesses, **ranked** by confidence, types only from the active packs' vocabulary. Top-1 drives the pipeline; the alternates feed the pill-bar UX (tap = client-side re-render, zero model calls, every tap a gold label). `type` is a free string at the grammar level — the vocabulary is pack-dependent and the normalizer whitelist owns rejection. | Vision | Normalizer (floor filter on top-1 confidence); builder (top-1 + alternates as context); pill bar. |
| `candidates[].type` | ✓ | Candidate op id, e.g. `"button"`. | Vision | as above |
| `candidates[].confidence` | ✓ | 0–1 score (range enforced by the normalizer, not the grammar). Confidence tiers (high/medium/low → apply/suggest/ignore) derive from the **top candidate here**, never from the builder. | Vision | Tiering, low-tier floor drop. |
| `label_text` | ✓ (nullable) | Handwriting read inside the shape, or `null` if none. Explicitly required-but-nullable so the model must always decide, rather than silently omitting. | Vision | Builder routes it to the right prop (`button.label` / heading text / input placeholder). |
| `bbox` | ✓ | Advisory position/size `{x, y, width, height}` in screenshot px. **Vision classifies, never places**: the normalizer overwrites this with the union of the claimed strokes' real bounds — geometry always comes from ink. Kept in the record for calibration (Gemini-bbox vs. guide-box error → the synthetic jitter model). | Vision | Normalizer (replaced), calibration (measured). |
| `style_hints` | – | Optional appearance signals: `colors` (hex/CSS strings observed in the ink) and `fill` (e.g. `"dark"`, `"solid"`, `"none"`). A dark-filled rect reads as `night_sky`; multicolored button strokes can tint the template. Both keys optional. | Vision | Builder/renderer styling `params`; never affects classification downstream. |

---

## 5. `labeler-record.json` — the gold-data contract

One drawing from the labeling window (`ai-pipeline.md` §6): pick a label, draw in the guide box, `Enter` saves one of these to JSONL. Never enters FreeSolo training directly (the training set contains zero images and zero strokes) — its jobs are the **calibration half** (noise model + vision bake-off + prompt tuning) and the **golden half** (untouched end-to-end test set).

| Field | Req | Meaning | Producer | Consumer |
|---|---|---|---|---|
| `id` | ✓ | Unique record id. | Labeler | Everything downstream (joins, dedupe). |
| `label` | ✓ | The op being drawn — enum of all label-tree ops (71 post-pivot; typo-proof at save time). | Labeler (current menu selection) | Calibration metric #1: did Gemini's top candidate match? |
| `phase` | ✓ | `1` (shapes-v1 16) or `2` (the 55-item bench), per `label-tree.md`. Which wave's calibration/golden pool the record belongs to. | Labeler (derived from label) | Wave-scoped dataset generation and eval. |
| `split` | ✓ | `"calibration"` or `"golden"`, assigned **at save time**, per label. Anti-leak rule: never calibrate on the golden half — that's test-set contamination in slow motion. | Labeler (random per-label split) | Calibration reads only `calibration`; end-to-end eval reads only `golden`. |
| `guide_bbox` | ✓ | The randomized guide box shown while drawing — **it is the gold bbox**. `{x, y, width, height}` in canvas px. | Labeler | Calibration metric #2 (Gemini bbox error → synthetic jitter distribution) and #3 (ink overflow → normalizer snap tolerance). |
| `canvas` | ✓ | `{width, height}` of the drawing canvas in px — makes all coordinates in the record interpretable and lets calibration normalize across canvas sizes. | Labeler | Coordinate normalization. |
| `strokes` | ✓ | The raw ink: array of `{id, points, color, width}`. Every stroke carries its `id` so detections can bind to strokes **exactly as at runtime**. `points` are `{x, y, t?}` — `t` (ms timestamp) optional; kept because it's free to record and future pressure/speed features may want it, but nothing may classify on stroke order/direction (cultural noise — final geometry only). `color` is the ink swatch used (CSS color), `width` the brush width in px. | Labeler | Stroke manifest reconstruction for calibration runs; stroke-bounds error measurement. |
| `colors_used` | ✓ | Distinct ink colors in the drawing (denormalized from strokes for cheap querying). Color is real vision signal — dark fill → `night_sky`, multicolor → `style_hints`. | Labeler | Variation-coverage checklist; vision-prompt calibration. |
| `style_prompt` | ✓ | The style the sidebar requested for this rep: `"sloppy"` \| `"neat"` \| `"free"`. Guarantees diverse test points per op (checklist: ≥1 sloppy + ≥1 neat per label). | Labeler | Coverage enforcement; noise-model stratification. |
| `png_path` | ✓ | Relative path to the rendered PNG of this drawing — the exact image handed to Gemini during calibration/bake-off. | Labeler | Vision calls; review gallery (mode 2). |
| `created_at` | ✓ | ISO-8601 timestamp (e.g. `2026-07-18T21:04:05.000Z`). | Labeler | Ordering, session bookkeeping. |

---

## 6. `logic-v1.json` — the wiring contract

A **new-feature** contract (not part of the FreeSolo shapes waves). One drawn arrow → one logic **block**, or a `wait` if the endpoints cannot be resolved. No coordinates: the studio already resolved the arrow's tail and tip to element/page ids; the models contribute only semantics.

Two-stage pipeline (`/api/wire`): Gemini describes what the arrow connects; Claude writes the block body against this schema. A block is a stateless function: it reads named cells (`inputs`), runs on a `trigger` (`onClick` / `onSubmit` / `onLoad` / `onChange` / `onResult` / `onTimer`), and emits one `output` whose type is `data` (write a cell) or `page` (navigate). State lives in cells, never in the block.

Stored on the liminal space (`space.wires`) and gathered when Frame stitches a multi-page site. TS mirror: `product/lib/wire/types.ts`.

---

## Deliberate grammar-level omissions (for the checkpoint-1 reviewer)

These are *choices*, not oversights — flag at review if you disagree:

- **No numeric bounds** (`confidence ∈ [0,1]`, positive bbox sizes): guided-decoding engines support numeric ranges inconsistently; the geometric validator and normalizer own them.
- **`params` is an open object**: per-op key sets are conventions (documented above) checked by the domain validator; encoding per-op param schemas into the grammar would bloat the guided-decoding automaton for near-zero gain.
- **`wait.reason` is a free string**, not an enum — diagnostic only, never parsed for behavior.
- **`glyph` is a free (nullable) string** in `detection-shapes.json`, not an enum of the book letters — vision reports what it *read*; the builder decides whether it maps to a component op or falls back to `placeholder`/`wait`. Product-side `p` → `page` is applied after the model (`lib/recognize.ts`). Enum-locking it would force the model to hallucinate a known letter.
- **`snap` is optional rather than required-with-default**: omission = `none`; making it required would spend model tokens restating the default on every command.
- **`from` has no format pattern**: `det_1` styles are conventions; regex in guided decoding buys little and costs automaton size.
- **1:1 command-per-detection is not expressible in JSON Schema** — it's the first domain-validator check and the eval harness's matching precondition.
- *(Legacy schemas keep their own omissions: `candidates[].type` free string in `detection.json`, no bounds on the coordinate fields in `components-v*.json`.)*
