# Glyph/text test bank — ambiguous cases (held out of glyphs.jsonl)

Cases where the documented policy sources disagree or leave room for argument.
Each carries a proposed gold; none is included in `glyphs.jsonl` until resolved.
Policy sources: `docs/architecture/vocabulary.md` §2 (the glyph book) and the
labeling function `goldForDetection` / `normGlyph` in `lib/datagen/scenes.ts`.

---

## A1. Digit in the glyph field

```json
{"artboard":{"width":1440,"height":900},"detections":[{"id":"det_1","kind":"rect","glyph":"7","text":null,"colors":[],"gradient_direction":null,"confidence":0.9,"bbox":{"x":300,"y":300,"width":260,"height":170}}]}
```

**Ambiguity.** `vocabulary.md` §2 says the trigger is "one **letter**, alone,
inside a box"; a digit is not a letter, which argues for treating the glyph as
absent (plain `rect`). But `normGlyph` in `scenes.ts` accepts **any** single
trimmed character, and `rectGold` maps out-of-book characters to `placeholder`
("something goes here was clearly meant"). The two sources genuinely diverge on
non-letter single characters.

**Proposed gold** (follow the labeling function — it is the executable policy):

```json
{"schema_version":"shapes-1.0","components":[{"op":"placeholder","from":"det_1"}]}
```

## A2. Punctuation in the glyph field (not `?`)

```json
{"artboard":{"width":1440,"height":900},"detections":[{"id":"det_1","kind":"rect","glyph":"!","text":null,"colors":["#f59e0b"],"gradient_direction":null,"confidence":0.85,"bbox":{"x":900,"y":420,"width":240,"height":150}}]}
```

**Ambiguity.** Same letter-vs-any-character tension as A1, sharpened by the fact
that exactly one punctuation mark (`?`) *is* in the book. Either `!` reads as
"user attempted a glyph, unknown → placeholder" (per `scenes.ts`) or as stray
ink that shouldn't opt into semantics at all (per the "letter" wording → `rect`).

**Proposed gold:**

```json
{"schema_version":"shapes-1.0","components":[{"op":"placeholder","from":"det_1","params":{"fill":"#f59e0b"}}]}
```

## A3. Single letter delivered in the `text` field of a rect

```json
{"artboard":{"width":1440,"height":900},"detections":[{"id":"det_1","kind":"rect","glyph":null,"text":"b","colors":[],"gradient_direction":null,"confidence":0.9,"bbox":{"x":500,"y":400,"width":180,"height":56}}]}
```

**Ambiguity.** On the *canvas* this is exactly the button trigger (a lone letter
b in a box), so vision arguably erred by reporting it in `text` instead of
`glyph`. Should the builder correct the split and emit `button`? The builder
contract says no — it reads fields, never re-reads ink, and `rectGold` routes a
non-null `text` to a label on a plain rect. But a reviewer optimizing for
end-user intent could defend `button` here.

**Proposed gold** (builder never second-guesses vision's glyph/text split):

```json
{"schema_version":"shapes-1.0","components":[{"op":"rect","from":"det_1","params":{"label":"b"}}]}
```

## A4. Lone letter as free handwriting (`text_writing`, no box)

```json
{"artboard":{"width":1440,"height":900},"detections":[{"id":"det_1","kind":"text_writing","glyph":null,"text":"b","colors":[],"gradient_direction":null,"confidence":0.88,"bbox":{"x":640,"y":500,"width":22,"height":32}}]}
```

**Ambiguity.** Per the policy this is readable handwriting → `text` op with
content "b". But a single stray letter with no box is plausibly an unfinished
glyph box (user drew the letter first, box next) — an argument for
`wait("incomplete_sketch")`. The policy has no incompleteness signal, so it
typesets the letter.

**Proposed gold:**

```json
{"schema_version":"shapes-1.0","components":[{"op":"text","from":"det_1","params":{"text":"b"}}]}
```

---

**Resolution note:** A1/A2/A3/A4 proposed golds all match `goldForDetection`
exactly (verified); the ambiguity is doc-vs-code (A1, A2) or policy-vs-user-intent
(A3, A4), not code-vs-code. If checkpoint review rules that the executable policy
is definitionally the gold, all four rows can move into `glyphs.jsonl` as-is.
