# Problem 1 — Line and shape control

Today the engine assumes one thing: a stroke wants to become a clean, enclosed shape. Ink closes into a box, straightens into a line, rounds into a circle. That is the only intention it can read.

But a line is not one thing. Sometimes you want it jagged — a mountain, a signal, a rough edge. Sometimes you want it perfectly smooth. Sometimes you want a controlled curve — a bezier that bends the way you meant, not the way the ink wobbled. The same rough stroke can mean any of these, and right now all of them collapse into the same crisped output.

The problem is sensing which one you meant. The signal has to come from the stroke itself — its speed, its pressure, its shakiness, how deliberate the hand was — and from what is already on the canvas around it. A fast confident sweep is not the same intention as a slow careful trace, and a jagged edge next to a smooth one is probably deliberate contrast, not a mistake to be cleaned away.

So the question this abstract opens: how do we read the character a person wants a line to have — jagged, smooth, or curved — from how they drew it, instead of forcing every stroke into the same enclosed-shape default?
