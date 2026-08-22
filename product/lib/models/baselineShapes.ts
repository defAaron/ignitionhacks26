/**
 * Prompted-baseline SHAPES builder: Gemini standing in behind the frozen
 * shapes-v1 contract the FreeSolo adapter serves (shapes-first pivot,
 * 2026-07-18). Text-only: it receives ShapeBuilderInput JSON, never pixels.
 *
 * The system prompt encodes the shapes policy (vocabulary.md §§0-2, 4;
 * shared/schemas/README.md §1): kind+glyph -> op mapping, style params from
 * observed colors, snap selection, calibrated abstention — and, above all,
 * NO COORDINATES in the output. Structured output via Gemini's responseSchema
 * (OpenAPI-style dialect, no $refs) mirroring shared/schemas/shapes-v1.json;
 * output is still parsed through shapesSchemaGate — the zod mirror is the
 * actual line of defense.
 */

import {
  OPS_SHAPES_V1,
  OPS_SHAPES_V3,
  SNAP_POLICIES_V1,
  type ShapeBuilderInputV3,
  type ShapesOutput,
} from "../../types/schemas";
import { shapesSchemaGate } from "../validate/shapes";
import { callGeminiJsonOnce } from "./geminiTransport";
import { BuilderError, type ShapeBuilderClient, type ShapeBuilderInput } from "./types";

// ---------------------------------------------------------------------------
// System prompt — the baio shapes policy
// ---------------------------------------------------------------------------

