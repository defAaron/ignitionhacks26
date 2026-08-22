# baio — 5-Minute Demo Video

Record this. Paste the **written description** into HackHub with the video. Total runtime: **5:00**. Spoken pace: calm, ~145 words per minute, with real pauses on every bloom.

**baio** (毛笔) means “brush pen.” Keep the lore to one line on screen. The story stays in plain English.

---

## Written description (paste with the video)

**baio is autocomplete for drawing.** Sketch a page with a pen — a box for a navbar, a letter *b* for a button — and real, editable components bloom in like wet ink, exactly where you drew them. Seal a page. Frame the space. Leave with a working website.

Getting an idea out of your head is a trade today. Pen and paper is fast, but the ink is dead: not structured, not editable, not a product. Figma is structured, but menus and precision dragging interrupt thinking. Text-to-image generators produce a pretty picture detached from what you drew — uneditable, unusable. Everyone who builds things lives in that trade: engineers sketching systems, students sketching diagrams, designers wireframing pages, founders whiteboarding products. They all think faster than they can draw. baio ends the trade. The sketch *is* the spec.

You draw on digital paper. Every enclosed shape becomes a crisp shape, filled with the color you shaded it. Function is opt-in: a single letter alone in a box adds behavior (`b` button, `n` navbar, `f` form, `i` image, `v` video, `p` a new page). Plain shapes stay plain — no surprise components. Words become labels. Colors become fills. Theme words become gradients. A dark rectangle with scattered dots becomes a procedural night sky. Sketch the skeleton of a diagram and it becomes a crisp composite: bar, pie, Venn, timeline, atomic structure, or the full 118-element periodic table. Pages sit on an infinite plane. Overlaps spawn layers. Photos drop into any drawn enclosure — even a freeform silhouette. Arrows between objects become logic wires.

When a page is done, **Seal** sends the wireframe to Claude and returns a complete, responsive, interactive website — a single HTML file, or a Vite + React + TypeScript project. **Frame** stitches every sealed page on the plane into a linked multi-page site. Recognition is per-shape and local: one misread never ruins the page. When the model isn’t confident, it abstains. Your ink stays ink.

Under the hood, no single model sees, decides, places, and renders. Gemini describes the ink (kind, glyph, text, colors) and never places anything. Geometry is computed from the strokes you actually drew. Decisions are made by a **Qwen3.5-2B model we LoRA-fine-tuned on FreeSolo this weekend** — 96.7% op accuracy versus a 75.0% Gemini baseline, abstention F1 0.97, trained for under $0.25. Everything passes fail-closed validators into deterministic renderers. Model output contains **zero coordinates, no markup, no scripts**. A hallucination becomes nothing — never a broken page.

The engine is bigger than websites. A button and a periodic table are the same problem: vocabulary, templates, validators, training data. Next is flowcharts, circuits, chemistry, org charts; tablet and whiteboard surfaces; a data flywheel already logging every accept and reject as a gold label.

Start the drawing. baio finishes the thought.

---

## Runtime map

| Time | Beat | What the viewer should feel |
|---|---|---|
| 0:00–0:08 | Title | This is a drawing tool with a thesis |
| 0:08–0:48 | Problem | Ideas fade faster than pens move |
| 0:48–1:18 | Solution | Autocomplete, for a canvas |
| 1:18–2:35 | Core demo | Ten strokes → a real page |
| 2:35–3:35 | Impressive | Night sky, periodic table, photo, plane |
| 3:35–4:20 | Technical | We trained the brain; it can’t break the page |
| 4:20–5:00 | Value + close | Sketch → working site. This scales. |

Trigger **Seal at ~3:25**. The veil buys the technical section. **Frame at ~4:25** as the closer. If Gemini rate-limits, keep the ink on screen, talk layers or photos for twenty seconds, press Enter again. Forced-component mode is the safety net: pick the op, then draw — geometry still comes from the stroke.

---

## The script

On-screen text in **small caps**. Voiceover is what you say. Do not rush the blooms.

### 0:00–0:08 · Title

**Visual.** Black. One line fades in, then the name.

**On screen.**
`OUR ESSAYS HAVE AUTOCOMPLETE.`
`SHOULDN’T OUR IMAGINATION?`
then: `baio` · `autocomplete for drawing`

