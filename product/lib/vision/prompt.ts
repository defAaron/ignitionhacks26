/**
 * The Gemini vision prompts, assembled programmatically.
 *
 * SHAPES-FIRST (live): `buildShapeVisionPrompt()` — the task is DESCRIPTION,
 * not component classification. Vision reports what each stroke cluster LOOKS
 * like (7 geometric kinds + glyph/text reading + color signals); the builder
 * decides what anything BECOMES. Sources (do not fork the wording — update the
 * docs, then this file):
 *   - kind vocabulary + disambiguation: docs/architecture/vocabulary.md §4
 *   - output contract: shared/schemas/detection-shapes.json (README §2)
 *
 * LEGACY (pre-pivot, retained for the flash-1784430057 run):
 * `buildVisionPrompt(opIds)` / `buildWave1VisionPrompt()` — component
 * classification against an op whitelist. Consumed by the legacy `analyzeInk`
 * client path only; do not extend.
 */

import { LABELS, PHASE1_OPS } from "../labeler/labels";

// ===========================================================================
// SHAPES-FIRST PROMPT (live)
// ===========================================================================

/**
 * The 7 geometric kinds with their visual keys (vocabulary.md §4).
 * Deliberately local — vision no longer needs the op vocabulary at all;
 * ops are semantic (what to make) and belong to the builder.
 */
const KIND_LINES = `- rect: roughly closed, roughly four corners / four straightish sides
- ellipse: closed convex curve, roundish (circle-ish or oval-ish)
- line: single open stroke, low curvature
- arrow: open stroke (or strokes) with a terminal chevron/triangle head at one end
- scribble: dense chaotic ink with no readable form — including repeated-crest
  squiggles, zigzags, asterisk marks, and hatching that is NOT inside a closed
  outline (hatching inside a closed outline is that shape's FILL — see the
  fill rule below)
- smooth_path: closed but irregular freeform outline (a doodle silhouette —
  not box-like, not round enough to be an ellipse)
- text_writing: handwriting — letters, words, phrases, sentences`;

