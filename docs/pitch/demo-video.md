# baio — 5-Minute Demo Video

Record this. Paste the **written description** into HackHub with the video. Total runtime: **5:00**. Spoken pace: calm, ~145 words per minute, with real pauses on every bloom.

**Tags to land (say them, show them, leave with them):**
- **Magic paper**
- **Autocomplete your ideas**

**baio** (毛笔) means “brush pen.” Keep the lore to one line on screen. The story stays in plain English.

---

## Written description (paste with the video)

**baio is magic paper — autocomplete for your ideas.** Sketch a page with a pen — a box for a navbar, a letter *b* for a button — and real, editable components bloom in like wet ink, exactly where you drew them. Seal a page. Frame the space. Leave with a working website.

In the figments of your imagination, picturesque scenes run wild — they flow like a river. And those threads of ideas slowly fade. The artists, the engineers, the thinkers rush to engrave that flowing thought on paper. But paper is slow. The grind of the hand eats the idea, and what you keep is a fragment of a once-mighty palace.

A picture is worth a thousand words. So why type those thousand words to describe the picture already in your head? Why not just put the picture down?

Why restrict ourselves? Our essays have autocomplete. Shouldn’t our thoughts too?

That is the trade today. Pen and paper is fast, but the ink is dead: not structured, not editable, not a product. Figma is structured, but menus and precision dragging interrupt thinking, and it takes so much time to learn and get good at. Text-to-image generators make you *describe* the picture — then hand you a pretty image detached from what you meant, uneditable, unusable. Everyone who builds things lives in that trade: engineers sketching systems, students sketching diagrams, designers wireframing pages, founders whiteboarding products. baio was made for all of them.

You draw on magic paper. Every enclosed shape becomes a crisp shape, filled with the color you shaded it. Function is opt-in: a single letter alone in a box adds behavior (`b` button, `n` navbar, `f` form, `i` image, `v` video, `p` a new page). Plain shapes stay plain — no surprise components. Words become labels. Colors become fills. Theme words become gradients. A dark rectangle with scattered dots becomes a procedural night sky. Sketch the skeleton of a diagram and it becomes a crisp composite: bar, pie, Venn, timeline, atomic structure, or the full 118-element periodic table. Pages sit on an infinite plane. Overlaps spawn layers. Photos drop into any drawn enclosure — even a freeform silhouette. Arrows between objects become logic wires.

When a page is done, **Seal** sends the wireframe to Claude and returns a complete, responsive, interactive website — a single HTML file, or a Vite + React + TypeScript project. **Frame** stitches every sealed page on the plane into a linked multi-page site. Recognition is per-shape and local: one misread never ruins the page. When the model isn’t confident, it abstains. Your ink stays ink.

Under the hood, no single model sees, decides, places, and renders. Gemini describes the ink (kind, glyph, text, colors) and never places anything. Geometry is computed from the strokes you actually drew. Decisions are made by a **Qwen3.5-2B model we LoRA-fine-tuned on FreeSolo this weekend** — 96.7% op accuracy versus a 75.0% Gemini baseline, abstention F1 0.97, trained for under $0.25. Everything passes fail-closed validators into deterministic renderers. Model output contains **zero coordinates, no markup, no scripts**. A hallucination becomes nothing — never a broken page.

The engine is bigger than websites. A button and a periodic table are the same problem: vocabulary, templates, validators, training data. Next is flowcharts, circuits, chemistry, org charts; tablet and whiteboard surfaces; a data flywheel already logging every accept and reject as a gold label.

Magic paper. Autocomplete your ideas. Start the drawing. baio finishes the thought.

---

## Runtime map

| Time | Beat | What the viewer should feel |
|---|---|---|
| 0:00–0:10 | Title | Magic paper. Autocomplete your ideas. |
| 0:10–0:55 | Problem | The palace fades. A picture is already in your head. |
| 0:55–1:22 | Solution | Why restrict ourselves? Shouldn’t our thoughts autocomplete too? |
| 1:22–2:35 | Core demo | Ten strokes → a real page |
| 2:35–3:35 | Impressive | Night sky, periodic table, photo, plane |
| 3:35–4:20 | Technical | We trained the brain; it can’t break the page |
| 4:20–5:00 | Value + close | Sketch → working site. Leave on the tags. |

Trigger **Seal at ~3:25**. The veil buys the technical section. **Frame at ~4:25** as the closer. If Gemini rate-limits, keep the ink on screen, talk layers or photos for twenty seconds, press Enter again. Forced-component mode is the safety net: pick the op, then draw — geometry still comes from the stroke.

