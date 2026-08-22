# baio — Wave-3 Semantics: the containment model

Decided 2026-07-19 (eve). Supersedes the flat-detection reading of `vocabulary.md` for wave 3; the 16-op vocabulary itself survives, reorganized under four precedence rules.

## The four rules (highest precedence last)

```text
1. BASELINE   every enclosed shape is a SHAPE — drawn approximately (crisped or
              kept-as-drawn) and FILLED with the color it was drawn/shaded with.
2. DETAILS    anything strictly INSIDE an enclosed shape is a DETAIL of it, not
              a sibling: a word → label/text content; colors/shading → fill or
              gradient ("gradient rainbow button"); small marks → texture.
3. FUNCTION   a GLYPH (single letter alone) inside a shape is the ONLY thing
              that adds function — it turns the shape into an interactable
              (b button, f form, i image, n navbar, v video, ? placeholder).
              No glyph, no behavior: purely visual, never a surprise component.
4. DIAGRAMS   if the whole cluster reads as a diagram (axes+bars, circles+
              connectors, pie, timeline…), it becomes that diagram composite.
```

Open/unenclosed ink keeps its wave-1 readings (line, arrow, text, scribble → decoratives by context).

## What this changes in the contract (wave-3 builder)

- **Detections gain containment**: the vision layer reports which detections sit inside which enclosing detection (children claim their parent). Geometry still comes only from ink; the builder still emits zero coordinates.
- **One command per top-level detection**: children never produce their own commands — they route into the parent command's params (`label`, `fill`, `gradient`, glyph-op selection). This kills the current failure mode where a label or shading spawns a sibling element.
- `wait` unchanged. Diagram composites consume their whole stroke cluster (the wave-2 mechanism, unchanged).

Training handoff for this contract: `freesolo/WAVE3-HANDOFF.md`.

## UI systems that ride on it (client-side, no training dependency)

- **Layers**: overlap spawns a layer entity — every time a committed element overlaps an existing one it goes on a new layer above it. A slim rail of thin lines at the screen edge lists layers top-down; clicking one "peels" the view to it (everything above is hidden); elements are edited on their own layer.
- **Scrollable plane**: the page is an absolute plane that scrolls vertically without bound (the current "+ space" growing canvas generalized — draw at any depth).
- **Picture frames**: any `image` element (box + `i`) accepts a drag-dropped picture. If the drawn frame is approximately a rectangle it's a normal image frame; if not, the drawn silhouette becomes the frame — the picture is clipped to the smooth-path shape.

## Frozen contract addendum (2026-07-19, wave-3 contract agent)

The contract is frozen; full spec in `shared/schemas/README.md` §1.6. Deltas against the body of this doc:

- **The normalizer, not the vision layer, reports containment** (supersedes "the vision layer reports which detections sit inside which" above). Containment is geometry; geometry is code's job. `detection-shapes.json` is unchanged.
- **Representation**: each builder-input detection carries `parent: <detection_id> | null` (required-nullable) — the minted id of its *immediate/deepest* enclosing detection. Zod: `shapeBuilderDetectionV3Schema` in `types/schemas.ts`.
- **Assignment rules** (the containment pass in `lib/interpretation/normalize.ts`, after the glyph merge): A is a child of B iff B's kind ∈ {rect, ellipse, smooth_path}, ≥92% of A's stroke-union bbox area lies inside B's (`CONTAINMENT_MIN_OVERLAP`), and B's bbox area is strictly greater than A's. Deepest (smallest-area) candidate wins; exact area tie → earlier vision order; equal/coincident boxes never parent each other; <92% overlap → no parent; degenerate child boxes get a 1px-per-axis floor; merged glyph letters are already consumed and never become children.
- **Output schema unchanged**: `shared/schemas/shapes-v3.json` ≡ `shapes-v2.json` in shape and 22-op enum (fresh `$id` so wave-3 training/serving configs are unambiguous). One command per **top-level** (`parent: null`) detection; commands answering child detections are validator violations.
- **Serving note**: `parent` is computed on `NormalizedDetection` but deliberately NOT yet threaded into the live builder input — the deployed wave-2 adapter never saw the field (rule-zero parity). Thread it when the wave-3 adapter promotes.