const SHAPE_DESCRIPTION_RULES = `DESCRIPTION RULES (vocabulary.md §4)

Kind keys:
- Roughly-closed, roughly-4-corners -> rect; closed and roundish -> ellipse;
  closed and irregular -> smooth_path.
- Open, low curvature -> line; open with a terminal chevron/triangle -> arrow.
- Handwriting -> text_writing (and read the characters); dense chaotic ink
  with no readable form -> scribble.

Glyph vs. text (report both fields on every detection; null is the explicit
"none" answer; NEVER set both on one detection):
- "glyph": set when the handwriting is a SINGLE letter or character standing
  alone (typically alone inside a box). Report it lowercase (the convention is
  case-insensitive) on the handwriting cluster's own detection
  (kind=text_writing, glyph="i", text=null). The surrounding box stays its own
  rect detection with glyph null.
- "text": handwriting read as content — any word, phrase, or sentence
  (glyph stays null).
- A word is NEVER a glyph: a lone "b" in a box -> a text_writing detection
  with glyph "b"; "buy" in a box -> a text_writing detection with text "buy"
  and glyph null.

Fill and shading (hatching inside a closed outline is a FILL, never a
scribble):
- When dense hatching / shading / scribbled-in strokes lie STRICTLY INSIDE a
  closed outline (a box, an oval, a freeform silhouette), that ink is the
  shape's FILL. Report ONE detection whose kind is the OUTLINE's kind (rect /
  ellipse / smooth_path), claim the outline strokes AND all of the interior
  hatch strokes in that single detection's stroke_ids, and report the fill
  ink color(s) in "colors". NEVER report interior hatching as a separate
  scribble detection. If the fill's hue TRANSITIONS across the shape (e.g.
  purple strokes on one side shading into pink on the other), that is a
  gradient fill: report BOTH end colors in "colors" (in the order of the
  transition) and set "gradient_direction" — never average the two hues into
  one in-between color.
- Hatching or shading NOT contained inside any closed outline stays
  kind=scribble as usual.
- Night-sky signature (grouping matters): a dark-shaded rect (near-black /
  navy / deep-blue fill) with small scattered light dots inside it, in the
  upper region of the canvas, is still exactly ONE detection with kind=rect —
  claim the outline, the dark hatching, AND every dot stroke in that one
  detection, and put the dark fill color in "colors" — it MUST appear there
  even when it is nearly black (navy is a color, not black). The tiny dots
  are noted by claiming their strokes, NOT by color: do not add the dots'
  light color to "colors". Do not split the dots into their own detection.

The squiggle family — describe, never interpret (downstream logic decides what
anything becomes):
- Curvature: waves are ARCS; zigzags/mountains are STRAIGHT segments.
- Amplitude & count: mountains = 1-3 big peaks; zigzag = many uniform peaks;
  waves = repeated crests, often stacked rows.
- Report a long multi-crest curved squiggle as kind=scribble — even at a
  section boundary where it is probably a wave divider, YOU still say
  scribble; downstream logic decides what it becomes.
- Small 4-point asterisk marks near text: also kind=scribble (one detection
  per cluster). Position is real signal for downstream, so your grouping and
  advisory bbox matter — your kind label never changes because of position.

Diagram composites (wave 1.5) — describe, never interpret. When many strokes
obviously form ONE diagram, you MAY report the whole composite as a SINGLE
detection with kind=scribble claiming all of its strokes (the existing fields,
no new kinds). Downstream logic maps the composite to a diagram via bbox and
color context, so accurate grouping, bbox, and colors matter most here:
- bar chart: 3-6 vertical rects of varying heights sharing a baseline, often
  with L-shaped axes strokes
- pie chart: a circle with 2+ radial lines from its center
- venn diagram: 2-3 overlapping circles
- timeline: a long horizontal line with 3+ tick marks or dots along it
- periodic table: a wide grid-ish cluster of many small rects, or a rect grid
  with 1-2 letter labels inside cells (cell letters are NOT glyphs — a glyph
  is a single letter alone in ONE box, not a letter per cell of a grid)
- atomic structure: a small filled circle with 1+ concentric ellipses/circles
  around it, often with small dots on the rings
If the strokes read as one of these but you are unsure, still report ONE
kind=scribble detection for the cluster — never split a clear composite into
its parts and never guess a different kind for it.
Set the detection's "composite" field to which diagram the cluster LOOKS like
("bar_chart", "pie_chart", "venn_diagram", "timeline", "periodic_table",
"atomic_structure") — it works like a glyph for diagrams: an appearance
report, not a decision; downstream code still verifies against the strokes.
For every non-diagram detection, "composite" is null.

Color and gradient:
- "colors": the ink colors you observe in this cluster, as hex or CSS color
  names. Report EVERY observed non-pure-black color — DARK colors count (dark
  navy, deep blue, dark purple ARE colors; report them, never round them down
  to black). When ink looks black at a glance, look closer: if it has ANY
  visible hue (a bluish or purplish cast, e.g. #0b1026-style navy) it is a
  color — report it. The empty array is ONLY for clusters whose ink is truly
  the plain default black (#000000) with no hue at all.
  When a cluster contains two or more distinct hues, list EACH of them —
  never average distinct hues into a single in-between color.
- "gradient_direction": "down" | "right" | "diagonal" when the cluster's
  strokes visibly shade from one color toward another in that direction
  (left-to-right shading is "right", top-to-bottom is "down"); null
  otherwise. Whenever you report 2+ colors that shade into each other, also
  report the direction.

Anti-signal: stroke DIRECTION is cultural noise (86% of US users draw circles
counterclockwise, ~80% of Japanese clockwise) — describe final geometry only,
never stroke order or stroke direction.`;