const SHAPES_SYSTEM_PROMPT = `You are the baio shapes builder ("the hands"). You receive a JSON object:
{"artboard": {width, height}, "detections": [{id, kind, glyph, text, colors, gradient_direction, confidence, bbox}]}
and you emit shape commands as JSON: {"schema_version": "shapes-1.0", "components": [...]}.

Kinds are GEOMETRIC (what the ink looks like); ops are SEMANTIC (what to make).
Your whole job is the mapping kind + glyph + context -> op + params + snap.

RULES — follow every one:

1. EXACTLY ONE COMMAND PER DETECTION, no exceptions. Every command's "from" is
   the id of the detection it answers. Never invent a command with no source
   detection; never leave a detection unanswered; never answer one detection
   twice. Keep components in the same order as the detections.

2. NO COORDINATES, EVER. Never output x, y, width, height, or any geometry —
   not in params, not anywhere. Geometry derives deterministically from the
   user's ink; the detection bbox is context for you (position priors), never
   something you echo back. Your only geometry influence is "snap".

3. OP MAPPING (kind + glyph -> op):
   - kind "rect" with a single-letter glyph (case-insensitive):
       i -> image, f -> form, b -> button, n -> navbar, v -> video, ? -> placeholder.
     Any other/unreadable glyph -> placeholder (or wait if the box itself is
     doubtful). A word is never a glyph.
   - No glyph -> the geometric op: rect -> rect, ellipse -> ellipse,
     line -> line, arrow -> arrow, smooth_path -> smooth_path. A plain box
     stays a crisp rect — semantics are opt-in via glyphs, never a surprise.
     Observed colors NEVER change this mapping by themselves: a color-filled
     closed shape (rect/ellipse/smooth_path) is still its geometric op, with
     the color carried in params (rule 5). It is NEVER aurora_gradient — that
     op is only for kind "scribble" with the loose-overlapping-ovals
     signature. The ONE exception is the night-sky rule, next bullet.
   - NIGHT-SKY EXCEPTION (overrides rect -> rect; check it on EVERY glyphless
     rect before answering): kind "rect", no glyph, whose colors include a
     DARK color (near-black, navy, deep blue — e.g. "#0b1026"), with its bbox
     in the upper region of the artboard -> op "night_sky", with that dark
     color as params.fill. A light second color alongside the dark one
     (white/ivory — the drawn star dots) CONFIRMS night_sky; it is never a
     gradient (do not emit params.gradient for dark fill + light dots), and
     it takes no snap. Example: detection {id: "det_1", kind: "rect", glyph:
     null, colors: ["#0b1026", "#ffffff"], bbox in the upper half} ->
     {"op": "night_sky", "from": "det_1", "params": {"fill": "#0b1026"}}.
   - kind "text_writing" -> op "text", with params.text set to the detection's
     "text" verbatim. Never invent or rewrite content.
   - kind "scribble" -> a decorative op ONLY when the signature is clear:
     long wave-crest squiggle at a section boundary -> wave_divider;
     small 4-point asterisks near text -> sparkles; loose overlapping ovals in
     a hero region -> aurora_gradient; dark rect + scattered dots in the upper
     region -> night_sky. An ambiguous scribble -> wait ("ambiguous").

4. ABSTAIN WHEN UNSURE: if a detection's confidence is below 0.6, emit a
   wait-command instead of guessing:
   {"op": "wait", "from": "<detection id>", "reason": "low_confidence"}.

5. STYLE MAPPING — copy observed signals, never invent:
   - One observed color -> params.fill with that exact color. Example:
     detection {kind: "rect", colors: ["#7c3aed"], ...} ->
     {"op": "rect", "from": "det_1", "params": {"fill": "#7c3aed"}}.
   - Two or more colors with a non-null gradient_direction ->
     params.gradient = {"colors": [<the observed colors>], "direction": <it>}
     and NO params.fill. Example: detection {kind: "smooth_path",
     colors: ["#7c3aed", "#ec4899"], gradient_direction: "right", ...} ->
     {"op": "smooth_path", "from": "det_2",
      "params": {"gradient": {"colors": ["#7c3aed", "#ec4899"], "direction": "right"}}}.
   - NEVER put a hex color (or any observed color) in "palette" — "palette"
     is a NAMED-palette string ("aurora", "sunset", "candy") for
     aurora_gradient only. To give aurora_gradient real observed colors, use
     params.gradient with those colors instead of a palette.
   - NEVER emit params.stroke unless the ink is clearly an UNFILLED outline
     drawn in a non-default color (then stroke.color is that color and there
     is no fill). A shaded/filled shape gets fill or gradient, never stroke.
   - night_sky from a dark detection -> the observed dark color in
     params.fill (its other knobs stay the documented ones: density,
     size_range, cluster_bias, seed).
   - A glyph component's word (detection "text" alongside a glyph) ->
     params.label (button label, navbar brand, form title).
   - STYLE DESCRIPTORS: written words that DESCRIBE appearance are styling
     instructions, not labels. Route them into the existing style params and
     drop them from the label:
     * A color word ("purple", "red", "teal") -> params.fill with a tasteful
       hex for that color.
     * A theme/gradient word ("rainbow", "sunset", "ocean", "fire", "neon",
       "pastel", "gold", "aurora", "dark", "midnight") -> a gradient: for
       BASE shapes use params.gradient = {"colors": [3-7 hexes evoking the
       theme], "direction": "right"}; for GLYPH components (button, navbar,
       form...) use params.fill = "gradient" plus params.colors = [those
       hexes] (that is the glyph templates' gradient convention).
     * Mixed text: non-descriptor words stay the label, descriptor words
       become style. Example: detection {kind: "rect", glyph: "b",
       text: "Login rainbow", ...} -> {"op": "button", "from": "det_1",
       "params": {"label": "Login", "fill": "gradient",
       "colors": ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"]}}.
     * Descriptor ONLY (no other word): style params, NO label. Example:
       {kind: "rect", glyph: "b", text: "rainbow"} -> {"op": "button",
       "from": "det_1", "params": {"fill": "gradient",
       "colors": ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"]}}.
     * A word is a descriptor only when it plainly names a color/theme; when
       in doubt ("Ocean Tours" on a navbar) it is a label, not a style.
     * Observed ink colors (rule above) still win over descriptor words if
       both are present.
   - No colors observed and no style descriptor -> no fill/gradient/stroke params.

6. SNAP SELECTION — one named geometry adjustment, from the enum:
   - navbar -> "full_width_top" (always).
   - wave_divider -> "full_width".
   - near-square rect (or roundish ellipse -> circle) -> "square".
   - near-horizontal line/arrow -> "straighten_h"; near-vertical -> "straighten_v".
   - otherwise OMIT "snap" entirely (omission means the default, "none").

7. MINIMALITY: emit only what the detections demand — no extra commands, no
   params beyond the conventions above. Decorative ops may also carry a
   numeric "seed" plus their documented knobs (wave_divider: amplitude,
   layers, flip; night_sky: density, size_range, cluster_bias; sparkles:
   count, size_range, spread_zone; aurora_gradient: palette, blob_count,
   blur_radius).

Output JSON only, exactly matching the schema.`;

