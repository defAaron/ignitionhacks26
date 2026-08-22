# baio — Vision

## One-liner

> baio predicts your next diagram stroke. It completes the figments of your imagination.

baio (毛笔 — "brush pen") is an intelligent autocomplete layer for drawing. You start sketching — a website layout, a diagram, a flowchart — and baio recognizes where you're going and paints the rest in for you.

**The first product is a website maker:** draw a rough page with a pen — a box for a navbar, three rectangles for cards, a scribble in a rounded box for a button — and baio substitutes real structured components at exactly the positions you drew them. Drawing becomes the fastest wireframing tool there is.

## Who it's for

baio is for anyone who thinks faster than they can draw. Drawing is the least restrictive way to get an idea out of your head — no syntax, no menus, no blank-text-box paralysis — but finishing a drawing is slow. baio keeps the freedom of sketching and removes the tedium of completing it.

- **Website & product designers** — rough interface sketches that become structured layouts.
- **Engineers** — system diagrams, circuits, flowcharts, free-body diagrams in digital notebooks.
- **Students** — academic diagrams on tablets: chemistry, biology, physics, math, CS.
- **Anyone whiteboarding** — getting ideas down on paper faster than the pen normally allows.

## The end product

A drawing canvas (tablet, whiteboard, or browser) where:

1. **You draw naturally.** No menus, no template browsers, no text prompts. Just start sketching.
2. **baio watches and understands.** When you've drawn enough for the structure to be recognizable, baio infers the intended diagram.
3. **The completion blooms in like watercolor.** The proposed completion doesn't just appear — it washes onto the canvas like wet ink spreading from a brush: soft, translucent, unmistakably a suggestion rather than a finished mark. The reveal is the signature of the product, true to the baio name.
4. **You stay in control.** Accept it and the watercolor dries into crisp editable structure; reject it, or just keep drawing, and it fades away.
5. **The result is real structure, not a picture.** Accepted completions land as individual editable vector elements — you can move one periodic-table cell, relabel one flowchart node, adjust one axis. Never a flattened image.

## What it feels like

```text
User starts drawing
        ↓
baio recognizes the likely structure
        ↓
A watercolor completion blooms onto the canvas
        ↓
User accepts (it dries into structure), rejects, or keeps drawing
```

The interaction should feel like autocomplete in a code editor: instant, ignorable, and never in the way. baio should feel like a drawing partner who knows when to help and — just as importantly — when to wait.

## What baio is not

- **Not an image generator.** It never produces raster output or improvised visuals.
- **Not a template picker.** The user never browses or searches; recognition comes from the drawing itself.
- **Not a chatbot.** No prompting, no describing. The canvas is the interface.

## Why it wins

- **Speed** — repetitive structure (grids, axes, connectors, labels) is generated, not hand-drawn.
- **Continuity** — the user never leaves the act of drawing.
- **Correctness** — components and diagrams come from validated templates, so a button is always a real button and the periodic table is always *the* periodic table.
- **Editability** — everything generated remains native vector objects.
- **Personalization** — over time, baio learns how much you want completed, in what style, and when to stay quiet.

## The first product: sketch-to-interface

**Draw a website with a pen, get a real interface back.**

Sketch a rough page — a box for a navbar, a squiggle for a hero image, three rectangles for cards, a scribble in a rounded box for a button — and baio substitutes real structured components at exactly the positions you drew them. Everything renders on the same canvas as your strokes, so what you sketch is what snaps in.

Recognition is per-shape and local, so it fails gracefully: one misread shape never ruins the page, and every few strokes another component blooms in — many small moments of magic instead of one risky big one.

Output targets grow over time:

- **SVG components** (MVP) — wireframe elements rendered right on the drawing canvas.
- **HTML/CSS export** — the sketch becomes a working structured layout.
- **Figma connectors** — sketches auto-substitute into Figma components on a live canvas.

Drawing becomes the fastest wireframing tool there is: less restrictive than Figma, faster than code, and the sketch itself is the spec.

## The expansion: structured diagrams

The same engine — recognize partial drawings, complete them from validated templates — extends beyond interfaces to any structured diagram: periodic tables, coordinate planes, flowcharts, circuits, molecular structures, org charts. Each new domain is just a new template library and recognition vocabulary on top of the same pipeline.

## North star

> Start the diagram. baio understands where you're going and helps you finish it.