const SHAPE_OUTPUT_RULES = `OUTPUT RULES

- Respond with JSON only, matching the response schema: {"detections": [...]}.
- One detection per stroke cluster (a group of strokes that visually form one
  thing: a box, a letter, a doodle). Every field is required on every
  detection; "glyph", "text", and "gradient_direction" use null as the
  explicit "none" answer.
- "kind": exactly one of rect | ellipse | line | arrow | scribble |
  smooth_path | text_writing.
- "confidence": 0..1 for the kind call.
- "stroke_ids": the ink this detection claims. Use ONLY ids that appear in the
  stroke manifest. Group all strokes forming one element into one detection.
  A stroke id may appear in AT MOST ONE detection across the whole output.
- Clusters you cannot describe as any kind above are OMITTED, never guessed.
  An empty "detections" array is a valid answer.
- "bbox": advisory only — a rough {x, y, width, height} union of the claimed
  strokes in screenshot pixels. You describe; you never place. Downstream code
  recomputes geometry from the real ink.`;

/**
 * Build the shapes-first vision prompt (detection-shapes.json contract).
 * No arguments: the 7-kind vocabulary is fixed; there are no waves here.
 */
export function buildShapeVisionPrompt(): string {
  return [
    `ROLE

You are the vision layer ("the eyes") of baio, a sketch beautifier. You
receive a screenshot of hand-drawn ink on a canvas plus a stroke manifest,
and you DESCRIBE each stroke cluster: what it geometrically looks like, any
single-letter glyph or handwritten text you can read, and its ink colors.
You do NOT decide what anything becomes — kinds are geometric descriptions,
and downstream logic maps them to output. You describe; you never place.

INPUT

1. A screenshot (PNG) of the canvas ink.
2. A stroke manifest: JSON array of {"id", "bbox": {x, y, width, height},
   "point_count", "color"?} — one entry per stroke, in screenshot pixel
   coordinates. These ids are the ONLY legal values for "stroke_ids".
   When an entry carries "color", that is the stroke's EXACT ink color —
   treat it as ground truth for your "colors" field (a manifest color like
   "#0b1026" is dark navy, a real color, even if it looks black on screen);
   still merge near-identical shades, and still report [] when every claimed
   stroke is plain default black.`,
    `KINDS (the only legal "kind" values, with visual keys)

${KIND_LINES}`,
    SHAPE_DESCRIPTION_RULES,
    SHAPE_OUTPUT_RULES,
  ].join("\n\n");
}

// ===========================================================================
// LEGACY COMPONENT-CLASSIFICATION PROMPT (pre-pivot — flash-1784430057 run)
// ===========================================================================

const LABELS_BY_OP = new Map(LABELS.map((l) => [l.op, l]));

/**
 * The "rectangles disambiguated by contained marks" master key
 * (pre-pivot vocabulary.md §3). Each line is only included when its op is in
 * the active vocabulary.
 */
const MASTER_KEY_LINES: ReadonlyArray<{ op: string; line: string }> = [
  { op: "image", line: "X through it (corner-to-corner)  -> image" },
  { op: "dropdown", line: "caret / small triangle at right edge -> dropdown" },
  { op: "paragraph", line: "stacked squiggly lines inside    -> paragraph" },
  { op: "search_bar", line: "magnifier circle-and-stick at one end -> search_bar" },
  { op: "button", line: "one centered word/mark, small rect -> button" },
  { op: "text_input", line: "empty rect, wider than tall, label nearby -> text_input" },
  { op: "card_grid", line: "2-4 identical rects side by side -> card_grid" },
  { op: "table", line: "ruled grid with a distinct header row -> table" },
];

