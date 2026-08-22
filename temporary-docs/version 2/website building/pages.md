# Pages — build contract (slice 1)

Scope = `page + elements` only. Data/logic (cells, tables, wires) and tabs deferred; append later as new keys.

## Coordinate model
- Origin `(0,0)` = top edge, horizontal center of the page.
- `x` negative = left, positive = right.
- `y` positive = down.
- Page grows infinite: left, right, down.
- Units: px.
- Render: `screenX = pageCenterX + location.x`; `screenY = pageTop + location.y`.

## id and name
- Every page, element (and later cell) gets an `id`.
- `id` = permanent, opaque. Generated once from a random seed at creation. Never changes on rename.
- `id` is what wires and cells reference.
- `name` = friendly handle. Default = random readable key (e.g. `wispy-fox-42`). Renamable anytime.
- `name` is for human reference ("summon by name"). Resolved by a `name → id` index.
- Rename changes `name` only. `id` untouched. No reference breaks.

## Schema — `page-v1`
```json
{
  "schema": "page-v1",
  "id": "p_9f3a2c",
  "kind": "page",
  "name": "wispy-fox-42",
  "root": true,
  "origin": "top-center",
  "grow": ["down", "left", "right"],
  "elements": [
    {
      "id": "e_71bd04",
      "kind": "button",
      "name": "wispy-fox-43",
      "location": { "x": -120, "y": 340 },
      "size": { "w": 160, "h": 48 },
      "text": "Sign up",
      "color": "#7c3aed",
      "src": null,
      "layer": 0,
      "shape": { "op": "button", "params": {}, "snap": null }
    }
  ]
}
```

## Fields
- `schema` — version tag. `page-v1`. Upgrade path: v2 injects empty `cells`/`tables`/`wires` into v1 pages.
- `root` — `true` = webpage (fills whitespace). Nested page mechanics deferred; flag kept for later.
- `origin`, `grow` — coordinate convention. Default `top-center` + down/left/right. Settings can change direction later.
- element `kind` — `ElementKind` from `product/lib/types.ts`.
- element `location{x,y}` + `size{w,h}` — replaces old `rect{x,y,w,h}`. Split position from size.
- element `shape` — pipeline result. Keep `op`/`params`/`snap` only. **`bbox` dropped** — `location`+`size` is the single source of truth.
- element `layer` — stacking. Reuse existing layers UI.
- element `src` — image data URL. `image` kind only.

## Chrome
- Page border = Mac window frame. Reuse existing UI kit.
- Border signals you are inside a page. Easy to exit.
- Layers UI = reuse current studio implementation.

## Deferred (append later, no migration)
- `cells`, `tables`, `wires` → `page-v2`. New top-level keys. Runtime inert when empty.
- `p` glyph → full ML pipeline op (schema + vision + normalizer + FreeSolo builder). First page exists by default (project starts inside a page), so not needed for slice 1.
- Tabs: Authorization, Links, Data, Logic, Meta/data. Undefined — chat-first before build.
- Nested-page mechanics: page-in-page takes no space, merge.
- Reactive runtime + codegen.
- Undefined vocab needing decisions: triggers, `mapping` language, component→cell binding, links-vs-wires reconcile.

## Decisions log (this chat)
- New page-native schema, not a wrapper over `CommittedElement`.
- Top-center origin, infinite down/left/right, px.
- `location`/`size` split.
- `id` permanent + opaque; `name` friendly, random default, renamable; reference by `id`.
- `bbox` dropped from `shape`.
- `root` flag kept, nesting deferred.
- `p` glyph = full ML pipeline op.
