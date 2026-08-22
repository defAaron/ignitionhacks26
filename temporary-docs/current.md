# baio — Current State & Goal

## What it is
Sketch autocomplete: draw rough ink → AI crisps it into clean shapes/UI.
**Seal** freezes a page into a working site (HTML + Vite/React project).
**Frame** stitches every sealed page on the plane into a multi-page site.
_"Essays have autocomplete; why not drawing?"_

## Pipeline (5 stages)
ink PNG + stroke manifest → **Gemini** (what, not where) → **normalizer** (geometry from strokes) → **fine-tuned FreeSolo builder** (ops, no coords) → **validators** → rendered shapes.

Live surfaces: `/studio` (draw, Enter = autocomplete, pages / wires / Seal / Frame), `/gallery`, `/labeler`, landing `/`. App lives in `product/`.

## Product features (shipped)
- Shapes-first + glyphs (`b n f i v ?`) plus product-side `p` → spawn a page
- Six diagrams, four decoratives, photo frames (silhouette crop)
- Infinite plane (camera, focused ↔ liminal), growing page, layer peel
- Wires: drawn arrows → logic blocks (`/api/wire`)
- Seal (`/api/frame` + `/api/frame-app`) and Frame (`stitch` + `/api/frame-space`)
- Optional existing-site module (`NEXT_PUBLIC_MODULE_EXISTING_SITE=1`)
- Element dock, autosave, setup notice for missing keys

## Model story
Fine-tuned FreeSolo (Qwen 2B) beats baseline Gemini — op acc 96.7 vs 75, night-sky 100 vs 25, abstention F1 .97 vs .67. Champion wave under $0.25; full campaign ~$1.30 across ~30 runs / 4 waves.

## In-flight structural change
Deployable app lives in top-level `product/`. Research/training (`freesolo/`), docs, pitch materials stay at repo root.

---

## Current goal — the next level
1. **Smarter drawing logic.** Redesign the recognition/interpretation logic to focus on the *specifics* of a drawing so it feels more intuitive to how people actually draw. The core logic behind interpreting the drawing should change.
2. **Full-site design.** Expand from sketched pages and wires to whole multi-page sites — pages with databases and functions, generated from various sketches.
