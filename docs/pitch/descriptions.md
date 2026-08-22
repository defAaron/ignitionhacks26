# baio — Descriptions at Every Length

Copy for whatever box a form gives you. All interchangeable; pick by character limit.

## One-liners

- **The thesis:** Our essays have autocomplete. Shouldn't our imagination?
- **The product:** baio is autocomplete for drawing — sketch a page, watch it bloom in like wet ink, frame it into a working website.
- **The magic:** Digital paper with magic in it — whatever you sketch comes alive.
- **The vision doc's:** baio predicts your next diagram stroke. It completes the figments of your imagination.
- **The closer:** Start the drawing. baio finishes the thought.

## Tagline (~140 chars, Devpost card / social)

> Autocomplete for drawing: sketch a page and watch it bloom in like wet ink — real, editable components, framed into a working website.

## The story (the canonical telling — open any pitch with this)

> In the figments of your imagination, a world appears — picturesque scenes that flow like a river. And every second, it fades. The artists, the engineers, the thinkers rush to engrave that flowing thought on paper. But the pen is slow, and by the time the hand catches up, the palace in your mind is a fragment of what it was.
>
> We stopped accepting that trade for text years ago. Our essays have autocomplete. Our code has autocomplete. Shouldn't our imagination?
>
> Imagine a magic paintbrush: you begin the picture, and the whole of it appears — your idea on the canvas, whole and full, not a fragment.
>
> We built that brush. It's called baio.

## Short description (~50 words)

baio is autocomplete for drawing. Sketch a rough page — boxes, glyph letters, scribbles — and a fine-tuned 2B model we trained this weekend substitutes real, editable components exactly where you drew them, blooming in like watercolor. When you're done, one button turns the page into a working website.

## Medium description (~120 words)

Our essays have autocomplete; our thoughts don't. Ideas fade faster than pens move — so baio brings autocomplete to the canvas. Draw naturally: every enclosed shape gets crisp, a single letter in a box adds function (`b` → button, `n` → navbar), words and colors become labels and fills, and sketched skeletons become full diagrams — up to the 118-element periodic table. Suggestions bloom in as translucent watercolor and dry into editable vector structure on accept; low confidence means the model abstains and your ink stays ink. The decision-maker is a Qwen3.5-2B model we fine-tuned on FreeSolo for under $0.25 — beating the Gemini baseline 96.7% to 75.0% on op accuracy. Press Frame, and Claude turns the finished wireframe into a downloadable, working website.

## Long description (~250 words, "detailed written project description")

Getting an interface idea out of your head is a tradeoff today: pen and paper is fast but produces dead ink; Figma is structured but interrupts thinking with menus and precision dragging; text-to-image generators produce unedited pictures detached from what you drew. baio keeps the speed and freedom of sketching and produces the structured result of a design tool — the sketch itself is the spec.

You draw on real paper-feeling canvas. Every enclosed shape becomes a crisp shape, filled with the color you shaded it. Semantics are opt-in via glyphs — a single letter alone in a box (`b` button, `n` navbar, `f` form, `i` image, `v` video) — so plain shapes stay plain and there are never surprise components. Words become labels ("Login"), colors become fills, theme words become gradients ("rainbow"). Decoratives (night skies, wave dividers, auroras) and six diagram types (bar, pie, Venn, timeline, atomic structure, the full periodic table) render procedurally and seeded. Layers spawn on overlap, the paper scrolls infinitely, photos drop into any drawn enclosure. When the page is done, Frame sends the wireframe to Claude and returns a complete, responsive, interactive single-file website.

Under the hood: Gemini describes each shape (kind, glyph, text, colors) but never places anything; geometry is computed from the user's actual strokes; and the decisions are made by a Qwen3.5-2B model we fine-tuned on FreeSolo — 96.7% op accuracy vs the 75.0% Gemini baseline, abstention F1 0.97, trained for under $0.25. Everything passes fail-closed validators into deterministic renderers: model output is never trusted with coordinates, markup, or scripts, so a hallucination becomes nothing — never a broken page.

## Elevator pitch (spoken, ~30 seconds)

"You know how your essays autocomplete? We built that for drawing. You sketch a webpage with a pen — a box for the navbar, a letter *b* for a button — and real components bloom in like wet ink, exactly where you drew them. Accept and they turn into a real, editable wireframe; one more button and Claude turns it into a working website you can download. The cool part: the model making the decisions is a 2-billion-parameter model *we* trained this weekend for under 25 cents — and it beats Gemini at the job."

## Name lore (judges always ask)

**baio** (毛笔) means "brush pen" — the Chinese calligraphy brush. It's why suggestions bloom in like wet ink and "dry" into structure when you accept: the reveal is the signature of the product, true to the name. (Keep the lore to this one line on stage — the story stays in plain English so every judge follows it.)
