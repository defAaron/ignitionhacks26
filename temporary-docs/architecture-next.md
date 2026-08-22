# baio — Next-Level Architecture (draft)

> Status: design draft, meant to be reacted to. Cites modules by **role** because app
> code is being relocated under `product/`; paths (e.g. `lib/interpretation/*`,
> `lib/frame/*`) are current-as-of-writing anchors, not commitments.

## Where we are, where we're going

baio today is a **per-shape snapshot classifier**: press Enter, one screenshot + stroke
manifest goes to Gemini (describe, not decide), a deterministic normalizer derives geometry
and one level of containment, a fine-tuned FreeSolo builder maps each detection to one op
with no coordinates, validators fail closed, templates render. It is excellent at the narrow
thing it does — turning *one cluster of ink* into *one crisp element* — and the whole
architecture is organized around making that one hop safe and trainable.

The two next moves both push past "one cluster → one element." **Goal 1** makes recognition
*relational and incremental* — aware of what's already on the canvas, of how strokes and
shapes relate, and of how a person actually builds a drawing up over time rather than in one
snapshot. **Goal 2** makes the output *a whole site* — multiple pages, a data model, and
behavior — instead of one HTML file from one canvas. The unifying insight of this doc: **both
goals are the same architectural move at two scales.** Goal 1 introduces a *relationship
graph* over the canvas; Goal 2 is what you get when that graph spans pages and carries data
and actions. Build the graph once and Goal 2 is largely a matter of what edges mean.

---

## Goal 1 — Smarter, more intuitive drawing logic

### 1a. What the current design does, and where it breaks

The pipeline (`lib/interpretation/pipeline.ts::runAutocomplete`) is, by construction:

- **Batch, not incremental.** Recognition fires only on Enter, over a full-canvas snapshot.
  Nothing runs as the pen moves. This directly contradicts the product's own north star —
  the README opens with "baio predicts your next stroke" — yet the engine is a snapshot
  *classifier*, never a *predictor*. There is no notion of "you're halfway through closing a
  box."