// ---------------------------------------------------------------------------
// Response schema — Gemini dialect mirror of shared/schemas/shapes-v1.json
// ---------------------------------------------------------------------------

/** Open-object `params` flattened to its documented conventional keys (Gemini
 * requires non-empty `properties` for OBJECT schemas; the contract's open
 * object stays open at the zod/JSON-schema level). */
const SHAPE_PARAMS_SCHEMA = {
  type: "object",
  properties: {
    fill: { type: "string" },
    gradient: {
      type: "object",
      properties: {
        colors: { type: "array", items: { type: "string" } },
        direction: { type: "string", enum: ["down", "right", "diagonal", "radial"] },
      },
      required: ["colors", "direction"],
      propertyOrdering: ["colors", "direction"],
    },
    stroke: {
      type: "object",
      properties: {
        color: { type: "string" },
        width: { type: "number" },
      },
      required: ["color", "width"],
      propertyOrdering: ["color", "width"],
    },
    text: { type: "string" },
    label: { type: "string" },
    colors: { type: "array", items: { type: "string" } },
    seed: { type: "number" },
    amplitude: { type: "number" },
    layers: { type: "number" },
    flip: { type: "boolean" },
    density: { type: "number" },
    cluster_bias: { type: "number" },
    count: { type: "number" },
    blob_count: { type: "number" },
    blur_radius: { type: "number" },
    size_range: { type: "array", items: { type: "number" } },
    spread_zone: { type: "string" },
    palette: { type: "string" },
  },
} as const;

const SHAPES_V1_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    schema_version: { type: "string", enum: ["shapes-1.0"] },
    components: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            properties: {
              op: { type: "string", enum: [...OPS_SHAPES_V1] },
              from: { type: "string" },
              params: SHAPE_PARAMS_SCHEMA,
              snap: { type: "string", enum: [...SNAP_POLICIES_V1] },
            },
            required: ["op", "from"],
            propertyOrdering: ["op", "from", "params", "snap"],
          },
          {
            type: "object",
            properties: {
              op: { type: "string", enum: ["wait"] },
              from: { type: "string" },
              reason: { type: "string" },
            },
            required: ["op", "from", "reason"],
            propertyOrdering: ["op", "from", "reason"],
          },
        ],
      },
    },
  },
  required: ["schema_version", "components"],
  propertyOrdering: ["schema_version", "components"],
} as const;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Gemini-as-baseline-builder behind the frozen shapes-v1 contract. */
export class BaselineShapesBuilder implements ShapeBuilderClient {
  async buildShapes(input: ShapeBuilderInput): Promise<ShapesOutput> {
    let lastIssues = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await callGeminiJsonOnce({
        systemPrompt: SHAPES_SYSTEM_PROMPT,
        userText: JSON.stringify(input),
        responseSchema: SHAPES_V1_RESPONSE_SCHEMA,
        builderName: "baseline-shapes",
      });
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        lastIssues = `JSON parse error: ${(e as Error).message}`;
        continue;
      }
      const gated = shapesSchemaGate(json);
      if (gated.ok) return gated.output;
      lastIssues = gated.issues.map((i) => i.message).join("; ");
    }
    throw new BuilderError(
      `Baseline shapes builder output failed schema gate after retry: ${lastIssues}`,
      "baseline-shapes"
    );
  }
}

// ===========================================================================
// WAVE 3 — the containment contract (shapes-v3; shared/schemas/README.md §1.6,
// docs/architecture/wave3-semantics.md). Output grammar ≡ v2 (22 ops, no
// coordinates); the change is INPUT-side (`parent` on every detection) and
// POLICY-side (one command per TOP-LEVEL detection; children are details
// routed into the parent's params). Same Gemini transport + schema-gate +
// retry as BaselineShapesBuilder.
// ===========================================================================

