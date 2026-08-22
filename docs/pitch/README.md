# Pitch Kit

Everything needed to sell baio — for the stage, for **HackHub** (Base44), and for any form that asks "describe your project."

| File | What it's for |
|---|---|
| [pitch.md](pitch.md) | The 3-minute stage pitch: script, demo beats, and judge Q&A ammo |
| [demo-video.md](demo-video.md) | 5-minute demo video: timed VO, shot list, and the written description to paste with the upload |
| [hackhub.md](hackhub.md) | HackHub submission — paste-ready copy section-by-section (not Devpost) |
| [descriptions.md](descriptions.md) | Taglines and project descriptions at every length a form could ask for |

Source material: `docs/vision.md`, `docs/prd.md`, `docs/features/README.md`, `docs/hackathon/`, `freesolo/eval-results.md`.

## The three claims (never leave the stage without them)

1. **New interaction** — autocomplete for drawing. Not text-to-image, not a template picker: you draw, it predicts, a watercolor suggestion blooms in, you accept or ignore. Like editor autocomplete, for a canvas.
2. **We trained the model** — a 2B FreeSolo fine-tune that **beats Gemini** on our task: 96.7% vs 75.0% op accuracy, abstention F1 0.97 vs 0.67, on an untouched test split. Total training spend across the whole sweep: **under $0.25**.
3. **It can't break** — the model emits **zero coordinates** (geometry always comes from your actual ink) and everything passes fail-closed validators into deterministic renderers. A hallucination becomes *nothing*, never a broken page.

## TODO (from the war room)

- [ ] Record demo video — script in [demo-video.md](demo-video.md)
- [ ] Submit on **HackHub** (Base44) — paste from [hackhub.md](hackhub.md); register on [portal.ignitionhacks.org](https://portal.ignitionhacks.org/) too
- [ ] Vercel or Render push (live demo URL for judges)
- [ ] Rehearse the Arts & Technology beat: watercolor bloom, then Seal → Frame