**VO.** *(silence, or a single breath)*

---

### 0:08–0:48 · The problem · 40s

**Visual.** Cut to a real notebook or a blank studio canvas. Slow pan. No UI chrome yet if you can hide it.

**VO.**

In your head, a world appears — a page, a product, a diagram — picturesque, whole. And every second, it fades.

We race to pin that thought to paper because drawing is the least restrictive way to think: no menus, no syntax, no blank-page paralysis. But the pen is slow. By the time the hand catches up, the palace in your mind is a fragment of what it was.

So we make a trade. Sketch fast, and the ink is dead — not structured, not editable, not a website. Open Figma, and thinking stops for menus and precision dragging. Ask an image model, and you get a picture of an interface, not an interface. Fast or faithful. Never both.

---

### 0:48–1:18 · The solution · 30s

**Visual.** Smash cut to `/studio`, full-bleed paper. Cursor rests. Hold `d` so ink is obviously a pen, not a click.

**On screen.** `baio` · `the sketch is the spec`

**VO.**

For text, we stopped accepting that trade years ago. Our essays have autocomplete. Our code has autocomplete.

Shouldn’t our imagination?

This is baio — digital paper with magic in it. You sketch. It sees where you’re going. The finished version blooms in like wet ink, exactly where you drew it, and dries into something real: editable structure, then a working website.

Watch.

---

### 1:18–2:35 · Core features · 77s

This is the product. Ten strokes. Do not narrate every key.

**Beat 1 — navbar · ~12s**

**Visual.** Wide box across the top. Letter `n` inside. Clean, unhurried.

**VO.**

A box across the top. The letter *n*. That’s a navbar — one letter, because function is opt-in. A plain box stays a box. No surprises.

**Beat 2 — button · ~12s**

**Visual.** Smaller box. `b` inside. Word `Login` beside or inside it.

**VO.**

A box, a *b*, the word Login. The letter adds behavior. The word becomes the label.

**Beat 3 — shape + color · ~10s**

**Visual.** A circle, shaded purple. Or a rect shaded two colors for a gradient if the circle feels slow.

**VO.**

A circle, shaded purple. Color is fill. The silhouette is yours — we crisp it, we don’t replace it.

**Beat 4 — the bloom · ~20s**

**Visual.** Press **Enter**. Wait. Watercolor ghosts. Press **Enter** again (or tap Crispy). Ink shakes off. Navbar snaps full-width. Login is a real button. Purple circle is a vector.

**Pause. Let it play. Do not talk over the first second of the bloom.**

**VO.** *(after the wash lands)*

That’s autocomplete. Suggestions bloom in like watercolor — soft, ignorable. Accept, and they dry into real components, exactly where the ink was. The model never places anything. Geometry comes from my strokes.

**Beat 5 — the language, fast · ~23s**

**Visual.** One more box: `b` + `Get started` + the word `rainbow` (or shade a sunset gradient). Enter. Bloom.

**VO.**

That’s the whole vocabulary. Shapes get crisp. One letter adds function — *b* button, *n* navbar, *f* form, *i* image, *v* video, *p* a new page. Words and colors add style. Theme words like rainbow become gradients. You stay in the drawing. You never left to pick a template.

---

### 2:35–3:35 · Impressive · 60s

These are the clips judges rewind.

**Beat 6 — night sky · ~18s**

**Visual.** Dark-shaded rectangle across a hero. Scatter dots. Enter. Procedural starfield.

**VO.**

A dark rectangle. A few dots. That’s not a sticker. That’s a seeded night sky — a starfield the renderer draws the same way every time, and you can still edit.

**Beat 7 — periodic table · ~22s**

**Visual.** Sketch a wide grid / labeled “periodic” skeleton (whatever the pack actually keys off — rehearse this once). Enter. 118 elements land as one composite.

**Backup if the table is fussy:** axes + three bars → crisp bar chart, then say the line below anyway.

**VO.**

Sketch the skeleton of a diagram and the cluster becomes one thing. Bar charts. Pie. Venn. Timelines. Atomic structure. Up to the full periodic table — a hundred and eighteen elements from a scribble. Same engine as the Login button.

**Beat 8 — photo + plane · ~20s**

