# baio frontend kit

Handoff notes for wiring a real backend to this frontend. The live app has moved
on: `/` is the two-ink landing, `/studio` is the canvas, and
`/api/autocomplete` is a real Gemini → FreeSolo → validator pipeline. This
file still documents the original frontend kit (ink, tools, the recognition
seam). Visual source of truth: [`product/DESIGN.md`](../product/DESIGN.md)
and [`product/app/tokens.css`](../product/app/tokens.css).

**One sentence:** you scribble a UI element on a page, a recognizer guesses
what it is, you confirm, and it becomes real absolutely-positioned HTML.

**The important fact (original kit):** exactly one thing was mocked, and it
lived in one file. The shipped product replaced that mock. See [The one seam](#the-one-seam).

---

## Run it

```bash
npm install
npm run dev        # localhost:3000
npm run build      # production build, also typechecks
npx tsc --noEmit   # typecheck alone
```

Next.js 15 (app router), React 19, TypeScript. Landing + studio + API routes
live under `product/`. Copy `product/.env.example` for Gemini / FreeSolo / Frame.

---

## The flow

```
  draw / type          ENTER              ENTER
  ───────────►  sketch ─────► thinking ─────► preview ─────► committed
                  ▲                             │                │
                  └───────── ESC ───────────────┘                │
                                                                 ▼
                                                      real HTML on the page
```

| phase | what is on screen |
|---|---|
| `sketch` | ink on canvas, typed text boxes, nothing committed |
| `thinking` | `recognize()` is in flight, dots bar under the sketch |
| `preview` | ghost element + confirm bar with the guess and 2 alternates |
| (committed) | back to `sketch`, ink shakes away, element is on the page |

Keys: `Enter` guess then confirm, `Esc` deselect then shake off, `Ctrl+Z` undo
stroke, `1`/`2`/`3` pen/text/move, `H` hide all controls, `Delete` remove
selected element.

Three tools: **pen** draws, **text** places a label, **move** drags/resizes/
deletes committed elements. In move mode committed controls are inert on
purpose, so dragging a button repositions it instead of pressing it. In hide
mode (`H`) they become genuinely interactive: checkboxes check, toggles flip.

---

## File map

```
app/
  page.tsx            two-ink landing (the pitch)
  landing.css         landing layout
  tokens.css          aubergine + celadon design tokens
  layout.tsx          Bricolage Grotesque + Hanken Grotesk, metadata
  globals.css         wordmark misregistration + resets
  icon.svg            cat-head mark on a celadon tile
  studio/             the drawing canvas
  gallery/            shapes gallery
  labeler/            labeling tool
  api/                autocomplete, frame, vision

components/
  Studio.tsx          orchestrator. all state lives here
  SketchLayer.tsx     canvas: pointer input, perfect-freehand rendering
  Logo.tsx            cat mark + "baio" wordmark, single source
  GlyphBook.tsx       in-app how-to (keep in sync with docs/features)
  ...

See product/DESIGN.md for the two-ink risograph system.
```

---

## The one seam

`lib/recognize.ts` is the only mocked thing in the project.

```ts
export async function recognize(sketch: Sketch, rect: Rect): Promise<Guess>
```

It has **one call site**, `Studio.tsx` in `runGuess()`:

```ts
setPhase('thinking')
const result = await recognize(cur.sketch, cur.bounds)
setGuess(result)
setKind(result.kind)
setPhase('preview')
```

Replace the body of `recognize()` and you are done. Nothing else in the app
knows or cares where the answer came from.

The current implementation is a crude heuristic over bounding-box aspect,
size, stroke count, and whether text was typed. It is deliberately not
defensible. It exists so the mock reacts to what you actually drew.

Two other exports in that file are **not** mock and should stay:

- `normalizeRect(kind, rect)` is client-side sizing policy. It enforces
  minimum sizes and fixes proportions for checkbox/toggle/avatar. Keep it.
- `KIND_LABEL` is display strings for the UI.

---

## Contracts

From `lib/types.ts`. These are what your backend has to speak.

**Input.** `Sketch` is the raw drawing, `Rect` is its bounding box in CSS px
(document coordinates, already computed for you by `sketchBounds()`).

```ts
interface InkPoint { x: number; y: number; pressure: number }  // pressure 0..1
interface Stroke   { id: string; points: InkPoint[]; color: string }
interface TextItem { id: string; x: number; y: number; text: string; color: string }
interface Sketch   { strokes: Stroke[]; texts: TextItem[] }
interface Rect     { x: number; y: number; w: number; h: number }
```

**Output.** This is the only shape the UI accepts back.

```ts
type ElementKind =
  | 'button' | 'input' | 'heading' | 'paragraph' | 'card'
  | 'checkbox' | 'toggle' | 'divider' | 'image' | 'avatar'

interface Guess {
  kind: ElementKind          // what the UI renders
  confidence: number         // 0..1, shown as a percentage in the confirm bar
  alternates: ElementKind[]  // up to 3, shown as one-click corrections
}
```

`alternates` matters more than it looks. The guess will be wrong sometimes and
those chips are the escape hatch, so return real runners-up rather than an
empty array.

Adding a new kind means touching three places: the `ElementKind` union, a
`case` in `RenderedElement.tsx`, and an entry in `KIND_LABEL`. Optionally a
minimum size in `normalizeRect`.

---

## Hooking up a backend

### 1. Add a route

```ts
// app/api/recognize/route.ts
import { NextResponse } from 'next/server'
import type { Guess } from '@/lib/types'

export async function POST(req: Request) {
  const { sketch, rect } = await req.json()
  // ... call your model ...
  const guess: Guess = { kind: 'button', confidence: 0.9, alternates: ['input', 'card'] }
  return NextResponse.json(guess)
}
```

### 2. Point `recognize()` at it

```ts
export async function recognize(sketch: Sketch, rect: Rect): Promise<Guess> {
  const res = await fetch('/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sketch, rect })
  })
  if (!res.ok) throw new Error(`recognize failed: ${res.status}`)
  return res.json()
}
```

### 3. Handle failure, because the current code does not

This is the one real gap. `runGuess()` has **no try/catch**, so a rejected
promise leaves the app stuck in `thinking` forever with no way out but reload.
A local mock never fails; a network call will. Patch `Studio.tsx`:

```ts
setPhase('thinking')
try {
  const result = await recognize(cur.sketch, cur.bounds)
  setGuess(result)
  setKind(result.kind)
  setPhase('preview')
} catch {
  setPhase('sketch')   // ink is preserved, user can retry with Enter
}
```

A silent recovery is survivable but confusing. There is no error UI in the
project at all right now, so if you want a visible message you are building it
from scratch. The `.thinking` bar in `globals.css` is the closest thing to
copy.

### 4. Validate what comes back

`kind` is used directly as a lookup. An unknown string renders nothing and
throws no error, which is a miserable thing to debug. Guard it:

```ts
const KINDS: ElementKind[] = ['button','input','heading','paragraph','card',
                              'checkbox','toggle','divider','image','avatar']
if (!KINDS.includes(guess.kind)) guess.kind = 'card'
```

---

## If your model needs an image

Most vision models will want a raster, not JSON polylines. **There is no
rasterizer in the codebase.** Here is one that works with the existing types,
ready to paste into `lib/ink.ts`:

```ts
const PAD = 24
const EXPORT_SCALE = 3

/** Sketch -> cropped PNG data URL, black ink on opaque white. */
export async function sketchToPng(sketch: Sketch, rect: Rect): Promise<string> {
  const w = Math.ceil(rect.w + PAD * 2)
  const h = Math.ceil(rect.h + PAD * 2)
  const canvas = document.createElement('canvas')
  canvas.width = w * EXPORT_SCALE
  canvas.height = h * EXPORT_SCALE
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE)
  ctx.translate(-rect.x + PAD, -rect.y + PAD)

  ctx.fillStyle = '#000000'
  for (const s of sketch.strokes) {
    ctx.fill(outlineToPath(strokeOutline(s.points, true)))
  }
  ctx.fillStyle = '#000000'
  ctx.font = '600 17px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  for (const t of sketch.texts) ctx.fillText(t.text, t.x, t.y)

  return canvas.toDataURL('image/png')
}
```

Three deliberate choices in there, all of which matter for model accuracy:

- **Black on opaque white**, not the user's ink colour on transparency. Alpha
  commonly flattens to black, which gives you black-on-black. Accent colours
  are a UI affordance, not payload.
- **Fixed `EXPORT_SCALE`**, not `devicePixelRatio`. Otherwise the same sketch
  produces different resolutions on different monitors and your model sees
  inconsistent input.
- **Padding**, because a tight crop starves the model of context.

Send `sketchToPng()` output alongside (or instead of) the raw `sketch`.

---

## Already real, do not rebuild

Worth knowing so you do not waste effort:

- Ink rendering, pressure, coalesced pointer events, DPR handling
- Bounding box over strokes **and** text (`sketchBounds`)
- Text extraction for labels (`sketchText`) which becomes `element.text`
- Element rendering for all 10 kinds, including working checkboxes/toggles
- Drag, resize, delete, image upload, drag-and-drop of image files
- Growing canvas (`+ space`), hide-all-controls presentation mode
- All animation (framer-motion, one shared spring in `lib/motion.ts`)

---

## Known gaps

Ranked by how likely they are to bite you.

1. **No error handling around `recognize()`.** See step 3 above. This is the
   one thing you must fix when moving off the mock.
2. **No persistence.** `elements` is React state. Reload loses the page.
   If you add a backend, saving the `CommittedElement[]` array is the obvious
   next step. It is plain JSON except for `src`, which holds an image as a
   base64 data URL and will be large.
3. **No auth, no multiplayer, no undo for committed elements.** Undo only
   covers sketch strokes.
4. **Checkbox/toggle state is view state**, held in the component, not in the
   element model. It survives dragging but resets on unmount and is not saved.
5. **Canvas height is capped** near 16k px because the backing store is
   height x devicePixelRatio and browsers refuse to allocate past that.
6. **Image upload rejections are unhandled.** `handleFile()` is called as
   `void handleFile(...)` and `readImage()` can reject on an unreadable file.
   Same fix as above: wrap it.

---

## Screenshots

Drop images in this folder. Suggested names, referenced below so they render
once present:

![Sketching](./01-sketch.png)
![Guess and confirm](./02-confirm.png)
![Committed page](./03-committed.png)
![View mode](./04-view-mode.png)

---

## Quick orientation for an agent

If you are an AI picking this up cold, read in this order:

1. `lib/types.ts` (30 lines, every contract)
2. `lib/recognize.ts` (the mock you are replacing)
3. `Studio.tsx` `runGuess()` and `confirm()` (the only two functions that matter)
4. `RenderedElement.tsx` (only if adding a new element kind)

You almost certainly do not need to read `SketchLayer.tsx`, `EditableElement.tsx`,
or `globals.css` to swap in a backend.
