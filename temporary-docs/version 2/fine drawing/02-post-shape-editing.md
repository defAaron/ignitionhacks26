# Problem 2 — Editing a shape after it is made

Once a stroke is crisped, it becomes a finished thing. A cube is a cube, a graph is a graph, a button is a button. You can redraw it, but you cannot reach back into it and change what it is made of.

That is the gap. A cube should still know it has faces, edges, and corners you can grab and move. A graph should still know its axes and its points. A curve should still hold the bezier handles that shaped it, so you can bend it again later. When you draw a second shape over the first, the two should be able to merge into one object rather than sit as separate marks. The finished shape needs to stay made of parts, not flatten into a single frozen result.

This gets harder as shapes get richer. A flat curve keeps a bezier. But a 3D object — a cube, a cylinder — needs a representation that survives editing in a way a 2D outline does not. And a special component like a button is not really geometry at all; it is a thing with behavior, and editing it later means editing what it does, not just its outline.

So the question this abstract opens: what does a shape have to remember about itself — its parts, its curves, its structure, its behavior — so that after it is created it can still be re-edited and merged, whether it is a line, a 3D form, or an interactive component?
