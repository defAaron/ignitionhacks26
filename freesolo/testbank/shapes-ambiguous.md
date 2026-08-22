# Shapes test bank — ambiguous-policy cases (Agent B: shapes & style)

Cases deliberately **excluded** from `shapes.jsonl` because the written policy
(`lib/datagen/scenes.ts` POLICY / `styleParams` / vision contract) either
conflicts with itself or is silent. Each comes with a proposed gold; none are
guessed into the bank. Resolve, then promote into `shapes.jsonl`.

Everything IN the bank is machine-verified equal to `goldForDetection(...)`,
so only genuinely underdetermined situations live here.

---

## A1. Vision reports literal black in `colors` (e.g. `["#000000"]`)

**Input sketch:** plain rect, `colors: ["#000000"]`, no gradient direction.

**The conflict:** the vision contract (`detection-shapes.json`, `lib/vision/prompt.ts`)
says default/black ink must be reported as an **empty** `colors` array — the
low-signal rule. But `styleParams` is a pure function of the detection: if a
noncompliant vision output slips `"#000000"` through, the policy literally
yields `params.fill = "#000000"`, which contradicts the low-signal intent
(black ink is "no styling requested", not "fill it black").

**Proposal:** keep gold = `{"fill": "#000000"}` (policy is defined as
`policy(detection)`, and "crisp what vision saw" is the product behavior);
fix the leak on the vision side, not in the builder policy. Alternative — add
an explicit black-drop clause to `styleParams` — requires touching POLICY and
regenerating the dataset, so it needs a human call.

**Bank coverage of the compliant path:** `ellipse-black-only-no-fill`
(colors `[]` → no fill param).

## A2. CSS name `"black"` (or `"#000"`) in `colors`

Same conflict as A1 in CSS-name form, with a twist: `luminance()` returns 255
(not dark) on unparseable names, so `"black"` isn't even "dark" to the
night-sky prior. **Proposal:** same resolution as A1; additionally teach
`luminance()` the basic CSS names if the black-drop clause is adopted.

## A3. `line`/`arrow` with 2+ colors AND a `gradient_direction`

**Input sketch:** near-horizontal line, `colors: ["#2563eb", "#10b981"]`,
`gradient_direction: "right"`.

**The gap:** `styleParams` is kind-agnostic and would emit
`params.gradient {colors, direction}` — but the dataset generator *never*
produces this combination (`sampleStyle(..., { allowGradient: false })` for
lines/arrows), so the trained policy has zero coverage, and a "gradient fill"
on a 1-D stroke is semantically odd (a gradient **stroke** is more plausible,
but `stroke` params carry `{color, width}`, no gradient slot).

**Proposal:** gold = `params.gradient` per the literal `styleParams` function
(consistency over aesthetics; the renderer may interpret it as a stroke
gradient). If instead the team wants `fill: colors[0]` degradation, that's a
POLICY edit — decide before authoring.

## A4. "First vs dominant" color when `gradient_direction` is null

`styleParams` uses `colors[0]`. The vision prompt never instructs an ordering
(dominant-first vs draw-order). Not a gold conflict — the bank's
`rect-two-colors-no-direction` / `rect-three-colors-no-direction` follow
`colors[0]` — but grading a live model against these assumes vision orders by
dominance. **Proposal:** add "list colors most-prominent-first" to the vision
prompt; keep `colors[0]` golds as-is.

## A5. Plain rect that satisfies BOTH band conditions

Not possible on the 1440×900 artboard (needs `y <= 60` and `y+h >= 820`, i.e.
`h >= 760` — but then it isn't a band, and `rectGold` checks bottom first
anyway). Recorded so nobody authors it later: **bottom wins by code order** if
it ever arises on a different artboard.

## A6. Wide rect at top edge that is also near-square

Geometrically unreachable at 1440×900 (band width ≥ 1094.4 with |w−h|/max ≤
0.15 forces h ≥ 930 > 900), and `rectGold` short-circuits bands before the
square check regardless. No case needed; noted for other artboard sizes:
**band beats square by code order**.

## A7. `smooth_path` detection that touches an artboard edge full-width

E.g. a freeform doodle spanning x=0..1440 hugging the top. POLICY never bands
non-rect kinds, and `smooth_path` is "NEVER moved" by doctrine — but a
full-width doodle at the top *looks* like a header a user might want stretched.
**Proposal:** gold = `smooth_path`, no snap (doctrine wins; snapping user
doodles violates the "user's own shape" promise). Kept out of the bank only
because the mission scoped bands to rects; promote with the no-snap gold if
Agent A/C agree.
