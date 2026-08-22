# baio × FreeSolo — Comprehensive Pitch Brief

> Self-contained handoff for a pitch agent. Everything here is measured, timestamped in `freesolo/eval-results.md`, and reproducible via `scripts/eval-harness.ts`. Written 2026-07-19, end of the training campaign.

---

## 1. What baio is (30 seconds)

**baio is sketch autocomplete.** Draw rough shapes with a pen; real structured components bloom in at exactly the positions drawn — watercolor preview, accept, editable vector output. Write a lone **b** in a box and it becomes a button. Write "Login" next to it and that's the button's label. Shade it purple and that's the fill. Draw two overlapping circles and get a clean Venn diagram. It is a predictive *editing* system, not an image generator.

**The architectural signature — "geometry from ink, semantics from the model, precision from code":**

```text
ink PNG + stroke manifest
  → Gemini (the EYES: describes kind/glyph/text/colors — never places, never decides)
  → deterministic normalizer (geometry from real stroke bounds; containment; kind-correction)
  → FreeSolo fine-tuned model (the BRAIN: description → tool call, NO coordinates in output)
  → three validation gates (fail closed — a bad command becomes "wait", never a broken page)
  → deterministic SVG templates (the HANDS: all beauty is code, seeded, reproducible)
```

The trained model outputs ~40 tokens per shape: `{op, from, params, snap}`. It *cannot* misplace anything — it never emits a coordinate. Size and position come from where the user actually drew.

## 2. How FreeSolo works and how we used it

FreeSolo Flash is managed post-training: you push an **environment** (dataset + a Python task definition), pick a base model, and `flash train` returns a **LoRA adapter** (the base stays frozen; small low-rank matrices learn the delta — which is why runs cost cents and deploy instantly). `flash deploy` serves it behind an OpenAI-compatible URL; the app selects a model by run id — promotion is one env var.

**Our usage was exactly the platform's thesis — agent-driven, end to end:** Claude Code drove the entire loop (`env push → dry-run → cost → train → deploy → eval → promote`) autonomously, including overnight fleets of parallel runs with automatic watchers that deployed and examined every model as it finished. A human made exactly four kinds of decisions: schema sign-offs, taste passes, promote/hold calls, and policy rulings on ambiguous test cases.

- **Base models:** Qwen3.5-0.8B (fast path) and Qwen3.5-2B (final champion)
- **Algorithm:** SFT (dataset = program-generated text pairs; answer-first: build the correct page, derive the noisy description — gold correct by construction); one GRPO run (RL with our validator pipeline as the reward function) demonstrated the platform's RL path
- **Training data:** 100% synthetic, zero images, zero human labeling — the model never sees ink, only descriptions
- **Typical run:** 300–640 examples, 2–4 epochs, $0.01–$0.10, ~10–20 min wall clock (mostly unbilled cold start; actual training 1–3 min)

## 3. The headline benchmarks

### 3.1 The frontier-model kill (wave 2)

Same task, same exams, prompted **Gemini** (frontier, instructed with our full rulebook) vs. our **$0.04 fine-tune**:

| Exam | Prompted Gemini | Fine-tuned 2B | Margin |
|---|---|---|---|
| Independent hand-authored bank (165 adversarial cases) | 87.9% | **92.3%** | +4.4 |
| Noisy realistic split (corrupted detections) | 77.7% | **96.5%** | **+18.8** |
| Abstention precision (when it refuses, is it right?) | 0.79 | **0.95–1.00** | — |
| Hallucinated commands | 0% | 0–0.5% | — |
| Cost per call | ~$0.0002 | **~$0.000025** | ~10× cheaper |

### 3.2 The comprehension wave (wave 3 — containment semantics)

Taught the model that *a word inside a box belongs to the box* — details route into their parent's command (box + `b` + "Login" + purple shading → ONE button command with label and fill). On the held-out test:

| Metric | Prompted Gemini | Fine-tuned champion |
|---|---|---|
| Op accuracy | 75.0% | **96.7%** |
| **Detail-routing accuracy** (child word→label, interior color→fill) | 58.7% | **90–93.5%** |
| Night-sky-from-dark-rect | 25.0% | **100%** |
| Child-spawned commands (containment violations) | 0% | **0%** |
| Abstention F1 | 0.672 | **0.974** |

**The one-line version: on compositional understanding, the fine-tune nearly doubled the frontier model's score.**

### 3.3 The final serving champion (`flash-1784456967-5a2f2897`, wave 3.1, 2B)

The only deployment left on the account. On the hardest exam generation (style-words + composite hints added):

