# baio Core Interaction UI

## Autocomplete

- Draw strokes with the pen. Type labels with the text tool.
- Press Enter to run recognition.
- The phase becomes "thinking". Three dots and "reading your sketch" show under the ink.
- Strokes crop to the ink bounds plus 24 px. They rasterize to a PNG. Stroke colors are kept. The PNG posts to `/api/autocomplete`.
- Text-only sketch uses an offline rule. Text over 28 characters becomes a paragraph. Shorter text becomes a heading.
- Each returned result renders as a ghost preview where it will land.
- The confirm bar shows the guessed kind and a confidence percent.
- Chips: alternate kinds switch the guess on click. A "keep as drawn" chip swaps the guess for raw ink.
- Press Enter again to commit. The "confirm" button also commits.
- Each result commits as its own movable element. A paint splotch blooms over it.
- Press Esc to discard the sketch.
- Idea: in the auto-suggestion tab, scroll through the library to pick what you want.

## Stroke ease

- Library: perfect-freehand (`getStroke`).
- Default size: 6 px.
- Thinning: 0.6.
- Smoothing: 0.55.
- Streamline: 0.45.
- Easing: `sin((t * PI) / 2)`.
- Simulate pressure: on.
- Pen input uses real pressure. Mouse input uses 0.5.
- Brush size range: 2 px to 24 px. Step: 2 px. Keys w and s drive it.
- Coalesced pointer events raise the sample rate on fast strokes.
- Redraw batches on animation frames.

## Hotkeys

- Enter: guess in sketch phase. Confirm in preview phase.
- Esc: drop the selection, then shake off the sketch or preview, then leave edit mode.
- Delete or Backspace: delete the selected element.
- Ctrl+Z or Cmd+Z: undo one stroke, text, or erase. Sketch phase only.
- Ctrl+V or Cmd+V: paste an image.
- d: pen tool.
- e: eraser tool.
- t: text tool.
- m: select tool.
- 1 to 9: pick a palette color.
- w: larger brush.
- s: smaller brush.
- h: toggle browse and edit.

## Tool convenience

- Draw a single dot over a component. Treat it as a click on that component.
- Draw cells to build data. A network table only bundles cells. Each cell is unique.
- A cell can have a name. Use the name to summon the cell anywhere.
- Draw a network table, then select which cells it holds.
- Draw an arrow between two elements. A cell is made automatically for that instance.