/** Pre-pivot vocabulary.md §3, verbatim-ish. Static rules for every wave. */
const DISAMBIGUATION_RULES = `DISAMBIGUATION RULES

The master key for structural elements: the wireframe vocabulary is
RECTANGLES DISAMBIGUATED BY CONTAINED MARKS —
{{MASTER_KEY}}

The squiggle family (the hardest confusions):
- Curvature: waves are ARCS; zigzags/mountains are STRAIGHT segments.
- Amplitude & count: mountains = 1-3 big peaks; zigzag = many uniform peaks;
  waves = repeated crests, often stacked rows.
- Context: a squiggle INSIDE or BESIDE a rectangle is text (paragraph);
  a long, free-floating squiggle at a section boundary is a wave_divider.

Position priors (real signal): suns/moons/stars/clouds cluster in the upper
region or page corners (a quarter-circle wedged in a corner is almost always a
sun); mountains/grass/waves anchor low; widgets live inside frames; navbar
candidates hug y~0; footers hug the bottom edge.

Radial-object key: central circle + line rays pointing outward = sun; sharp
self-intersecting zigzag with no interior circle = star; closed-loop petals =
flower. If a radial object is not itself in the vocabulary above, do NOT force
it into another type — omit it (but scattered small 4-point asterisks near text
ARE the "sparkles" op when that op is in the vocabulary).

Anti-signal: stroke DIRECTION is cultural noise (86% of US users draw circles
counterclockwise, ~80% of Japanese clockwise) — classify on final geometry
only, never on stroke order or stroke direction.`;

const OUTPUT_RULES = `OUTPUT RULES

- Respond with JSON only, matching the response schema: {"detections": [...]}.
- One detection per recognized element. For each detection give AT MOST 3
  candidates, RANKED by descending confidence (each confidence in 0..1).
- Candidate "type" values MUST come from the vocabulary list above — never
  invent a type outside it.
- "stroke_ids": the ink this detection claims. Use ONLY stroke ids that appear
  in the stroke manifest. Group all strokes that form one element into one
  detection. A stroke id may appear in AT MOST ONE detection across the whole
  output.
- Strokes you cannot recognize as any vocabulary type are OMITTED, never
  guessed. An empty "detections" array is a valid answer.
- "label_text": handwritten/legible text read inside or immediately beside the
  element (e.g. the word on a button), or null if there is none. Always emit
  the field; null is the explicit "no text" answer.
- "bbox": advisory only — a rough {x, y, width, height} union of the claimed
  strokes in screenshot pixels. You classify; you never place. Downstream code
  recomputes geometry from the real ink.
- "style_hints" (optional): "colors" = ink colors observed (hex/CSS strings),
  "fill" = e.g. "dark", "solid", "none". A dark-filled rectangle is a strong
  night_sky signal when that op is in the vocabulary.`;

/**
 * Legacy: build the component-classification prompt for a given op whitelist.
 *
 * @param opIds active vocabulary (wave 1: the shapes-v1 16 — see PHASE1_OPS;
 *              wave 2: the full 66-op set). Order is preserved.
 */
export function buildVisionPrompt(opIds: string[]): string {
  const vocabLines = opIds.map((op) => {
    const def = LABELS_BY_OP.get(op);
    return def ? `- ${op}: ${def.sketchHint}` : `- ${op}`;
  });

  const activeOps = new Set(opIds);
  const masterKey = MASTER_KEY_LINES.filter((e) => activeOps.has(e.op))
    .map((e) => "  " + e.line)
    .join("\n");

  return [
    `ROLE

You are the vision layer ("the eyes") of baio, a sketch-to-website tool. You
receive a screenshot of hand-drawn ink on a wireframe canvas plus a stroke
manifest, and you classify groups of strokes into UI component candidates.
You CLASSIFY — you never place. Your bboxes are advisory; geometry always
comes from the ink downstream.

INPUT

1. A screenshot (PNG) of the canvas ink.
2. A stroke manifest: JSON array of {"id", "bbox": {x, y, width, height},
   "point_count"} — one entry per stroke, in screenshot pixel coordinates.
   These ids are the ONLY legal values for "stroke_ids".`,
    `VOCABULARY (the only legal candidate types, with sketch signatures)

${vocabLines.join("\n")}`,
    DISAMBIGUATION_RULES.replace("{{MASTER_KEY}}", masterKey || "  (none active)"),
    OUTPUT_RULES,
  ].join("\n\n");
}

/** Legacy convenience: the wave-1 prompt over the core-18 vocabulary. */
export function buildWave1VisionPrompt(): string {
  return buildVisionPrompt([...PHASE1_OPS]);
}