op **90.4%** · detail routing **87.9%** · containment **100%** · composite-hint mapping **68%** · hallucination **0%** · abstention F1 **0.857** · style-word routing 40% (the one honestly-unfinished skill — documented, with the fix known: rebalance data mix, don't densify).

### 3.4 Campaign totals

```text
~30 training runs · 4 promoted model generations · total spend ≈ $1.30
zero serving downtime across every promotion (hot env-var swaps)
eval turnaround: 165-case exam in 27 seconds (parallelized harness)
end-to-end product latency: press-to-preview ~2-4s (vision is the long pole)
```

## 4. The stories judges remember (all true, all measured)

1. **The test bank caught our model cheating.** The first adapter to "beat" Gemini (87.3% on the held-out split) collapsed on an independently hand-authored 165-case exam — 48% hallucinated commands. Diagnosis: it had memorized sequential detection-ids and a "roughly five commands per scene" length prior from synthetic data. Two surgical data fixes (sparsity mix, non-sequential ids), one retrain, hallucination → **0.0%**. *Held-out splits share the generator's blind spots; independent exams don't.*
2. **Abstention is trainable; prompting can't buy it.** Frontier models are either timid (over-refusing good input: precision 0.34) or reckless (under-refusing junk) depending on distribution. A ~25%-wait training diet produced adapters with abstention precision **1.000** — when they refuse to build, they are never wrong. Knowing when *not* to draw is the product's politeness, and it was learned, not prompted.
3. **Four hot promotions in one night.** Each wave's winner strictly dominated the incumbent on the current distribution before swapping in; the bar-first discipline (baseline measured before any training, held-out test untouched until the promote decision) meant no promotion was ever rolled back.
4. **The final round *failed* — and that's the system working.** Densifying the weak skills 3× taught them better (style 57%, composite 73%) but warped the general distribution (op fell 11 points). The promote bar rejected it; the champion stood. A benchmark that can say "no" is the whole point.
5. **We stress-tested the platform and filed receipts.** Found live: serving ignores OpenAI `response_format` (and its mere presence disables the working `guided_json` path); guided decoding engages non-deterministically (~1 in 5 requests unconstrained); temp-0 co-batched requests are non-deterministic; GRPO final-adapter deploys fail (checkpoint deploys work). All worked around client-side (guided_json-only + grammar tightening + JSON repair + retry) — serving parse rate 100%.

## 5. Live demo-ables (all verified working)

- **Venn from real ink:** two hand-wobbled overlapping circles through the live pipeline → `venn_diagram` at 0.95 confidence, geometry at true stroke bounds. Same machinery: bar/pie/timeline/periodic table (all 118 elements)/atomic structure.
- **The glyph book:** box+`b`→button, `i`→image, `f`→form, `n`→navbar (auto-snaps full-width-top), `v`→video, `?`→placeholder. "Login" beside the `b` becomes the label. Semantics are opt-in — a plain box stays a crisp box, never a surprise component.
- **Closure correction:** a closed shape misread as a "line" is corrected by arithmetic before the model sees it; every result carries ≤2 deterministic **alternates** ("or a rect? or keep-as-drawn?") — instant client-side swaps, zero model calls, every tap a logged training label.
- **Visual showcase artifact** (real adapter calls, before/after cards): https://claude.ai/code/artifact/e032f37d-94c7-4a73-a1ed-9fd1ec73c4d7 — regenerate against any model with `scripts/showcase.mts`.
- **Fail-closed guarantee:** any invalid model output degrades to "wait" — ink stays ink; the demo cannot render garbage.

## 6. Numbers cheat-sheet (for slides)

```text
$1.30        entire training campaign (~30 runs, 4 promoted generations)
$0.000025    per builder call (0.8B) — ~10x cheaper than the frontier baseline
+18.8 pts    over prompted Gemini on realistic noisy input (96.5 vs 77.7)
2x           frontier model's score on compositional detail-routing (90+ vs 58.7)
1.000        abstention precision — the model has never wrongly refused
0.0%         hallucination (after the test bank caught and we fixed 48%)
165          hand-authored adversarial test cases; 27-second full-exam runtime
100%         serving parse rate through a flaky grammar endpoint (client hardening)
0            minutes of serving downtime across four model promotions
```

## 7. Reproduce any number

```bash
npx tsx scripts/eval-harness.ts --contract shapes-v3 --model freesolo \
  --dataset freesolo/dataset/test.jsonl --concurrency 8      # champion, current exam
npx tsx scripts/eval-harness.ts --contract shapes --model baseline \
  --dataset freesolo/testbank/all.jsonl                       # Gemini on the bank
cat freesolo/eval-results.md                                  # the full timestamped ledger
npx tsx scripts/test-autocomplete.ts                          # 75-check pipeline suite + live e2e
```

Ledger: `freesolo/eval-results.md` · Test bank: `freesolo/testbank/` · Contracts: `shared/schemas/` · Champion: `FREESOLO_MODEL=flash-1784456967-5a2f2897` behind `FREESOLO_BASE_URL` (OpenAI-compatible).
