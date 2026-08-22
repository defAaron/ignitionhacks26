# baio — The 3-Minute Pitch

> **baio** (毛笔, "brush pen") — autocomplete for drawing.
>
> High-impact, concise, every sentence earns its place. The README is this same pitch with the details filled in.

---

## The script

### 1 · The problem (25s)

> In the figments of your imagination, a world appears — picturesque scenes that flow like a river. And every second, it fades.
>
> Artists, engineers, thinkers — we all race to pin that flowing thought to paper. Drawing is the least restrictive way to capture an idea: no syntax, no menus, no blank-page paralysis. But drawing is *slow*. By the time the hand catches up, the palace in your mind is a fragment of what it was.
>
> Fast but fading, or faithful but slow. Every thinker makes that trade.

### 2 · The solution (15s)

> For text, we stopped accepting that trade years ago. Our essays have autocomplete. Our code has autocomplete.
>
> **Shouldn't our imagination?**
>
> baio is autocomplete for drawing — digital paper with magic in it. You sketch; it sees where you're going; the finished version blooms in like wet ink and dries into something real.

### 3 · Who it's for (10s)

> Engineers sketching systems. Students sketching diagrams. Artists, designers, founders — anyone who thinks faster than they draw, and wants to bring an idea to life as naturally as putting pen to paper.

### 4 · Demo (75s) — the beats

1. **Blank paper.** "Watch me sketch a landing page in ten strokes."
2. **Wide box across the top, letter `n` inside. A box with `b` and the word "Login". A circle, shaded purple.** Press **Enter**.
3. **The bloom.** Watercolor washes over each shape; the ink shakes away — a real navbar, a working Login button, a crisp purple circle. *"Everything landed exactly where I drew it. The model never places anything — geometry comes from my ink."*
4. **Details.** `b` + "rainbow" → a rainbow-gradient button. *"Plain shapes stay shapes. One letter adds function. Words and colors add style. No surprises."*
5. **A flourish.** Dark-shaded box, scattered dots → a night sky with a procedural starfield.
6. **A diagram.** Axes and a few bars → a crisp bar chart. *"Same engine — six diagram types, up to the full 118-element periodic table."*
7. **The finale — Frame.** *"When the page is done, one press hands the wireframe to Claude…"* → a complete, responsive, interactive website. Click the working nav. Download the HTML. *"The sketch was the spec."*

### 5 · Features, fast (15s)

> That demo skimmed the surface. Underneath: automatic layers when elements overlap, an endless scrolling page, photos dropped straight into drawn frames — even hand-drawn ones, cropped to your silhouette — six diagram types, and a one-file website export. All editable, all vector, all yours.

### 6 · How it works — the architecture (30s)

> Two models, strict separation of powers.
>
> **Gemini is the eyes.** It looks at the ink and *describes*: this is a box, that letter is a `b`, that word says "Login", that shading is purple. It never decides, and it never places.
>
> **FreeSolo is the brain.** A 2-billion-parameter model **we fine-tuned ourselves this weekend** on synthetic sketches we generated. It turns each description into a structured draw-command — with **zero coordinates**. Geometry comes only from your strokes; validators fail closed; renderers are deterministic templates. A hallucination becomes *nothing* — never a broken page.
>
> The numbers: on an untouched test split, our 2B model beats the Gemini baseline **96.7% to 75%** on op accuracy, **+33 points** on routing details like labels and fills — and when it's unsure, it stays quiet: abstention F1 **0.97 vs 0.67**. Total training cost: **under 25 cents**.

### 7 · Close (10s)

> Paper is fast but dead. Design tools are structured but slow. baio is both: paper with magic in it.
>
> **Start the drawing. baio finishes the thought.**

---

## Demo safety net

- **Forced-component mode**: pick the component before drawing — recognition is skipped, geometry still snaps. Use if the room's ink is misbehaving.
- **Rate limit** (Gemini free tier ~15 req/min): if the pill appears, your ink is kept — narrate layers or picture frames for 20 seconds, press Enter again.
- **Frame takes ~45–60s**: trigger it, then deliver the architecture section *while the veil rotates art quotes*. The reveal lands as your closing line.
- Rehearse the ten strokes. The demo is the pitch.

## Judge Q&A ammo

**"Isn't this just API glue?"**
The opposite. The core decision-maker is our own fine-tuned 2B model, and it measurably beats the frontier API baseline on our task. Gemini only *describes* — kind, glyph, text, colors. It never decides and never places. Placement is pure code from stroke geometry.

**"Why two models instead of one big vision call?"**
Separation of powers. Vision describes, our trained builder decides, code places, validators gate. Each layer fails independently, so the page never breaks. It also made the builder trainable: text-in/text-out means cheap synthetic data, and a 2B model is enough to dominate the task.

**"How is this different from text-to-image / v0 / screenshot-to-code?"**
Those generate pictures or code detached from your input. baio's output is editable vector structure at exactly the positions you drew — per-shape, local, incremental. One misread shape never ruins the page, and you never leave the act of drawing.

**"What did you actually train?"**
Qwen3.5-2B, LoRA SFT on FreeSolo: 640 synthetic scenes × 4 epochs, ~10 runs across the weekend, <$0.25 total. The dataset comes from our own pipeline (`lib/datagen`), with corruption passes that mimic hand-drawn jitter. Full ledger in `freesolo/eval-results.md`. Early waves overfit — 48–72% hallucination — and our independent 165-case test bank caught it; data engineering fixed it. That debugging arc is real post-training work.

**"Where does this go?" (venture question)**
Wireframing today; the engine is domain-agnostic. Flowcharts, circuits, chemistry, org charts are each just a new template pack and vocabulary. Then tablet/whiteboard SDK and design-tool export. Every accept, reject, and relabel is a gold training label — the product generates its own data flywheel.

**"What breaks it?"**
Real messy handwriting is the honest risk — vision was tuned mostly on synthetic ink. Mitigations: abstention (below threshold, ink stays ink), keep-as-drawn, forced-component mode. The failure mode is "nothing happens" — never "wrong thing happens."

---

## What to lean on (Ignition Hacks 2026)

The published theme is **Arts & Technology**. Lead with the bloom; use the model only as the punchline.

| Beat | Lead with |
|---|---|
| **Theme** | Drawing is the art; a trained 2B model + a downloadable website is the technology. Watercolor in, working HTML out. |
| **Demo** | Blank paper → ten strokes → bloom → Frame. Non-technical judges should feel it without a slide. |
| **Technical depth** | We trained the builder (Qwen3.5-2B on FreeSolo), eval-caught a 48–72% hallucination wave, then beat Gemini 96.7% vs 75.0% op accuracy for under $0.25. |
| **Sponsor challenges** | Only if organizers publish them. Base44 is the Blaze sponsor — don't fake a Base44 build. See `docs/hackathon/sponsors.md`. |
