/**
 * Zod mirrors of the frozen pipeline contracts in `shared/schemas/`.
 *
 * Rule zero (ai-pipeline.md §3.2): these definitions must stay structurally
 * identical to their paired .json files. If you touch an op list, a field, or
 * a required array here, make the same change in the JSON — and vice versa.
 *
 * Pairings:
 *   componentsOutputV1Schema  ↔  shared/schemas/components-v1.json   (legacy, pre-pivot)
 *   componentsOutputV2Schema  ↔  shared/schemas/components-v2.json   (legacy, pre-pivot)
 *   shapesOutputSchema        ↔  shared/schemas/shapes-v1.json       (shapes-first pivot)
 *   shapesOutputV2Schema      ↔  shared/schemas/shapes-v2.json       (shapes wave 1.5, +6 diagram ops)
 *   detectionSetSchema        ↔  shared/schemas/detection.json       (legacy, pre-pivot)
 *   shapeDetectionSetSchema   ↔  shared/schemas/detection-shapes.json (shapes-first pivot)
 *   labelerRecordSchema       ↔  shared/schemas/labeler-record.json
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Op whitelists (source of truth for ordering: docs/architecture/label-tree.md)
// ---------------------------------------------------------------------------

/** Wave-1 whitelist — the core 18. Mirrors the `op` enum in components-v1.json. */
export const OPS_V1 = [
  // structural (13)
  "navbar",
  "footer",
  "button",
  "heading",
  "paragraph",
  "image",
  "hero",
  "form",
  "text_input",
  "card",
  "card_grid",
  "search_bar",
  "dropdown",
  // decorative (5)
  "wave_divider",
  "night_sky",
  "sparkles",
  "blob",
  "aurora_gradient",
] as const;

/** Wave-2 whitelist — all 66 ops. Mirrors the `op` enum in components-v2.json. */
export const OPS_V2 = [
  // structural (25)
  "navbar",
  "footer",
  "button",
  "heading",
  "paragraph",
  "image",
  "hero",
  "form",
  "text_input",
  "card",
  "card_grid",
  "search_bar",
  "dropdown",
  "cta_banner",
  "tabs",
  "modal",
  "accordion",
  "carousel",
  "table",
  "sidebar",
  "testimonial",
  "logo_cloud",
  "newsletter_signup",
  "pricing_table",
  "image_gallery",
  // decorative (21)
  "wave_divider",
  "night_sky",
  "sparkles",
  "blob",
  "aurora_gradient",
  "dot_grid",
  "grid_lines",
  "hero_glow",
  "layered_waves",
  "hand_drawn_underline",
  "hand_drawn_arrow",
  "hand_drawn_highlight",
  "shape_scatter",
  "confetti",
  "concentric_rings",
  "squiggle_accents",
  "landscape_silhouette",
  "tiled_pattern",
  "noise_grain",
  "topo_contours",
  "low_poly_mesh",
  // diagrams (20)
  "bar_chart",
  "venn_diagram",
  "flowchart",
  "timeline",
  "line_chart",
  "pie_chart",
  "table_grid",
  "org_chart",
  "quadrant_chart",
  "scatter_plot",
  "funnel_chart",
  "cycle_diagram",
  "pyramid_chart",
  "coordinate_plane",
  "mind_map",
  "gantt_chart",
  "sequence_diagram",
  "block_diagram",
  "state_diagram",
  "er_diagram",
] as const;

export type OpV1 = (typeof OPS_V1)[number];
export type OpV2 = (typeof OPS_V2)[number];

// ---------------------------------------------------------------------------
// components-v1.json / components-v2.json — builder output
// (identical shape; only the op enum differs)
// ---------------------------------------------------------------------------

/**
 * Wait-command: calibrated abstention on one detection.
 * Mirrors `wait_command` in components-v1.json / components-v2.json.
 */
export const waitCommandSchema = z
  .object({
    op: z.literal("wait"),
    from: z.string(),
    reason: z.string(),
  })
  .strict();

/** Builds the op-command schema for a wave's whitelist (shape is wave-independent). */
function makeOpCommandSchema<T extends readonly [string, ...string[]]>(ops: T) {
  return z
    .object({
      op: z.enum(ops),
      id: z.string(),
      from: z.string(),
      layer: z.enum(["background", "content", "overlay"]),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      label: z.string().optional(),
      // Open object at the grammar level; per-op keys are domain-validator
      // conventions (see shared/schemas/README.md).
      params: z.record(z.unknown()).optional(),
      replaces: z.string().optional(),
    })
    .strict();
}