---

## The script

On-screen text in **small caps**. Voiceover is what you say. Do not rush the blooms.

### 0:00–0:10 · Title

**Visual.** Black. Two lines, then the name.

**On screen.**
`MAGIC PAPER`
`AUTOCOMPLETE YOUR IDEAS`
then: `baio`

**VO.** *(silence)*

---

### 0:10–0:55 · The problem · 45s

**Visual.** Cut to a real notebook or a blank studio canvas. Slow pan. No UI chrome yet if you can hide it.

**VO.**

In the figments of your imagination, scenes run wild — picturesque, flowing like a river. And those threads of ideas slowly fade.

The artists, the engineers, the thinkers rush to engrave that flowing thought on paper. But paper is slow. The grind of the hand eats the idea, and what you keep is a fragment of a once-mighty palace.

A picture is worth a thousand words. So why do we sit there typing those thousand words, trying to describe the picture already in our head? Why not just put the picture down?

---

### 0:55–1:22 · The solution · 27s

**Visual.** Smash cut to `/studio`, full-bleed paper. Cursor rests. Hold `d` so ink is obviously a pen, not a click.

**On screen.** `MAGIC PAPER` · `AUTOCOMPLETE YOUR IDEAS`

**VO.**

Why restrict ourselves? Our essays have autocomplete. Shouldn’t our thoughts too?

This is baio. Magic paper. You begin the picture — and the rest blooms in like wet ink, exactly where you drew it, and dries into something real: editable structure, then a working website.

Autocomplete your ideas. Watch.

---

### 1:22–2:35 · Core features · 73s

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

That’s the paper remembering what you meant. Suggestions bloom in like watercolor — soft, ignorable. Accept, and they dry into real components, exactly where the ink was. The model never places anything. Geometry comes from my strokes.

**Beat 5 — the language, fast · ~19s**

**Visual.** One more box: `b` + `Get started` + the word `rainbow` (or shade a sunset gradient). Enter. Bloom.

**VO.**

That’s the whole vocabulary. Shapes get crisp. One letter adds function — *b* button, *n* navbar, *f* form, *i* image, *v* video, *p* a new page. Words and colors add style. You never left the drawing to describe it in a prompt.

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
`MAGIC PAPER.`
`AUTOCOMPLETE YOUR IDEAS.`

**VO.**

When the page is done, Seal freezes it into a real website — responsive, interactive, yours to download as HTML or a React project. Frame the plane, and every sealed page becomes one linked product.

That’s the scope. Not a thousand words about a website. The website. The people who need this already sketch: founders, designers, engineers, students — anyone whose thoughts run faster than their hands. Today it’s wireframes. The engine doesn’t care — a button and a periodic table are the same problem. Flowcharts, circuits, chemistry, whiteboards, a tablet SDK. Every accept in the app is already a training label. The product teaches itself.

We stopped restricting our essays. We shouldn’t restrict our thoughts.

Magic paper. Autocomplete your ideas. Start the drawing. baio finishes the thought.

---

## Shot checklist (record in this order)

Do one clean take of the canvas if you can. Cut titles in post.

1. Title cards (0:10) — *Magic paper / Autocomplete your ideas / baio*
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
12. End card — same two tags

**B-roll if a take breaks:** forced-component mode, keep-as-drawn chip, element dock, glyph book (📖), layers rail. Use only as coverage, not as the story.

---

## Captions to burn in (optional, sparse)

Use three, max. The bloom should not compete with type.

| Time | Caption |
|---|---|
| 1:22 | Hold D to draw · Enter to autocomplete |
| 2:00 | Accept → ink dries into structure |
| 4:40 | Seal a page · Frame the space · download a site |

---

## What this video must prove (judges)

1. **New interaction** — magic paper: autocomplete your ideas, not a prompt box, not a template picker. You put the picture down. You do not describe it.
2. **We trained the model** — 2B FreeSolo fine-tune beats Gemini on the task, under $0.25.
3. **It can’t break** — zero coordinates from the model; fail closed; ink stays ink.
4. **It’s finished** — sketch becomes a downloadable website, not a mock.

If you only have four minutes in the edit, cut Beat 5 (rainbow) and the photo, keep palace → why restrict ourselves → bloom → night sky → table → Seal/Frame → magic paper / autocomplete your ideas.