- **Stateless / context-free.** `runAutocomplete(body)` receives `png_base64 + strokes +
  canvas` and *nothing about the page that already exists*. The legacy `BuilderInput` carried
  a `tree_summary`; the shapes pivot explicitly dropped it (`ShapeBuilderInput` comment: "no
  tree_summary … no tree-awareness in wave 1"). So the builder cannot reason "this new box
  sits inside the navbar I drew a minute ago" or "this is the second button — match the
  first's fill." Every call re-derives the world from zero. That is the *opposite* of how
  people draw: we draw in relation to what's already there.
- **Flat detections, one relationship.** The only inter-shape relationship modeled is
  single-parent containment (`normalize.ts` containment pass, `parent: det_N | null`). There
  are **no siblings, no groups, no connections**. Three evenly spaced boxes are three
  unrelated boxes, not a row/list. An arrow drawn from box A to box B is a decorative
  `arrow` op, not an edge "A connects to B." People draw relationships constantly —
  alignment means grouping, repetition means a list, an arrow means flow — and today all of
  that signal is discarded.
- **Geometric, not semantic, disambiguation.** `computeAlternates` (pipeline.ts) is real and
  nice, but it ranks alternates purely from ink geometry (`kindScores`: rect-vs-ellipse by
  roundness). It cannot say "this circle is an avatar because it's in a card header" vs "a
  pie base" vs "a radio button." The same circle means different things in different
  contexts, and context is exactly what the system throws away.
- **No in-session learning.** Every tap is logged as a gold label and a GRPO config is staged
  — but that's *offline* retraining. Correct "ellipse → button" once and the very next
  identical shape still guesses ellipse. There is no session memory, no per-user handwriting
  profile (this user's boxes are wobbly; their lowercase `l` is a letter, not a line).

Root cause, stated plainly: **the system has no persistent model of the scene.** It has a
per-call detection list and a per-page committed `CommittedElement[]` in the client
(`lib/types.ts`), but no typed graph that recognition can read *as context* and write *as
relationships*.

### 1b. The redesign — a persistent Scene Graph with incremental, relational recognition

Build it up problem-first.

**Start:** today's batch classifier. Works great for one shape.
**Problem:** draw a second shape near the first and the engine has amnesia — no "align these,"
no "same kind as before."
**Move 1 — a persistent Scene Graph.** Introduce a typed graph that accumulates across Enter
presses and is passed *back into* every recognition call as context. Nodes are committed and
pending elements; edges are relationships. This resurrects the dropped `tree_summary`, but as
a structured graph rather than a flat list, and — critically — it flows *into* the builder,
closing the context loop.

```ts
interface SceneGraph {
  revision: number
  nodes: SceneNode[]
  edges: SceneEdge[]
}
interface SceneNode {
  id: string
  op: ElementKind            // committed op, or 'pending' while ghosting
  bbox: BBox
  params?: Record<string, unknown>
  source_stroke_ids: string[]
  status: 'committed' | 'pending' | 'ghost'
}
interface SceneEdge {
  type: 'contains' | 'row' | 'column' | 'grid' | 'connects' | 'labels' | 'aligns'
  from: string
  to: string | string[]      // group edges (row/grid) point at a set
  evidence: 'geometry' | 'arrow' | 'model'
}
```

The server stays **stateless** (important — the route is deployable and horizontally
scalable). The *client owns* the SceneGraph (it already owns `CommittedElement[]`) and sends
a compact summary with each autocomplete request. New builder input, superseding
`ShapeBuilderInput`:

```ts
interface ScenedBuilderInput {
  artboard: Artboard
  scene: SceneNodeSummary[]        // committed context: id, op, bbox, key params
  scene_edges: SceneEdge[]         // relationships already known
  detections: ShapeBuilderDetection[]  // the DELTA — new ink only
}
```

Now the builder can emit context-aware commands: `{op:'button', from:'det_1',
match_style:'node_7'}` ("second button, copy the first's fill") or reference an existing
parent that isn't in this delta.

**Problem:** the graph needs relationships geometry-alone can't express — row vs list vs flow.
**Move 2 — a relationship-inference pass**, sitting right after the normalizer's containment
pass and mostly *deterministic geometry* (cheap, no model). It emits `SceneEdge`s:
- **alignment** — shared left/center/right edges or baselines → `aligns`.
- **distribution** — ≥3 same-kind nodes at even spacing → `row`/`column`/`grid`. This is the
  primitive that later becomes "list bound to data" (Goal 2).
- **connection** — an `arrow`/`line` whose endpoints snap to two node bboxes becomes a
  typed `connects(a→b)` edge instead of a decorative mark. This is the primitive that later
  becomes navigation and data-binding (Goal 2).
- **labeling** — a `text` node adjacent to / inside a control → `labels`.

The containment logic already in `normalize.ts` is the template: measurable geometry, decided
in code, never by a model. Relationship inference extends the same philosophy from
"inside-of" to "beside / repeated / points-at."

**Problem:** it's still batch-on-Enter; people want the ink to bloom *as they draw*.
**Move 3 — incremental recognition, two speeds.**
- *Fast path (continuous, no model):* the pure geometry in `normalize.ts::analyzeInkKind`
  (closure ratio, corner count, roundness) already runs in milliseconds. Run it *debounced on
  every stroke*, client-side, to ghost "this is closing into a box / straightening into a
  line" before Enter is ever pressed. This is the watercolor-bloom the vision promises, and
  it needs *zero* new model — it's re-wiring functions we already have onto the pointer
  stream.
- *Prediction path (the genuinely new capability):* given the in-progress stroke + scene
  context, predict the *completion* — close the box, finish the arrow to the nearest node,
  add the 4th cell to a row of 3. Ship a heuristic predictor first (symmetry/closure/repeat
  extrapolation — all derivable from `kindScores` + `scene_edges`); graduate to a trained
  stroke-continuation model later. *This* is what makes baio an autocomplete rather than a
  classifier.

**Problem:** genuinely ambiguous ink should be resolved by context, or by one cheap question.
**Move 4 — context-conditioned disambiguation.** Keep the existing choice-chips UX, but rank
the candidates *semantically* using the scene: a circle in a card header ranks `avatar`
above `ellipse`; a circle beside two others of equal size ranks `pie_chart`/`grid`. Add a
**session prior**: an in-memory correction table keyed by `(kind, glyph, context-signature)`
that biases ranking for the rest of the session. The first correction teaches the session —
no retraining, immediate payoff.

**Problem:** session priors evaporate and never personalize.
**Move 5 — correction memory, two tiers.** (i) In-session prior (above), instant. (ii) The
existing logged-gold → GRPO flywheel, offline. Bridge them with a persisted per-user **style
profile** (wobble tolerance for the kind-correction thresholds, glyph handwriting quirks,
preferred defaults). The style profile feeds the *deterministic* thresholds in `normalize.ts`
(e.g. per-user `KIND_CLOSURE_MAX_RATIO`) — personalization without touching the model.

### 1c. Contracts that change

- **New:** `SceneGraph`, `SceneNode`, `SceneEdge` (client-owned, serialized into requests).
- **New:** `ScenedBuilderInput` supersedes `ShapeBuilderInput` — same fields plus `scene` +
  `scene_edges`. This is a **schema wave** (call it shapes-v4 / builder input v2): rule zero
  says datagen, training TOML, serving grammar, and the runtime validator all move together.
  The synthetic generator (`lib/datagen/*`) must start emitting scenes *with prior context*
  and *with relationship edges*, and gold outputs that reference existing nodes.
- **New op/param surface:** commands that reference existing nodes (`match_style`,
  `attach_to`) and emit/confirm edges. Still no coordinates — a `connects` edge references
  node ids, geometry stays derived.
- **Relationship pass:** new module alongside `lib/interpretation/normalize.ts` (e.g.
  `relate.ts`), pure/deterministic, unit-testable exactly like the containment pass.

### 1d. Phased path

- **Phase 0 (small, highest ROI):** feed committed page context back into the builder.
  Re-add a `scene` summary to the builder input; let the *deterministic* wins land first
  ("second button matches the first," "new box's parent is the existing navbar") in code,
  before any retraining. Mostly plumbing + a datagen refresh.
- **Phase 1:** deterministic relationship-inference pass (`aligns`/`row`/`connects`). Use the
  edges immediately to improve snapping and to make Frame smarter (a `row` edge → a real flex
  row). No new model.
- **Phase 2:** continuous local geometry ghosting on the pointer stream (the bloom-as-you-draw
  moment). No new model.
- **Phase 3:** session correction prior + semantic alternate ranking.
- **Endgame:** trained stroke-continuation predictor (true next-stroke autocomplete),
  per-user style profiles, GRPO on the logged corrections that already exist.

### 1e. Open questions / risks

- **Latency of streaming vision.** Mitigation is the two-speed split: local geometry is the
  fast, model-free path; the model only fires on Enter/pause. Never block the pen on a network
  call.
- **State sync without server state.** Keep the server stateless; the client sends the
  SceneGraph each call. Risk: large canvases → large payloads. Mitigation: send a *summary*
  (ids/ops/bboxes/edges), not full geometry, and only the neighborhood around the delta.
- **Over-eager grouping.** A wrong `row`/`grid` edge corrupts layout. Fail closed exactly like
  today: only high-confidence edges influence anything; a spurious edge degrades to "no
  relationship," never to a broken page.
- **Datagen realism.** The whole model story rests on synthetic data being correct-by-
  construction. Adding *scene context* and *edges* multiplies the scene-composition space;
  the corruption model (`lib/datagen/corrupt.ts`) has to be recalibrated against real
  multi-shape sketches, not just single shapes.

---

## Goal 2 — Full-site design (pages, data, functions)

### 2a. What the current design does, and where it breaks

Frame (`lib/frame/*`, `app/api/frame/route.ts`) takes **one canvas** of committed elements →
`buildFrameUserMessage` serializes them into a positioned element list → one streamed Claude
call → **one self-contained HTML file**. It is a one-shot, single-page, stateless, data-less
generator. Its interactivity (smooth-scroll nav, form validation, a "success state") is
*cosmetic*: forms validate and then show a fake success — they submit nowhere.

Concrete limits against "multi-page sites with databases and functions":

- **One canvas = one page.** The entire stack — SceneGraph, `CommittedElement[]`, Frame — is
  single-surface. There is no representation of *a second page* or *a link between pages*.
- **No data model.** Nothing represents "a list of items," "a record," "a table." A list is
  drawn as literal repeated boxes; a form renders but binds to nothing.
- **No behavior.** The 22-op vocabulary is entirely presentational. There is no way to sketch
  "this button saves a record" or "this page lists items from a database."
- **Frame is terminal and monolithic.** One giant HTML blob from one Claude call, with the
  model owning the *structure*. You can't regenerate a single page, can't share
  components/data/theme across pages, can't wire a nav link to another generated page. Re-run
  and you lose everything.
- **No app-level IR.** There's a per-page component tree but no *site* object above it — no
  durable, editable, multi-target representation. Frame jumps canvas → HTML, skipping the
  layer you'd want to edit, re-render, and target both a downloadable file *and* a real
  backend from.

### 2b. The redesign — a durable Site IR, with Claude as decorator not architect

The load-bearing principle that already makes baio safe — *"the component tree is the code;
models exchange compact JSON; only the deterministic renderer produces markup"* — scales up
cleanly. Today the model (Claude) owns the whole HTML structure in Frame, which is the one
place baio violates its own principle. The redesign **pulls structure back into a typed IR**
and narrows Claude to *presentation*.

Build it up problem-first.

**Start:** one canvas → one page.
**Problem:** I want a second page and a link between them.
**Move 1 — Pages as first-class surfaces + a Site container.** The studio holds a set of named
canvases (pages), each with its own SceneGraph. Zoom out to a **site map**: pages are cards,
and you *draw an arrow from a button on page A to page B's card* to mean "clicking this
navigates to B." That arrow is exactly the `connects` edge from Goal 1 — reused, not
reinvented. Arrows *within* a page are flows/bindings; arrows *between* pages are navigation.

**Problem:** pages must share data — a list on one page, a detail on another, same items.
**Move 2 — a sketchable Data Model.** Add a data vocabulary. A box glyphed for data (a new
glyph, e.g. `d`, or a drawn grid) with a header row + column labels → a `Collection` with
`fields`; field *types* inferred from labels ("price"→number, "email"→email, "done"→boolean).
Alternatively *inferred*: a `row`/`grid` edge (Goal 1) over same-kind nodes is a strong signal
of "a list of records." The data model is an IR, not markup:

```ts
interface DataModel {
  collections: Collection[]
}
interface Collection {
  name: string
  fields: { name: string; type: 'string'|'number'|'boolean'|'date'|'email'|'ref' }[]
  seed?: Record<string, unknown>[]   // sample rows so a fresh site isn't empty
}
```

**Problem:** how does a page element know it *shows* data?
**Move 3 — Bindings.** A component carries an optional binding to the data model. A repeated
row/grid → `{ bind:{ collection:'items', mode:'list' } }`. A form whose field labels match a
collection → `{ bind:{ collection:'items', mode:'create' } }`. The *relationship graph does
the work*: form `contains` fields + a button, list `row`-repeats a shape — combine that
structure with label-matching to the data model and bindings fall out deterministically (with
a model assist only for the fuzzy label→field matching).

**Problem:** how are *actions* represented and sketched?
**Move 4 — a closed Action IR.** Actions are a closed, validatable vocabulary — same
discipline as the 22 ops. The model may *select* an action from the set; it may never emit
code. A deterministic codegen turns the IR into real handlers, so a model can no more emit
`DROP TABLE` than today's builder can emit a `<script>`.

```ts
type Action =
  | { type: 'navigate'; to: string /*pageId*/; withRecord?: boolean }
  | { type: 'create';   collection: string; from: string /*formId*/ }
  | { type: 'update';   collection: string; from: string }
  | { type: 'delete';   collection: string; target: string }
  | { type: 'filter';   collection: string; by: string }
  | { type: 'sort';     collection: string; by: string; dir: 'asc'|'desc' }
```

Sketch → action mapping (the money table):

| You sketch | Recognized as | IR produced |
|---|---|---|
| box + glyph `n` | navbar | component |
| box + glyph `f`, labels match a collection | create form | component.binding = create |
| button inside that form | submit | `action: create(collection, form)` |
| repeated row/grid of same shape | list of records | component.binding = list |
| box with header row + column labels | a table | `dataModel.collections[]` |
| arrow: button → another page's card | navigation | `action: navigate` + nav edge |
| arrow: list row → a detail page | open record | `action: navigate(withRecord)` |
| trash glyph on a list row | delete | `action: delete` |
| magnifier glyph on a list | search/filter | `action: filter` |

**Problem:** Frame's one monolithic HTML call can't do multi-page + data + backend, and isn't
durable or re-editable.
**Move 5 — two-layer generation: durable App IR → deterministic codegen, Claude fills flesh.**
- The **Site IR** is the source of truth, *derived* (not hand-authored) from all pages' scene
  graphs plus the data/action/nav overlays:

```ts
interface Site {
  pages:     { id: string; name: string; route: string; scene: SceneGraph }[]
  dataModel: DataModel
  actions:   { id: string; trigger: { elementId: string; event: 'click'|'submit' }; action: Action }[]
  nav:       { from: string /*pageId|elementId*/; to: string /*pageId*/ }[]
  theme:     { accent: string; /* one palette, generated once, shared by all pages */ }
}
```

- **Deterministic codegen owns structure and data logic:** the router, the store, and the
  action handlers are code we generate, never model output — that's where safety and
  correctness live. Two targets from the *same* IR:
  - **(a) Self-contained SPA** — one downloadable HTML file with a hash-router, a
    localStorage-backed store as the "database," and generated handlers. Keeps the "download
    one file and it works" magic, now multi-page *and* stateful. This is the demo/endgame-lite
    path and the natural extension of today's Frame output.
  - **(b) Real app** — a Next.js + SQLite/Supabase (Base44-style) project: collections →
    tables, actions → server actions/API routes, pages → routes. The real-backend endgame.
- **Claude narrows to presentation.** Given the Site IR + one page's scene graph, Claude
  generates *that page's* look — like today's Frame, but constrained to the IR's structure,
  bindings, and actions. It styles and writes copy; it does **not** invent data, navigation,
  or structure. Generation becomes **per-page** (parallelizable, individually regenerable)
  instead of one monolithic blob, with a shared `theme` generated once so pages stay
  visually consistent. This finally makes Frame obey baio's own "the tree is the code"
  principle — Claude decorates the tree, deterministic codegen builds the app.

### 2c. How this reuses Goal 1

Goal 2 is mostly *interpreting the Goal-1 relationship graph at site scale*:
- `connects` edges → navigation (between pages) or data flow (within a page).
- `row`/`grid` edges → list bindings.
- `contains` + `labels` (form + fields + button) → create bindings + a create action.
This is why the doc frames them as one move: **ship the Scene Graph and most of the site model
is edge semantics.** If Goal 1 is deferred, Goal 2 still works but has to re-derive these
relationships inside Frame ad hoc — strictly worse.

### 2d. Phased path

- **Phase 0 — multi-page container.** Studio holds multiple named canvases + a site-map
  zoom-out; nav links are drawn arrows between page cards; Frame generates each page + a
  shared nav and a shared theme. Real multi-page sites, still no data. Reuses the arrow/
  `connects` primitive.
- **Phase 1 — data model + bindings (client-only backend).** Sketch collections; the
  self-contained SPA target binds lists/forms to a localStorage store. "List items from a DB"
  and "button saves a record" genuinely work in the downloadable file.
- **Phase 2 — Action IR + closed action vocabulary.** navigate/create/update/delete/
  filter/sort, sketched via glyphs and arrows; deterministic handler codegen.
- **Phase 3 — real backend target.** Codegen to Next.js + SQLite/Supabase; collections →
  tables, actions → server actions; Vercel/Base44 deploy.
- **Endgame — round-trip.** Edits in the running app reflect back into the Site IR; live data;
  auth; component library import (the ideas doc's "copy Figma's premade buttons").

### 2e. Open questions / risks

- **IR drift.** The Site IR must be a *projection* of the per-page scene graphs + overlays,
  regenerated on demand — never a parallel hand-maintained structure, or it desyncs from the
  canvas. Same lesson as rule zero.
- **Ambiguity explosion.** Is a repeated row "a list from data" or "just three cards"? This
  *needs* Goal 1's disambiguation loop, or an explicit "bind" glyph. Under-committing is
  safer: default to plain repeated components, upgrade to a binding only on a confident signal
  or an explicit gesture.
- **Cross-page visual consistency.** Per-page Claude generation risks each page looking
  different. Mitigation: generate the `theme` once, pass it into every page generation as a
  hard constraint.
- **Security of a real backend.** Real data logic is the highest-stakes surface. Keep the
  model *entirely* out of it: closed Action IR + deterministic codegen means the model selects
  from a validated vocabulary and never writes queries. Same fail-closed philosophy as the
  shape validators, applied to data.
- **Authoring state.** Multi-page scene graphs live client-side and serialize into a project
  file; the server stays stateless. Persisting/loading a multi-page project is new surface
  (there's no project store today).
- **Hybrid text.** The ideas doc floats "mixed drawing plus text." A typed annotation
  ("sorted by date", "max 20") is a clean way to specify *action params* without becoming a
  chatbot — worth allowing as typed hints that fill IR fields, never as free-form prompts.

---

## Summary of the architectural bet

1. **Replace the stateless per-shape classifier with a persistent, client-owned Scene Graph**
   that flows back into recognition as context and captures relationships (contains / row /
   connects / labels / aligns), most of them derived deterministically like today's
   containment pass.
2. **Make recognition incremental** — a model-free fast path (existing geometry on the pointer
   stream) plus a genuine stroke-*prediction* path, so baio finally is the autocomplete it
   claims to be.
3. **Add in-session correction memory and per-user style profiles** for immediate,
   retraining-free personalization, bridging to the already-staged GRPO flywheel.
4. **Introduce a durable Site IR** (pages + data model + bindings + closed Action IR + nav)
   assembled *from* the scene graphs, and **narrow Claude/Frame from architect to decorator** —
   deterministic codegen owns structure, routing, and data logic; the model only styles.
5. **Ship two codegen targets from one IR** — a stateful self-contained SPA (keeps the
   one-file magic, now multi-page) and a real Next.js + DB app (the backend endgame).

The through-line: baio's winning idea has always been *shrink the model's job until it can't
fail dangerously* (describe-not-decide, no-coordinates, closed op set, fail-closed). Both goals
extend that same idea — a richer typed graph the model reads, and a richer typed IR the model
decorates — rather than handing more structural authority to a model.
