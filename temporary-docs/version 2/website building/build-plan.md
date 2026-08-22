# Build plan — wiring

Goal: draw an arrow between two elements → AI writes a logic block → user accepts with Enter → runs live in preview.

## Locked decisions
- Regeneration = a **suggestion**. User accepts with Enter (mirror shape-autocomplete confirm). More arrows → updated suggestion → Enter again.
- Endpoint resolution = **reuse existing proximity/geometry** (the ink pipeline's "what element is this near").
- Pipeline = **Gemini analyzes** the arrow neighborhood (endpoints + spatial context) → **Claude Haiku writes** the logic block. Same two-stage split as the existing shape pipeline.
- Block = auto-written **function**: stateless, state in cells, triggers as inputs, output type = data | page.

## Phases

**P0 — Schema + types**
- `shared/schemas/logic-v1.json`: block = `{ inputs[], trigger, body, output:{type:data|page, to} }`.
- TS types alongside existing schema types.

**P1 — Wiring pipeline (backend, testable alone)**
- New `/api/wire` route. Input = arrow context (source + target element descriptors + neighbors). Gemini → intent; Haiku → block conforming to `logic-v1`. Return block as suggestion.
- Reuse the Gemini transport + the Claude-call pattern from the frame route.
- Prove with a mock arrow context before any UI.

**P2 — Arrow tool + endpoint resolution (UI)**
- Arrow tool. Draw arrow → resolve both endpoints via existing geometry → auto-spawn a cell mid-line.

**P3 — Suggestion → accept UX**
- Show the generated block as a ghost/suggestion. Enter accepts (mirror autocomplete confirm bar + chips). New arrows re-run → updated suggestion.

**P4 — Cells + reactive runtime + preview**
- Reactive cell store; publish/yoink; blocks run on trigger. Preview = browse mode inside a page runs live.

**P5 — Pages / liminal space** (larger; later)
- Page object (glyph p), full-page mode, infinite canvas.

## Status
- **P0 done.** `product/shared/schemas/logic-v1.json` + `product/lib/wire/types.ts`.
- **P1 done + verified live.** `product/lib/wire/{prompt,validate}.ts`, `product/app/api/wire/route.ts`. Two-stage Gemini-analyze → Haiku-generate. Smoke test: button→page gave `output.type page` (navigate); text→list gave `output.type data` to a reused cell. Model failures degrade to `200 {ok:false}`; env: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, optional `WIRE_MODEL` (default Haiku 4.5).
- **Next: P2** — arrow tool + endpoint resolution (reuse `findFrameAt`/`findLooseFrameAt`), auto-cell mid-line; then P3 suggestion→Enter-accept (mirror the `confirm` bar), P4 reactive runtime + preview.

## Wiring vertical slice (button→page navigation) — done
- Scope: draw a button + pages on the plane, draw an arrow button→page, then in browse mode CLICK the button to navigate into the target page.
- **Space model.** `Wire = {id, sourceId, targetId, block}` + `wires: Wire[]` on `LiminalSpace`; `emptySpace()` seeds `wires:[]`; `addWire()` helper. `lib/space.ts`. Ids reference element ids (`e_…`) or page ids (`p_…`).
- **P2 endpoint resolution.** In `confirm()` (`components/Studio.tsx`), before the shape-commit path: a guess resolving to op `arrow` takes the raw stroke with the most points, tail=first pt, tip=last pt (already in the active view's coord space). `resolveEndpoint()` hit-tests — liminal: loose elements (topmost) then page objects' world rects `{location.x-PAGE_WIDTH/2, location.y, PAGE_WIDTH, INITIAL_PAGE_HEIGHT}`; focused: active page elements. Both endpoints DISTINCT → wire; else fall through to normal arrow-shape commit.
- **P3 accept.** Auto-accepted for this slice: `createWire()` mints `w_…`, adds the wire (block null), consumes the ink (`clearSketch(true)`), POSTs `/api/wire`, writes the returned block onto the wire; failure toasts via `setFrameError` and drops the dangling wire.
- **P4 navigate.** Browse-mode click on a loose element runs `activateElement()`: finds a wire with this `sourceId` and `block.output.type==='page'`, then `enterFocused(idx)` where `idx` = `space.items` index whose `page.id === block.output.to`. `EditableElement` gained an optional `onActivate`, passed only for loose elements in browse-liminal; the loose `page-layer` is made pointer-interactive in browse.
- **DEFERRED — visible "accept with Enter" gate.** No ghost/preview of the block and no Enter-to-accept step; the wire auto-accepts the pipeline result. Mirror the sketch `confirm` bar when building it.
- **Nice-to-have shipped.** Wires render as thin dashed SVG segments between endpoint centres on the plane (`wireLines`), pointer-inert, liminal only.