**Visual.** Draw a freeform blob or a frame. Drop a photo in; it crops to the silhouette. Then zoom out: pages on the infinite plane. Optional: box + `p` to spawn a second page. Draw an arrow between them.

**VO.**

Drop a photo into anything you drew — even a doodle — and it crops to your silhouette. Pages live on an infinite plane. Overlaps become layers. An arrow between two things becomes a wire: click to go, submit to write. The canvas is not a mock. It’s the site, still being born.

---

### 3:35–4:20 · Technical, short · 45s

**Visual.** Hit **Seal** on the finished page as this section starts. Hold on the veil / rotating quotes. Do **not** cut away to slides. If you must show architecture, one line of on-screen text, not a diagram dump.

**On screen, one at a time:**
`GEMINI SEES. IT NEVER PLACES.`
`A 2B MODEL WE TRAINED DECIDES.`
`GEOMETRY COMES FROM YOUR INK.`
`IF IT’S UNSURE, NOTHING HAPPENS.`

**VO.**

Two models. Strict jobs.

Gemini is the eyes. It looks at the ink and *describes*: that’s a box, that letter is a *b*, that word says Login, that shading is purple. It never decides what to build. It never places it.

The brain is a two-billion-parameter model *we* fine-tuned this weekend on FreeSolo — Qwen 3.5, trained on synthetic sketches we generated, for under twenty-five cents. It outputs a command. Zero coordinates. Code does the geometry. Validators fail closed. Renderers are templates, so the model can’t draw an ugly button — only pick the wrong one, which we catch.

On a held-out test: **96.7%** versus Gemini’s **75%**. When it’s unsure, it stays quiet. Abstention F1 **0.97**. A hallucination becomes nothing. Never a broken page.

---

### 4:20–5:00 · Value, then the site · 40s

**Visual.** Seal result lands: working HTML. Click Login or the nav. Zoom out. **Frame** the plane. Multi-page site. Download affordance if it’s visible. End on the live page, then cut to black.

**On screen (last two seconds).**
`START THE DRAWING.`
`BAIO FINISHES THE THOUGHT.`

**VO.**

When the page is done, Seal freezes it into a real website — responsive, interactive, yours to download as HTML or a React project. Frame the plane, and every sealed page becomes one linked product.

That’s the scope. Not a picture of a website. A website. The people who need this already sketch: founders, designers, engineers, students. Today it’s wireframes. The engine doesn’t care — a button and a periodic table are the same problem. Flowcharts, circuits, chemistry, whiteboards, a tablet SDK. Every accept in the app is already a training label. The product teaches itself.

Paper is fast but dead. Design tools are structured but slow. baio is both: paper with magic in it.

Start the drawing. baio finishes the thought.

---

## Shot checklist (record in this order)

Do one clean take of the canvas if you can. Cut titles in post.

1. Title cards (0:08)
2. Blank studio, pen visible
3. `n` navbar → `b` Login → purple circle → **Enter, bloom, accept**
4. Rainbow / gradient button → bloom
5. Night sky → bloom
6. Periodic table (or bar chart backup) → bloom
7. Photo dropped into a drawn silhouette
8. Zoom to plane; optional `p` page + arrow wire
9. Seal (start early; keep recording through the wait)
10. Click the generated site
11. Frame the space → click between pages
12. End card

**B-roll if a take breaks:** forced-component mode, keep-as-drawn chip, element dock, glyph book (📖), layers rail. Use only as coverage, not as the story.

---

## Captions to burn in (optional, sparse)

Use three, max. The bloom should not compete with type.

| Time | Caption |
|---|---|
| 1:18 | Hold D to draw · Enter to autocomplete |
| 2:00 | Accept → ink dries into structure |
| 4:40 | Seal a page · Frame the space · download a site |

---

## What this video must prove (judges)

1. **New interaction** — autocomplete for drawing, not a prompt box, not a template picker.
2. **We trained the model** — 2B FreeSolo fine-tune beats Gemini on the task, under $0.25.
3. **It can’t break** — zero coordinates from the model; fail closed; ink stays ink.
4. **It’s finished** — sketch becomes a downloadable website, not a mock.

If you only have four minutes in the edit, cut Beat 5 (rainbow) and the photo, keep problem → bloom → night sky → table → Seal/Frame → close.
