# Problem 4 — Connections (arrows)

An arrow is not a shape and not a component. It is a link between two other elements — it says "this relates to that." That makes it a separate problem from everything else in this folder.

Drawing one is easy. An arrow is a line with a head; the only fidelity question is snapping its two endpoints to the nearest elements. So on the drawing side it needs almost no special consideration — the pure-shape problem is far harder.

The weight is on the other side: what the arrow *means* and how it stays editable. An arrow between two boxes is a relationship, not a decorative mark. Editing it means retargeting its endpoints — moving what it connects — not reshaping a curve. And its meaning carries into the wider system: a connection is the primitive that becomes navigation, data flow, and bindings elsewhere.

So the question this abstract opens: how do we treat an arrow as a link between elements — cheap to draw, but carrying a relationship that can be retargeted and read as structure — rather than as one more shape to crisp?
