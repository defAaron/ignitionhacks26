# Test-bank C — genuinely ambiguous decorative/adversarial cases (proposals, NOT in the bank)

Companion to `decorative-adversarial.jsonl` (54 cases). The bank follows `POLICY` in
`lib/datagen/scenes.ts` **exactly** — every gold in the JSONL is byte-consistent with
`goldForDetection`. The items below are places where POLICY, `docs/architecture/vocabulary.md`,
or product intuition disagree. Where POLICY gives a deterministic answer, a case testing that
answer IS in the bank (noted); the ambiguity is recorded here so a human can amend POLICY
before the bank is treated as ground truth.

## 1. `wave_divider` has no position prior in POLICY

vocabulary.md §1/§4 says a wave is a wide squiggle **"at a section boundary"** and that
"long wave squiggles anchor at section boundaries", but `scribbleGold` checks only
`width >= 864 && height <= 180` — no y condition at all. A wide short scribble at y=100
(inside a hero) or y=850 is gold `wave_divider` today.

- In the bank: `dec-wave-clean-midband`, `dec-wave-boundary-exact` (follow POLICY).
- **Proposal:** either (a) document that width+aspect alone IS the wave signature and fix
  the vocabulary wording, or (b) add a position gate (e.g. y in [15%, 90%] of artboard
  height, or "not overlapping a text/hero cluster"). If (b) is adopted, re-gold the two
  cases above and add near-miss cases at the new y boundary.

## 2. Wave outranks night_sky and aurora (branch order, not specificity)

`scribbleGold` checks wave first. Two real collisions:

- Dark, top-hugging scribble with `h in [160, 180]` and `w >= 864` satisfies **both** wave
  and night_sky → gold is `wave_divider`. (Bank: `adv-wave-outranks-night-sky`.)
- Multicolor hero scribble with `w >= 864` and `h <= 180` satisfies both wave and aurora →
  gold is `wave_divider`. (Bank: `adv-wave-outranks-aurora`.)

A human would likely call the first one a night sky (it is dark and hugs the top). The
generator never produces these (its night_sky shapes have h ≥ 220, aurora w ≤ 880), so the
branch order is untested by synthetic data — but a real user can absolutely draw them.

- **Proposal:** order signatures most-specific-first (night_sky → aurora → wave → sparkles),
  or add exclusions to the wave branch (`!(dark && y <= nightSkyMaxY)` and
  `colors.length < auroraMinColors`). Keep the bank cases as regression pins either way —
  flip their golds if the order changes.

## 3. `sparkles` anchors on abstained / low-confidence text

`nearText` checks sibling `kind === "text_writing"` only — never the sibling's confidence.
A text detection at confidence 0.30 gets `wait("low_confidence")` yet still promotes the
scribble beside it to `sparkles`. Product-wise the sparkle then renders next to raw
unaccepted ink.

- In the bank: `adv-sparkles-near-abstained-text` (follows POLICY: wait + sparkles).
- **Proposal:** require the anchoring text detection to itself pass `waitConfidence`
  (i.e. `other.confidence >= POLICY.waitConfidence`), or downgrade the scribble to
  `wait("ambiguous")` when its only anchor abstained.

## 4. Confidence exactly 0.35 proceeds (strict `<`)

`det.confidence < POLICY.waitConfidence` — the comment says "below this", so 0.35 exactly
is NOT a wait. Consistent, but graders and prompt authors keep writing "≤". The bank pins
both sides (`adv-conf-exact-threshold`: 0.35 → rect, 0.34 → wait).

- **Proposal:** one sentence in `shared/schemas/README.md` §1 ("thresholds are strict
  less-than; the boundary value proceeds") so eval graders don't hand-mark 0.35 as wait.

## 5. Glyph AND text are silently dropped on `smooth_path`

Policy for `smooth_path` is `withStyle` only: a smooth_path detection carrying
`glyph: "b"`, `text: "Login"` emits a bare `{op: "smooth_path"}` — the readable word is
discarded entirely (no `label`, no separate text). For rects the same word would become a
label. Users who write inside a blob lose their text.

- In the bank: `adv-glyph-on-smooth-path` (follows POLICY: bare command).
- **Proposal:** either route `det.text` to `params.label` on smooth_path too (renderer may
  ignore it), or keep the drop but state it in vocabulary.md §2 ("glyphs/labels are
  box-only"). Current vocabulary wording only covers glyphs, not the text drop.

## 6. Decorative position gates read `bbox.y` (top edge), not the center

`night_sky` (`y <= 60`), `aurora` (`y <= 480`): a scribble whose top edge is at y=470 but
which extends to y=860 (bottom half of the page) still counts as "hero region" aurora;
conversely a sky-like scribble starting at y=61 fails outright. Top-edge semantics are
fine for night_sky ("hugs the top") but read oddly for aurora ("in a hero region").

- In the bank: `dec-aurora-boundary-exact` (y=480 top edge, follows POLICY),
  `adv-night-sky-not-at-top`.
- **Proposal:** for aurora, gate on bbox center-y (`y + h/2 <= ~550`) instead of top edge;
  keep night_sky on the top edge. Margin analysis needed so corrupt.ts jitter can't flip
  essential shapes.

## 7. Full-height wide rects become `full_width_bottom`

`rectGold` checks the bottom band **before** the top band: a plain rect spanning nearly the
whole artboard (y=0, h=890, w≥1094.4) matches `y+h >= 820` first and golds as
`full_width_bottom` — a page-background sketch pinned to the bottom edge. Not in the bank
(no clearly right answer to pin).

- **Proposal:** add a height cap to both band branches (e.g. `h <= 140`, generator emits
  58–90) so page-sized rects fall through to plain `rect` with no snap.