/** Mirrors `op_command` in components-v1.json. */
export const opCommandV1Schema = makeOpCommandSchema(OPS_V1);
/** Mirrors `op_command` in components-v2.json. */
export const opCommandV2Schema = makeOpCommandSchema(OPS_V2);

/** One command (op or wait), wave-1 vocabulary. Paired: components-v1.json. */
export const componentCommandV1Schema = z.union([opCommandV1Schema, waitCommandSchema]);
/** One command (op or wait), wave-2 vocabulary. Paired: components-v2.json. */
export const componentCommandV2Schema = z.union([opCommandV2Schema, waitCommandSchema]);

/** Full builder output, wave 1. Paired: shared/schemas/components-v1.json. */
export const componentsOutputV1Schema = z
  .object({
    schema_version: z.literal("1.0"),
    components: z.array(componentCommandV1Schema),
  })
  .strict();

/** Full builder output, wave 2. Paired: shared/schemas/components-v2.json. */
export const componentsOutputV2Schema = z
  .object({
    schema_version: z.literal("1.0"),
    components: z.array(componentCommandV2Schema),
  })
  .strict();

export type OpCommandV1 = z.infer<typeof opCommandV1Schema>;
export type OpCommandV2 = z.infer<typeof opCommandV2Schema>;
export type WaitCommand = z.infer<typeof waitCommandSchema>;
export type ComponentCommandV1 = z.infer<typeof componentCommandV1Schema>;
export type ComponentCommandV2 = z.infer<typeof componentCommandV2Schema>;
export type ComponentsOutputV1 = z.infer<typeof componentsOutputV1Schema>;
export type ComponentsOutputV2 = z.infer<typeof componentsOutputV2Schema>;

/**
 * Unqualified aliases point at the wave-2 (full-vocabulary) types: v1's op enum
 * is a strict subset of v2's, so every valid v1 value is assignable to these.
 * Use the V1 types when a code path must be wave-1-strict.
 */
export type ComponentCommand = ComponentCommandV2;
export type ComponentsOutput = ComponentsOutputV2;

// ---------------------------------------------------------------------------
// detection.json — vision output
// ---------------------------------------------------------------------------

/** Mirrors `bbox` in detection.json (and `guide_bbox` in labeler-record.json). */
export const bboxSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .strict();

/** Mirrors `candidate` in detection.json. */
export const candidateSchema = z
  .object({
    // Free string at the grammar level; the normalizer whitelist rejects strays.
    type: z.string(),
    confidence: z.number(),
  })
  .strict();

/** Mirrors `style_hints` in detection.json. */
export const styleHintsSchema = z
  .object({
    colors: z.array(z.string()).optional(),
    fill: z.string().optional(),
  })
  .strict();

/** One detection. Mirrors `detection` in shared/schemas/detection.json. */
export const detectionSchema = z
  .object({
    stroke_ids: z.array(z.string()).min(1),
    candidates: z.array(candidateSchema).min(1).max(3),
    label_text: z.string().nullable(),
    bbox: bboxSchema,
    style_hints: styleHintsSchema.optional(),
  })
  .strict();

/** Full vision output. Paired: shared/schemas/detection.json. */
export const detectionSetSchema = z
  .object({
    detections: z.array(detectionSchema),
  })
  .strict();

export type BBox = z.infer<typeof bboxSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type StyleHints = z.infer<typeof styleHintsSchema>;
export type Detection = z.infer<typeof detectionSchema>;
export type DetectionSet = z.infer<typeof detectionSetSchema>;

// ---------------------------------------------------------------------------
// labeler-record.json — labeling-window gold data
// ---------------------------------------------------------------------------

/** Mirrors `point` in labeler-record.json. `t` = ms timestamp, optional. */
export const strokePointSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    t: z.number().optional(),
  })
  .strict();

/** Mirrors `stroke` in labeler-record.json. */
export const strokeSchema = z
  .object({
    id: z.string(),
    points: z.array(strokePointSchema).min(1),
    color: z.string(),
    width: z.number(),
  })
  .strict();

