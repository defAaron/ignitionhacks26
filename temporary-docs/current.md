# baio — Current State & Goal

## What it is
Sketch autocomplete: draw rough ink → AI crisps it into clean shapes/UI.
"Frame" turns the whole canvas into a working interactive site.
_"Essays have autocomplete; why not drawing?"_

## Pipeline (5 stages)
ink PNG + stroke manifest → **Gemini** (what, not where) → **normalizer** (geometry from strokes) → **fine-tuned FreeSolo builder** (ops, no coords) → **validators** → rendered shapes.

Live surfaces: `/studio` (draw, Space = autocomplete, Frame → HTML site), `/gallery`, `/labeler`, landing `/`.

## Model story
Fine-tuned FreeSolo (Qwen 2B) beats baseline Gemini — op acc 96.7 vs 75, night-sky 100 vs 25, abstention F1 .97 vs .67. ~30 runs, 4 waves, ~$1.30.

---

## Current goal — the next level
1. **Smarter drawing logic.** Redesign the recognition/interpretation logic to focus on the *specifics* of a drawing so it feels more intuitive to how people actually draw. The core logic behind interpreting the drawing should change.
2. **Full-site design.** Expand from a single canvas to whole multi-page sites — pages with databases and functions, generated from various sketches.

## In-flight structural change
Moving everything app/deployable into a new top-level `product/` directory (the zippable, deployable artifact). Research/training (`freesolo/`), docs, pitch materials stay at repo root.
