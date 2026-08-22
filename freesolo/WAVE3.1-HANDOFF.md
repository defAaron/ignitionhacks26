# WAVE-3.1 TRAINING HANDOFF — paste this into the FreeSolo training session

You are the wave-3.1 training agent for baio (repo root: this directory). Wave 3 is **promoted and serving** — this wave is a *densification + one contract addition* retrain, not new architecture. Budget ~$1-2; promote only on a held-out win.

## Current serving state (do not break it)

- Live adapter: `flash-1784450352-965bf6b6` (`FREESOLO_MODEL` in `.env`), `BUILDER=freesolo`, guided grammar = `shared/schemas/shapes-v3.json` (22-op output, ≡ v2 in shape), `validateShapes(..., 3)`.
- Builder input carries `parent` (containment, README §1.6) — threaded in `lib/interpretation/pipeline.ts` `toBuilderDetection`.
- Wave-3 held-out test (the bar to beat): 96.7% op accuracy, 90% detail routing, 100% night_sky-from-rect, 0% child-spawned commands, abstention F1 0.974. Ledger: `freesolo/eval-results.md`.

## What changed AFTER the wave-3 dataset was minted (the gaps you're closing)

1. **Style-descriptor words** (`lib/models/baselineShapes.ts` "STYLE DESCRIPTORS" rule — mirror it EXACTLY in data): written words that describe appearance are styling, not labels.
   - Color word ("purple", "red", "teal") → `params.fill` with a tasteful hex.
   - Theme word ("rainbow", "sunset", "ocean", "fire", "neon", "pastel", "gold", "dark", "midnight") → a gradient: BASE shapes get `params.gradient = {colors: [3-7 theme hexes], direction}`; GLYPH components get `params.fill = "gradient"` + `params.colors = [hexes]`.
   - Mixed text "Login rainbow" → `label: "Login"` + the gradient. Descriptor-only text → style params, NO label.
   - When in doubt ("Ocean Tours" on a navbar) it is a label. Observed ink colors always win over descriptor words.
   - The live adapter routes plain color words already (learned from wave-3 detail routing) but NOT theme words — verify with `flash chat` before assuming.
2. **`composite` — the diagram glyph** (NEW builder-input field, the one contract change):
   - The vision contract (`shared/schemas/detection-shapes.json`, zod `shapeDetectionSchema`) now has optional `composite: "bar_chart"|"pie_chart"|"venn_diagram"|"timeline"|"periodic_table"|"atomic_structure"|null` per detection — vision's report of what a stroke cluster LOOKS like. Advisory, exactly like a glyph.
   - Serving currently consumes it in code only (`lib/interpretation/diagrams.ts` — a deterministic recognizer measures the strokes first and synthesizes diagram commands with REAL measured params; the hint is its messy-ink fallback). The adapter never sees the field (rule-zero parity).
   - YOUR JOB: rev the builder-input contract to include `composite` on detections (freeze it — a v3.1 input spec note in `shared/schemas/README.md`; output schema unchanged, still shapes-v3.json), and train the mapping `composite: X → op X` exactly like the glyph book (box+`b`→button :: scribble+composite bar_chart→bar_chart). Include hint-absent diagram cases too (kind=scribble, big bbox, no composite → `wait`, never a guessed diagram).
3. **Common label words** — densify pairs with the labels users actually write: Login, Sign up, Submit, Search, Home, About, Contact, Buy, Menu, Send, Next, Learn more, Get started, Subscribe, Play, Download. Rock-solid `label` routing at any confidence.
4. **Diagram share** — boost the 6 diagram ops' share and variation in the data (bar counts, wedge counts, tick counts, sloppy vs neat). Note: at serving time the code recognizer catches clean diagrams before the model — the model's diagram duty is the composite-hint path and abstention discipline, so weight the data accordingly.

## Recipe (unchanged wave-3 discipline)

- Rule zero: freeze the v3.1 builder-input spec BEFORE minting data; training input byte-for-byte = serving input. Look at `toBuilderDetection` in `lib/interpretation/pipeline.ts` for the exact serving serialization — add `composite` there ONLY at promotion time (mirror how `parent` was staged: computed but not sent until the adapter that knows it goes live).
- Keep: containment/detail-routing distribution, night-sky-from-rect pairs, ~25% wait share, calibrated noise, non-sequential ids, one variable per axis, held-out test untouched until promotion.
- Config: clone `configs/sft-w3.toml` → `sft-w31.toml`; same base model + lora_rank 32; `structured_outputs` stays the shapes-v3.json string verbatim.
- Platform gotchas all still apply (dataset rows keep only input/output/metadata; guided_json flaky — client repairs; Ctrl-C detaches; `flash undeploy` idle deployments).

## Eval — extend `scripts/eval-harness.ts`, then run baseline first

Add two metrics: **style-word routing accuracy** (descriptor → correct fill/gradient param, non-descriptor → label) and **composite→op accuracy** (incl. correctly `wait`ing on composite-less scribbles). Then the full wave-3 table (op acc, detail routing, containment, night-sky, hallucination, abstention F1). Compare against BOTH the prompted baseline and the live `965bf6b6` on the same held-out test.

## Report back

Frozen v3.1 input spec, dataset stats (size, share per workstream), eval table vs baseline + current champion, promote/hold call, and — if promote — the exact serving changes for the app side: new `FREESOLO_MODEL` id, add `composite: n.composite` to `toBuilderDetection`, and note that `lib/interpretation/diagrams.ts`'s hint-fallback then becomes redundant (keep the measured-params recognizer first regardless — real bar heights beat seeded defaults).