/** One labeling record. Paired: shared/schemas/labeler-record.json. */
export const labelerRecordSchema = z
  .object({
    id: z.string(),
    // The op being drawn. Source of truth: lib/labeler/labels.ts (wave-evolving,
    // menu-selected in the UI — enum-level typo-proofing unnecessary and was two
    // vocabulary generations stale).
    label: z.string(),
    phase: z.union([z.literal(1), z.literal(2)]),
    split: z.enum(["calibration", "golden"]),
    guide_bbox: bboxSchema,
    canvas: z
      .object({
        width: z.number(),
        height: z.number(),
      })
      .strict(),
    strokes: z.array(strokeSchema),
    colors_used: z.array(z.string()),
    style_prompt: z.enum(["sloppy", "neat", "free"]),
    png_path: z.string(),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type StrokePoint = z.infer<typeof strokePointSchema>;
export type Stroke = z.infer<typeof strokeSchema>;
export type LabelerRecord = z.infer<typeof labelerRecordSchema>;

// ===========================================================================
// SHAPES-FIRST PIVOT (2026-07-18)
// The canvas primitive is the SHAPE, not the website component. The builder
// outputs NO coordinates — geometry always derives deterministically from the
// source strokes (centroid + extents; smoothed path for freeform). The model
// outputs only op + params + a snap policy.
// Everything above this line is the pre-pivot contract, retained for the
// flash-1784430057 run. New code targets the schemas below.
// ===========================================================================

// ---------------------------------------------------------------------------
// shapes-v1.json — builder output (shapes wave 1)
// ---------------------------------------------------------------------------

/**
 * Shapes wave-1 whitelist — 16 ops. Mirrors the `op` enum in shapes-v1.json.
 * (`wait` is a separate command variant, not an op — same pattern as
 * components-v1.)
 */
export const OPS_SHAPES_V1 = [
  // base shapes (6)
  "rect",
  "ellipse",
  "line",
  "arrow",
  "text",
  "smooth_path",
  // glyph components (6): box + single letter → semantic component
  "image", // box + i
  "form", // box + f
  "button", // box + b
  "navbar", // box + n
  "video", // box + v
  "placeholder", // box + ? — RETAINED IN THE GRAMMAR for adapter/back-compat,
  // but repurposed away in the runtime: the interpretation layer coerces any
  // emitted `placeholder` to `rect` (lib/interpretation/pipeline.ts), so it is
  // never a producible element. Kept here so the frozen adapter grammar still
  // validates it (no retrain, no grammar break). The box + p PAGE glyph is a
  // deterministic post-model normalization keyed on the detection glyph
  // (lib/recognize.ts) — intentionally NOT an op in this frozen enum.
  // decorative (4)
  "wave_divider",
  "night_sky",
  "sparkles",
  "aurora_gradient",
] as const;

export type OpShapesV1 = (typeof OPS_SHAPES_V1)[number];

/**
 * Shapes wave-1.5 diagram additions (6): multi-stroke diagram composites that
 * arrive from vision as a SINGLE kind="scribble" detection; the builder maps
 * them via bbox/color signatures (POLICY in lib/datagen/scenes.ts).
 */
export const OPS_SHAPES_V2_DIAGRAMS = [
  "bar_chart",
  "pie_chart",
  "venn_diagram",
  "timeline",
  "periodic_table",
  "atomic_structure",
] as const;

export type OpShapesV2Diagram = (typeof OPS_SHAPES_V2_DIAGRAMS)[number];

/**
 * Shapes wave-1.5 whitelist — 22 ops (the shapes-v1 16 + the 6 diagram ops).
 * Mirrors the `op` enum in shapes-v2.json. v1's enum is a strict subset of
 * v2's, so any valid v1 document is also a valid v2 document.
 */
export const OPS_SHAPES_V2 = [...OPS_SHAPES_V1, ...OPS_SHAPES_V2_DIAGRAMS] as const;

export type OpShapesV2 = (typeof OPS_SHAPES_V2)[number];

/**
 * Snap policies — the only geometry influence the model has. Everything else
 * derives from ink. Mirrors the `snap` enum in shapes-v1.json. Default: none.
 */
export const SNAP_POLICIES_V1 = [
  "none",
  "full_width_top",
  "full_width_bottom",
  "full_width",
  "straighten_h",
  "straighten_v",
  "square",
  "center_in_region",
] as const;

export type SnapPolicy = (typeof SNAP_POLICIES_V1)[number];

/**
 * Shape-command: "make this stroke-set crisp as <op>". No x/y/width/height —
 * geometry from ink, semantics from the model, precision from code.
 * Mirrors `shape_command` in shapes-v1.json.
 */
export const shapeOpCommandSchema = z
  .object({
    op: z.enum(OPS_SHAPES_V1),
    from: z.string(),
    // Open object at the grammar level; conventions (fill, gradient, stroke,
    // text, label, seed, decorative knobs) documented in shared/schemas/README.md.
    params: z.record(z.unknown()).optional(),
    snap: z.enum(SNAP_POLICIES_V1).optional(),
  })
  .strict();

/** One command (shape or wait). Paired: shapes-v1.json. */
export const shapeCommandSchema = z.union([shapeOpCommandSchema, waitCommandSchema]);

/** Full builder output, shapes wave 1. Paired: shared/schemas/shapes-v1.json. */
export const shapesOutputSchema = z
  .object({
    schema_version: z.literal("shapes-1.0"),
    components: z.array(shapeCommandSchema),
  })
  .strict();

// ---------------------------------------------------------------------------
// shapes-v2.json — builder output (shapes wave 1.5: +6 diagram ops)
// Byte-identical in shape to v1; ONLY the op enum differs (16 -> 22).
// schema_version stays "shapes-1.0" — contract revision, not wave (the wave is
// which file/whitelist is enforced; components-v1/v2 precedent).
// ---------------------------------------------------------------------------

/** Mirrors `shape_command` in shapes-v2.json (22-op enum). */
export const shapeOpCommandV2Schema = z
  .object({
    op: z.enum(OPS_SHAPES_V2),
    from: z.string(),
    // Open object at the grammar level; conventions (fill, gradient, stroke,
    // text, label, seed, decorative + diagram knobs) in shared/schemas/README.md.
    params: z.record(z.unknown()).optional(),
    snap: z.enum(SNAP_POLICIES_V1).optional(),
  })
  .strict();

/** One command (shape or wait), wave-1.5 vocabulary. Paired: shapes-v2.json. */
export const shapeCommandV2Schema = z.union([shapeOpCommandV2Schema, waitCommandSchema]);

/** Full builder output, shapes wave 1.5. Paired: shared/schemas/shapes-v2.json. */
export const shapesOutputV2Schema = z
  .object({
    schema_version: z.literal("shapes-1.0"),
    components: z.array(shapeCommandV2Schema),
  })
  .strict();

export type ShapeOpCommandV1 = z.infer<typeof shapeOpCommandSchema>;
export type ShapeCommandV1 = z.infer<typeof shapeCommandSchema>;
export type ShapesOutputV1 = z.infer<typeof shapesOutputSchema>;
export type ShapeOpCommandV2 = z.infer<typeof shapeOpCommandV2Schema>;
export type ShapeCommandV2 = z.infer<typeof shapeCommandV2Schema>;
export type ShapesOutputV2 = z.infer<typeof shapesOutputV2Schema>;

/**
 * Unqualified aliases point at the wave-1.5 (full-vocabulary) types: v1's op
 * enum is a strict subset of v2's, so every valid v1 value is assignable to
 * these. Use the V1 types when a code path must be wave-1-strict.
 */
export type ShapeOpCommand = ShapeOpCommandV2;
export type ShapeCommand = ShapeCommandV2;
export type ShapesOutput = ShapesOutputV2;

// ---------------------------------------------------------------------------
// detection-shapes.json — vision output (shapes-first)
// ---------------------------------------------------------------------------

/**
 * Geometric kinds — what the ink LOOKS like. Ops are semantic — what to MAKE.
 * The builder maps kind + glyph + context → op. Mirrors the `kind` enum in
 * detection-shapes.json.
 */
export const SHAPE_KINDS = [
  "rect",
  "ellipse",
  "line",
  "arrow",
  "scribble",
  "smooth_path",
  "text_writing",
] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** One shape detection. Mirrors `detection` in shared/schemas/detection-shapes.json. */
export const shapeDetectionSchema = z
  .object({
    stroke_ids: z.array(z.string()).min(1),
    kind: z.enum(SHAPE_KINDS),
    // Single character read alone inside a box, or null. Required-but-nullable:
    // the model must always decide (a word is `text`, not a glyph).
    glyph: z.string().nullable(),
    // Handwriting read as content (word/sentence), or null.
    text: z.string().nullable(),
    // Observed ink colors (hex/CSS strings); empty array if only default ink.
    colors: z.array(z.string()),
    gradient_direction: z.enum(["down", "right", "diagonal"]).nullable(),
    // Diagram-shaped cluster hint (wave 1.5) — advisory, a glyph for diagrams.
    // Optional so pre-hint outputs and forced-mode synthesis still parse.
    composite: z.enum(OPS_SHAPES_V2_DIAGRAMS).nullable().optional(),
    confidence: z.number(),
    // Advisory only — the normalizer overwrites it with real stroke bounds.
    bbox: bboxSchema,
  })
  .strict();

/** Full vision output, shapes-first. Paired: shared/schemas/detection-shapes.json. */
export const shapeDetectionSetSchema = z
  .object({
    detections: z.array(shapeDetectionSchema),
  })
  .strict();

export type ShapeDetection = z.infer<typeof shapeDetectionSchema>;
export type ShapeDetectionSet = z.infer<typeof shapeDetectionSetSchema>;

// ---------------------------------------------------------------------------
// shapes-v3.json — builder output (shapes wave 3: CONTAINMENT)
// The OUTPUT is byte-identical to v2 — same 22-op enum, same {op, from,
// params?, snap?} | wait command shape, zero coordinates. Wave 3's change is
// INPUT-side only: builder-input detections gain a normalizer-assigned
// `parent: <detection_id> | null` (deterministic containment pass in
// lib/interpretation/normalize.ts — geometry is code's job, vision never
// reports it), and the 1:1 rule becomes one command per TOP-LEVEL
// (parent === null) detection; children route into the parent command's
// params and emit no commands of their own (domain-validator rule, not
// grammar). shapes-v3.json exists so wave-3 training/serving configs
// (structured_outputs, response_format) reference the wave unambiguously.
// ---------------------------------------------------------------------------

/** Wave-3 whitelist ≡ the wave-1.5 22 ops (no vocabulary change in wave 3). */
export const OPS_SHAPES_V3 = OPS_SHAPES_V2;
export type OpShapesV3 = OpShapesV2;

/** v3 output ≡ v2 output (explicit re-exports, not copies — structural
 * identity is the contract). Paired: shared/schemas/shapes-v3.json. */
export const shapeOpCommandV3Schema = shapeOpCommandV2Schema;
export const shapeCommandV3Schema = shapeCommandV2Schema;
export const shapesOutputV3Schema = shapesOutputV2Schema;

export type ShapeOpCommandV3 = ShapeOpCommandV2;
export type ShapeCommandV3 = ShapeCommandV2;
export type ShapesOutputV3 = ShapesOutputV2;

/**
 * Wave-3 builder-INPUT detection — the rule-zero parity mirror for the
 * serialized `detections[]` entries the wave-3 builder reads (training inputs
 * must be byte-for-byte this shape). Everything from ShapeBuilderDetection
 * (lib/models/types.ts) plus `parent`, REQUIRED-nullable on the wave-3 input:
 * the model must always see the containment answer, null being the explicit
 * "top-level" value. `parent` is assigned by the normalizer's deterministic
 * containment pass — never by the vision layer (detection-shapes.json is
 * unchanged and gains no field).
 */
export const shapeBuilderDetectionV3Schema = z
  .object({
    id: z.string(),
    kind: z.enum(SHAPE_KINDS),
    glyph: z.string().nullable(),
    text: z.string().nullable(),
    colors: z.array(z.string()),
    gradient_direction: z.enum(["down", "right", "diagonal"]).nullable(),
    confidence: z.number(),
    bbox: bboxSchema,
    /** Minted id (det_N) of the immediate (deepest) enclosing detection, or null. */
    parent: z.string().nullable(),
  })
  .strict();

/** Wave-3 builder input: what gets serialized as the model's user message. */
export const shapeBuilderInputV3Schema = z
  .object({
    artboard: z.object({ width: z.number(), height: z.number() }).strict(),
    detections: z.array(shapeBuilderDetectionV3Schema),
  })
  .strict();

export type ShapeBuilderDetectionV3 = z.infer<typeof shapeBuilderDetectionV3Schema>;
export type ShapeBuilderInputV3 = z.infer<typeof shapeBuilderInputV3Schema>;
