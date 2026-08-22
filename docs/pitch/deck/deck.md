# baio — Pitch Deck (draft)

> Venture deck skeleton. One `##` = one slide. Bullets only.

## 1 · Thesis

- Creation is not the bottleneck. Delivery of thought to creation is.
- AI made creation cheap. The human→AI input channel did not change: type text, describe, wait.
- We change the input channel itself → baio and the related suite.

## 2 · Problem

- Ideas fade faster than hands move.
- Today's trade: fast but fading (paper, dead ink) vs faithful but slow (design tools, menus, precision dragging).
- Text got autocomplete years ago. Imagination did not.

## 3 · Solution — baio

- Autocomplete for drawing. Sketch a page; real editable components bloom in exactly where you drew them.
- Sketch is the spec: Seal a page, Frame the space — a working, downloadable website / React project.
- Plain shapes stay plain; one glyph letter adds function; words and colors add style. No surprises.
- Low confidence → model abstains; ink stays ink. Failure mode is "nothing happens," never "wrong thing happens."

## 4 · How it works

- Gemini describes; our fine-tuned 2B model decides; code places.
- Geometry only from user strokes; validators fail closed — a hallucination becomes nothing.
- Held-out test: 96.7% vs 75.0 op accuracy over Gemini baseline, abstention F1 0.97 vs 0.67, <$0.25 training.

## 5 · Moat

- Building with AI since summer 2025 — the first wave of AI coding.
- Team has lived the builder workflow: researchers, hackathon organizers, hackers (5× hackathons won), AI-native internship workflows.
- UI/UX focus — frictionlessness is the true moat: even a little friction points people away.
- Data flywheel: every accept / reject / relabel is a gold training label.
- Own model, not API glue: our 2B beats the frontier baseline, trained for cents.

## 6 · Beachhead

- Waterloo: hackathons + a dense population of student builders.
- Hackathon distribution: demo-first product, zero learning curve, spreads at build events.

## 7 · Where it goes — the input channel deepens

- Engine is domain-agnostic: flowcharts, circuits, chemistry, org charts = new template pack + vocabulary.
- Hybrid input: drawing + text on one canvas.
  - Magic wand: circle a region, say "make it three.js" → it is.
  - Text boxes with `/runAi`: type what you don't want to draw; it becomes elements.
  - Text descriptions customize drawn elements.
- Canvas as prompt-based environment: environmental prompt variables live on the canvas.
- Wires and pages as code abstraction — code abstraction in general.
- Edge AI. Tablet/whiteboard SDK. Design-tool export.

---

**Gaps (not specified yet — do not fabricate):** market size, business model / pricing, ask, roadmap dates, team names/bios.
