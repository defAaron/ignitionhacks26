# WAVE-3 TRAINING HANDOFF — paste this into a fresh Claude Code session in this repo

You are the wave-3 training agent for baio (repo root: this directory). Your mission: design and freeze the **wave-3 containment contract**, mint its dataset, run the FreeSolo training sweep, eval against the prompted baseline, and report a promote/hold decision. You own everything under `freesolo/`, `lib/datagen/`, and the training-side prompts; you do NOT touch the app UI (`components/`, `app/studio/`) or the serving pipeline without noting it in your report.

## Read first, in this order

1. `docs/architecture/wave3-semantics.md` — the four-rule containment model you are training for (baseline shapes → details → glyph function → diagrams)
2. `docs/architecture/vocabulary.md` — the 16-op vocabulary, glyph book, disambiguation rules
3. `docs/architecture/ai-pipeline.md` — full pipeline; §3.2 (rule zero), §4 (FreeSolo workflow + platform gotchas), §5 (eval harness), §6 (labeler)
4. `shared/schemas/README.md` + `shared/schemas/shapes-v1.json` / `shapes-v2.json` — current frozen contracts and snap table
5. `lib/models/baselineShapes.ts` (builder prompt — recently updated with fill/gradient/night-sky rules), `lib/vision/prompt.ts` (vision prompt — recently updated with fill-inside-outline + manifest colors)
6. `lib/datagen/` + `scripts/generate-dataset.ts` (the answer-first generator), `scripts/eval-harness.ts`
7. `freesolo/eval-results.md` (prior run ledger) and `freesolo/environment.py`

## The semantic model to encode (train the POLICY, guided decoding owns syntax)

1. Every enclosed shape → its geometric op (`rect`/`ellipse`/`smooth_path`), filled with its drawn/shaded color (`params.fill`, or `params.gradient` when the shading transitions hues).
2. Detections contained inside an enclosed shape are DETAILS routed into the parent's command — a word → `label`/text content; interior colors → fill/gradient; **children emit no commands of their own**.
3. A single-letter glyph inside a shape is the only source of function → the glyph op (b/f/i/n/v/?), with sibling details still routed in (box + `b` + "Login" + purple shading → one button command, label "Login", fill purple).
4. Diagram-shaped clusters → the diagram composite op, consuming the whole cluster.
5. `wait` on junk — keep ~25% of examples containing at least one wait; calibrated abstention is the differentiator.

## Contract work (RULE ZERO — freeze before minting ANY data)

- Design `shared/schemas/shapes-v3.json`: the wave-2 op set + a containment field on the detection input side (e.g. `parent: <detection_id> | null` — pick the minimal representation and freeze it) and unchanged command output (one command per TOP-LEVEL detection; no coordinates anywhere). Mirror it in `types/schemas.ts` (zod) and keep `detection-shapes.json` compatible or version it — the runtime vision layer must be able to produce what training assumes (byte-for-byte input parity between training and serving; drift silently poisons everything).
- The vision layer already claims stroke sets and reports colors; containment needs either a vision prompt extension (report `parent`) or a deterministic normalizer pass (child bbox strictly inside parent bbox → assign parent). Prefer the deterministic pass — geometry is code's job. Document the choice in the schema README.

## Known gaps you MUST bake into the data (from the 2026-07-19 color-chain fix)

- The deployed adapter never learned `night_sky` from `kind:rect` — the fixed vision layer now reports a dark-filled rect + claimed dot strokes as ONE rect detection. Mint night-sky pairs with kind=rect + dark fill color.
- Vision now receives per-stroke colors in the manifest and reports fills on closed shapes (hatch-inside-outline = fill, not scribble). Generate detection inputs matching THIS behavior, not the old scribble-heavy distribution.
- Any older golden data labeling shaded shapes as `scribble` is mislabeled under the new vision behavior — relabel or exclude; never eval against it.

## Workflow (steps 1–7 free; training is paid but ~$1/run)