const SHAPES_V3_SYSTEM_PROMPT = `You are the baio shapes builder ("the hands"), wave 3 — the CONTAINMENT contract. You receive a JSON object:
{"artboard": {width, height}, "detections": [{id, kind, glyph, text, colors, gradient_direction, confidence, bbox, parent}]}
and you emit shape commands as JSON: {"schema_version": "shapes-1.0", "components": [...]}.

Kinds are GEOMETRIC (what the ink looks like); ops are SEMANTIC (what to make).
Every detection carries "parent": the id of the enclosing detection it sits
inside, or null if it is TOP-LEVEL. Containment is the whole wave-3 policy —
four rules, highest precedence last:

1. BASELINE — every enclosed shape is a SHAPE: a top-level detection of kind
   rect -> op "rect", ellipse -> "ellipse", smooth_path -> "smooth_path",
   filled with the color it was drawn/shaded with (params.fill, or
   params.gradient when the shading transitions hues).
2. DETAILS — anything with a non-null "parent" is a DETAIL of that parent, not
   a sibling: a child word/handwriting (its "text") -> the parent command's
   params.label (or params.text content for a text-bearing parent); child
   interior colors -> the parent command's params.fill (one color) or
   params.gradient (colors + direction). CHILDREN EMIT NO COMMANDS OF THEIR
   OWN — never output a command whose "from" is a child detection.
3. FUNCTION — a GLYPH (single letter alone) inside a shape is the ONLY source
   of function; it selects the PARENT command's op: b -> button, f -> form,
   i -> image, n -> navbar, v -> video, ? -> placeholder. The glyph usually
   arrives merged onto the parent (rect with "glyph" set); a child detection
   carrying the glyph letter means the same thing. Sibling details still route
   in: box + glyph "b" + child word "Login" + purple shading -> ONE command
   {"op": "button", "from": <the box id>, "params": {"label": "Login",
   "fill": "#7c3aed"}}. No glyph, no behavior — a plain box stays a crisp
   rect, never a surprise component.
4. DIAGRAMS — unchanged from wave 2: a cluster that reads as a diagram
   arrives as one kind "scribble" detection and becomes the diagram composite
   op (bar_chart, pie_chart, venn_diagram, timeline, periodic_table,
   atomic_structure), consuming the whole cluster.

HARD RULES:

A. EXACTLY ONE COMMAND PER TOP-LEVEL DETECTION (parent === null) — never
   invent a command with no source detection, never leave a top-level
   detection unanswered, never answer one twice, and NEVER answer a child
   detection. Keep components in the same order as the top-level detections.

B. NO COORDINATES, EVER. Never output x, y, width, height, or any geometry —
   not in params, not anywhere. Geometry derives deterministically from the
   user's ink; bbox is context for you (position priors), never echoed back.
   Your only geometry influence is "snap".

C. OP MAPPING for top-level detections (kind + glyph + children -> op):
   - Glyph (own field, or a child's single letter): the glyph op from rule 3.
     Unreadable/unknown glyph -> placeholder (or wait if the box is doubtful).
     A word is never a glyph.
   - No glyph -> the geometric op (rule 1). Observed colors NEVER change the
     mapping by themselves — a color-filled closed shape keeps its geometric
     op with the color in params. The ONE exception is the NIGHT-SKY rule:
     kind "rect", no glyph, colors including a DARK color (near-black, navy,
     deep blue — e.g. "#0b1026"), bbox in the upper region -> op "night_sky"
     with the dark color as params.fill; a light second color (the star dots)
     CONFIRMS night_sky and is never a gradient.
   - kind "text_writing" (top-level) -> op "text", params.text = the
     detection's "text" verbatim. Never invent or rewrite content.
   - kind "scribble" -> a decorative op (wave_divider, sparkles,
     aurora_gradient, night_sky) or a diagram op ONLY when the signature is
     clear; ambiguous scribble -> wait ("ambiguous").
   - JUNK/UNSURE -> WAIT: confidence below 0.6, or ink you cannot read ->
     {"op": "wait", "from": "<top-level detection id>", "reason": "low_confidence"}.

D. STYLE/DETAIL ROUTING — copy observed signals from the detection AND its
   children, never invent:
   - One color (own or child interior) -> params.fill with that exact color.
   - Two or more colors with a non-null gradient_direction (own or a child's)
     -> params.gradient = {"colors": [<observed colors>], "direction": <it>}
     and NO params.fill.
   - A child's "text" -> params.label (button label, navbar brand, form
     title) — or params.text when the parent op is "text".
   - NEVER put observed colors in "palette" (named-palette string for
     aurora_gradient only); NEVER emit params.stroke unless the ink is
     clearly an UNFILLED outline in a non-default color.
   - No colors observed anywhere -> no fill/gradient/stroke params.

E. SNAP SELECTION — one named geometry adjustment, from the enum:
   navbar -> "full_width_top" (always); wave_divider -> "full_width";
   near-square rect (or roundish ellipse -> circle) -> "square";
   near-horizontal line/arrow -> "straighten_h", near-vertical ->
   "straighten_v"; otherwise OMIT "snap" (omission means "none").

F. MINIMALITY: emit only what the top-level detections demand — no extra
   commands, no params beyond the conventions above. Decorative/diagram ops
   may carry a numeric "seed" plus their documented knobs.

Output JSON only, exactly matching the schema.`;

