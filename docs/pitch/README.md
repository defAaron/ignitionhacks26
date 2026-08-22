# Pitch Kit

Everything needed to sell baio — for the stage, for Devpost, and for any form that asks "describe your project."

| File | What it's for |
|---|---|
| [pitch.md](pitch.md) | The 3-minute stage pitch: script, demo beats, and judge Q&A ammo |
| [devpost.md](devpost.md) | Devpost submission, ready to paste section-by-section |
| [descriptions.md](descriptions.md) | Taglines and project descriptions at every length a form could ask for |

Source material: `docs/vision.md`, `docs/prd.md`, `docs/features/README.md`, `docs/hackathon/`, `freesolo/eval-results.md`. Visual identity: `product/DESIGN.md` (two-ink risograph — white paper, aubergine, celadon). The live landing at `/` is the pitch in that language.

## The three claims (never leave the stage without them)

1. **New interaction** — autocomplete for drawing. Not text-to-image, not a template picker: you draw, it predicts, a watercolor suggestion blooms in, you accept or ignore. Like editor autocomplete, for a canvas.
2. **We trained the model** — a 2B FreeSolo fine-tune that **beats Gemini** on our task: 96.7% vs 75.0% op accuracy, abstention F1 0.97 vs 0.67, on an untouched test split. Total training spend across the whole sweep: **under $0.25**.
3. **It can't break** — the model emits **zero coordinates** (geometry always comes from your actual ink) and everything passes fail-closed validators into deterministic renderers. A hallucination becomes *nothing*, never a broken page.

## TODO (from the war room)

- [ ] Record demo video
- [ ] Submit via the Ignition Hacks V7 portal / whatever form organizers publish (prize tracks TBD on the public site)
- [ ] Vercel or Render push (live demo URL for judges)
- [ ] Rehearse the Arts & Technology beat: two-ink print + watercolor bloom, then Frame
