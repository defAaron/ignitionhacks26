/**
 * Builder-side types (ai-pipeline.md §3): the input the builder reads and the
 * client interface every builder backend (FreeSolo adapter, prompted baseline)
 * implements. The builder is TEXT-ONLY — BuilderInput is serialized to JSON
 * and is byte-for-byte the training input format (rule zero).
 */

import type {
  BBox,
  Candidate,
  ComponentsOutputV1,
  ShapeDetection,
  ShapeKind,
  ShapesOutput,
  StyleHints,
} from "../../types/schemas";

export interface Artboard {
  width: number;
  height: number;
}

/** Types + geometry only — the builder never sees full component internals. */
export interface TreeComponentSummary {
  id: string;
  op: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer?: "background" | "content" | "overlay";
}

/**
 * One normalized detection as the builder receives it: top-1 type +
 * confidence, alternates as context (ai-pipeline.md §3.2). The id is minted by
 * the normalizer (det_1 style) and is what every command's `from` answers.
 */
export interface BuilderDetection {
  id: string;
  /** Top-1 candidate type. */
  type: string;
  /** Top-1 candidate confidence (0..1) — drives the wait threshold. */
  confidence: number;
  /** Remaining ranked candidates, as context. */
  alternates?: Candidate[];
  /** Handwriting read inside the shape, or null. */
  label_text: string | null;
  /** Snapped to real stroke bounds by the normalizer. */
  bbox: BBox;
  style_hints?: StyleHints;
}

export interface BuilderInput {
  artboard: Artboard;
  tree_summary: TreeComponentSummary[];
  detections: BuilderDetection[];
}

export interface BuilderClient {
  buildComponents(input: BuilderInput): Promise<ComponentsOutputV1>;
}

// ===========================================================================
// SHAPES-FIRST PIVOT (2026-07-18) — builder input/client for shapes-v1.
// The legacy BuilderInput/BuilderClient above are retained for the
// flash-1784430057 run; new code targets these.
// ===========================================================================

/**
 * One normalized shape detection as the builder receives it (detection-shapes
 * contract fields + the normalizer-minted id every command's `from` answers).
 * `bbox` is context only (position priors: "upper region", "section boundary");
 * the builder must never echo coordinates back — its output has none.
 */
export interface ShapeBuilderDetection {
  id: string;
  /** Geometric kind — what the ink LOOKS like (ops are what to MAKE). */
  kind: ShapeKind;
  /** Single letter read alone inside a box, or null. */
  glyph: string | null;
  /** Handwriting read as content (word/phrase/sentence), or null. */
  text: string | null;
  /** Observed ink colors; empty when only default ink. */
  colors: string[];
  gradient_direction: ShapeDetection["gradient_direction"];
  /** 0..1 kind-classification confidence — drives the wait threshold. */
  confidence: number;
  /** Snapped to real stroke bounds by the normalizer. Advisory context. */
  bbox: BBox;
  /**
   * Wave-3 containment (shared/schemas/README.md §1.6): the id of the
   * immediate enclosing detection, or null when top-level. Assigned by the
   * normalizer's containment pass — never by a model.
   */
  parent: string | null;
  /** Wave-3.1: vision's diagram hint for scribble clusters (README §1.7). */
  composite?: string | null;
}

/**
 * Shapes-mode builder input. Serialized to JSON as the model's user message —
 * byte-for-byte the training input format (rule zero). No tree_summary: the
 * shapes pipeline has no replaces/tree-awareness in wave 1.
 */
export interface ShapeBuilderInput {
  artboard: Artboard;
  detections: ShapeBuilderDetection[];
}

/** Interface every shapes-mode builder backend implements. */
export interface ShapeBuilderClient {
  buildShapes(input: ShapeBuilderInput): Promise<ShapesOutput>;
}

/** Typed failure for any builder backend (transport, truncation, schema). */
export class BuilderError extends Error {
  constructor(message: string, readonly builder: string, readonly cause?: unknown) {
    super(message);
    this.name = "BuilderError";
  }
}