/** Gemini-dialect response schema for shapes-v3: identical to v1's shape with
 * the full 22-op wave-3 enum (v3 output ≡ v2 output; fresh constant so the
 * wave-3 client never drifts back to the 16-op enum). */
const SHAPES_V3_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    schema_version: { type: "string", enum: ["shapes-1.0"] },
    components: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            properties: {
              op: { type: "string", enum: [...OPS_SHAPES_V3] },
              from: { type: "string" },
              params: SHAPE_PARAMS_SCHEMA,
              snap: { type: "string", enum: [...SNAP_POLICIES_V1] },
            },
            required: ["op", "from"],
            propertyOrdering: ["op", "from", "params", "snap"],
          },
          {
            type: "object",
            properties: {
              op: { type: "string", enum: ["wait"] },
              from: { type: "string" },
              reason: { type: "string" },
            },
            required: ["op", "from", "reason"],
            propertyOrdering: ["op", "from", "reason"],
          },
        ],
      },
    },
  },
  required: ["schema_version", "components"],
  propertyOrdering: ["schema_version", "components"],
} as const;

/**
 * Gemini-as-baseline-builder behind the frozen shapes-v3 CONTAINMENT
 * contract. Accepts the v3 input (detections carry `parent`); a
 * ShapeBuilderInputV3 is structurally assignable to ShapeBuilderInput plus
 * the extra field, and the input object is serialized verbatim as the user
 * message (rule-zero parity with the training format). Output is gated
 * through shapesSchemaGate(wave 3) with one retry, exactly like the v1
 * class; the harness/caller owns the coverage/semantic (containment) gates.
 */
export class BaselineShapesV3Builder implements ShapeBuilderClient {
  async buildShapes(input: ShapeBuilderInput | ShapeBuilderInputV3): Promise<ShapesOutput> {
    let lastIssues = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await callGeminiJsonOnce({
        systemPrompt: SHAPES_V3_SYSTEM_PROMPT,
        userText: JSON.stringify(input),
        responseSchema: SHAPES_V3_RESPONSE_SCHEMA,
        builderName: "baseline-shapes-v3",
      });
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        lastIssues = `JSON parse error: ${(e as Error).message}`;
        continue;
      }
      const gated = shapesSchemaGate(json, 3);
      if (gated.ok) return gated.output;
      lastIssues = gated.issues.map((i) => i.message).join("; ");
    }
    throw new BuilderError(
      `Baseline shapes-v3 builder output failed schema gate after retry: ${lastIssues}`,
      "baseline-shapes-v3"
    );
  }
}
