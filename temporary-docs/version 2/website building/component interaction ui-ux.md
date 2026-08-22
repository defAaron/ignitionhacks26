# Component interaction — UI/UX

**Line-based linking**
- Draw a line to connect components.
- Click a line → add text.
- That text = how the components are linked (the link's meaning/behavior).

**Lens system**
- Drawing panel is a layer on top of the browser → generalize to multiple lenses.
- Each lens shows different things; toggle on/off.
- All lenses on at once = allowed, but software is less confident what you're working on.
- Connecting lens: only the links + the browser.
- Layer view: move elements around, shuffle layer order.

## Ideas

**Canvas [liminal space] vs Page**
- **Canvas [liminal space]** = the entire area where things are drawn; infinite in all directions.
- Nothing on the liminal space becomes a website — it's just a place to keep things (sketchbook / idea storage).
- Still has layers, but **no layers UI**.
- **Page** = a webpage, and a self-contained unit. A special object made by baio. Glyph **`p`**.
- Only a page shows layers (the layers UI, like now).

**Page behavior**
- New project always starts inside a page; exit full-page mode to see the liminal space.
- Default config: in full-page mode a page expands infinitely downward. (Settings allow other directions.)
- Distinct **border** signals you're in a page; easy to exit. No nested-page spawning by drawing.
- A page is just a contained item — it can also hold a single object and be merged into another page.
- A page placed **inside another page takes up no space**.
- **Root-level page = assumed to be a webpage** → any white space gets filled. A page-within-a-page does **not** have this condition.
- Loose elements on the liminal space can be dragged into a page.

**Page = a window with tabs**
- Renders like a window with tabs across the top for its other aspects:
  - **Authorization**
  - **Links** — where things are linked
  - **Data** — what's stored / accessed
  - **Logic** — APIs, business logic
  - **Meta/data**
- Summarized **pseudo-code view**: lists assets, components, text, etc. you want to edit, in pseudo-code — the page represented as code-ish, enabling fine-tuning of specific portions.

## Data and logic

JSON is the source of truth. HTML is generated from it. Do not hand-edit HTML.

**Three roles — only the block is smart**
- **Cell** = dumb data. Never does logic.
- **Arrow** = dumb wire. Links things. Never holds logic.
- **Block** = the only smart part. All logic lives here.

**Cells**
- A cell is a named, addressable, reactive slot. Source of truth; the arrow is UI over it.
- Data is a tuple: `{source, value}`. Many can publish into one cell, so a cell holds many entries (many-to-many).
- **Publish** = write a tuple into a cell. **Yoink** = read it; pick the data points you want; transform with a little text (the mapping).
- **Auto-cell**: every arrow resolves to a cell. No named cell → an anonymous cell spawns in the middle of the line.
- Summon a cell anywhere by name. Arrow = a binding with both ends visible. Summon = a binding with no line.
- **Table** = a group of cells. Grouping only. Cells stay unique.
- Components connect to cells, not to each other. Hub-and-spoke. This kills arrow clutter.

**Blocks = auto-written functions**
- A block is a function: inputs → body → outputs. Framing auto-writes it. Open it only to make it smarter (on-demand depth).
- **Stateless**. State lives in cells. This is what makes a block safe to auto-write.
- **Triggers are inputs** (onClick, onLoad, onChange). The block knows when to run.
- **Body** = pseudo-code. Drag input chips in.
- **Output type = data OR page**. Data → writes a cell. Page → navigate (this is the href).
- Default invisible. The user sees only the arrows.

**Worked cases**
- **Button → page**: one gesture auto-spawns a click cell + a block (input = click, output type = Page). You see only the arrow. Open the block to gate it (e.g. only if logged in).
- **DB update**: fields publish to cells; button publishes a click; a save block takes `{click, fields}`, body = write to table, output = success/error. The query lives in the block body, not the cell.
- **Chatbot**: text field → cell → API block → cell → text field.

**Live interaction + preview**
- Cells are reactive. A publish re-runs every reader with an `onChange` trigger.
- One JSON, two runtimes: in-browser interpreter = live preview; codegen = shipped app.
- **Preview is a mode, not a button.** Outside edit mode, click into a page → it goes full-page and runs live. Buttons are wired, navigation works, click around as a user and it takes you places.
- Edit mode = build. Browse mode + inside a page = preview.

**JSON — chatbot example**
```json
{
  "cells": {
    "userMsg":  { "name": "userMsg",  "value": [] },
    "botReply": { "name": "botReply", "value": [] }
  },
  "tables": { "chat": ["userMsg", "botReply"] },
  "blocks": {
    "ask": {
      "inputs": ["userMsg"],
      "trigger": "onChange",
      "body": "call llm with userMsg",
      "output": { "type": "data", "to": "botReply" }
    }
  },
  "bindings": [
    { "from": "input_1",  "to": "userMsg",  "op": "publish", "trigger": "onSubmit" },
    { "from": "botReply", "to": "text_1",   "op": "yoink",   "trigger": "onChange" }
  ]
}
```

**CRUD tiers**
- **Simple CRUD** — baio owns the backend. Native store + curated simple APIs (LLM etc.). No credentials, no setup. Covers chatbot, form-to-store, catalog.
- **Connectors** — the user owns the backend. Bring an API key / external service (e.g. Supabase). Edit a real table or design a database by drawing.
- Secrets (API keys) live only in the connectors tier, server-side. Simple CRUD has no secrets.