```bash
flash models                                   # confirm Qwen/Qwen3.5-0.8B
cd freesolo/ && flash env push --name baio-shapes-w3 .
flash train configs/sft-w3.toml --dry-run      # free server-side validation
flash train configs/sft-w3.toml --cost         # exact quote, free
flash train configs/sft-w3.toml                # Ctrl-C DETACHES; flash cancel to stop
flash deploy <run-id> && flash chat <run-id> -m '<detection json>'
```

Config: `model="Qwen/Qwen3.5-0.8B"`, `algorithm="sft"`, `epochs` per sweep axis, `lora_rank=32`, `structured_outputs=<shapes-v3.json verbatim string>` (re-copy byte-for-byte if the schema changes — same commit), `thinking=false`. Platform gotchas (all verified previously): dataset rows keep ONLY `input`/`output`/`metadata` (everything else silently dropped); `input` is a serialized string with exact key names; never train and eval on the same records; check `finish_reason` before parsing; `flash undeploy` idle deployments; serving ignores OpenAI `response_format` and its presence BREAKS guided_json — the client (`lib/models/freesolo.ts`) already handles guided_json-only with repair+retry, keep that contract.

## Sweep discipline

Epochs were the biggest lever last wave. Sweep `{300, 640} examples × {2, 4} epochs` first; one variable per axis; held-out test untouched until the promote decision. Run `scripts/eval-harness.ts --contract shapes` (extend for v3) on the PROMPTED BASELINE FIRST so the comparison exists by construction. Metrics that matter: per-detection op accuracy, **detail-routing accuracy** (label/fill/gradient landed on the right parent command — new, add it), containment respected (zero child-spawned commands), hallucinated/missed rates, abstention F1, night_sky-from-rect accuracy. Log every run in `freesolo/eval-results.md` in the existing format.

## Wave-3.1 addendum (2026-07-19, post-promotion): common-vocabulary densification

Wave 3 promoted (flash-1784450352-965bf6b6 serving). The next data patch is about **coverage of the common cases**, not new capability:

1. **Common label words** — mint many pairs using the words real users actually write: Login, Sign up, Submit, Search, Home, About, Contact, Buy, Menu, Send, Next, Learn more, Get started, Subscribe, Play, Download. The model should route these to `label` rock-solidly at any confidence.
2. **Theme/style descriptor words** — the baseline prompt now routes appearance words to style params (see `lib/models/baselineShapes.ts` STYLE DESCRIPTORS rule — mirror it exactly in the data): color words ("purple", "red", "teal") → `fill`; theme words ("rainbow", "sunset", "ocean", "fire", "neon", "pastel", "gold", "dark") → gradients (glyph components: `fill:"gradient"` + `colors`; base shapes: `gradient:{colors,direction}`); mixed "Login rainbow" → label + gradient. The current adapter predates this rule — this is the main behavioral gap vs baseline.
3. **Diagram density** — the 6 diagram ops (bar_chart, pie_chart, venn_diagram, timeline, periodic_table, atomic_structure) are a thin slice of the current data. Boost their share and their variation (bar counts, wedge counts, tick counts, sloppy vs neat) so common diagrams land as reliably as buttons.
4. **Composite hint as a diagram glyph** — the vision contract now carries `composite: <diagram op> | null` on detections (detection-shapes.json; "a glyph for diagrams"). Serving currently consumes it in deterministic pipeline code only (lib/interpretation/diagrams.ts recognizer first, hint as messy-ink fallback — rule-zero: the deployed adapter never saw the field). For the retrain: add `composite` to the builder-input detection contract and train the mapping composite → that diagram op (exactly the glyph pattern), so the model half exists too and hint-only cases stop needing the code fallback.
5. Keep everything else from the wave-3 recipe unchanged (containment, night-sky-from-rect, wait ratio, calibrated noise, one variable per axis, held-out discipline).

~$1 run; promote only if it beats 965bf6b6 on the held-out test including a new style-word-routing metric.

## Report back

Schema decisions made (with the frozen shapes-v3.json), dataset stats (size, wait ratio, nesting depth distribution), per-run eval table vs baseline, the promote/hold call with evidence, and any serving-side changes the app team must make (e.g. normalizer containment pass, `BUILDER=freesolo` model id).
