/**
 * The autocomplete pipeline core (ai-pipeline.md §§1-4), factored out of the
 * route so it is testable without HTTP:
 *
 *   strokes + png  ─▶ vision (or forced-op synthesis) ─▶ normalizeDetections
 *                  ─▶ builder (text-only, ShapeBuilderInput contract)
 *                  ─▶ validateShapes (fail-closed)
 *                  ─▶ applySnap + confidence tiering ─▶ AutocompleteResponse
 *
 * Degradation contract: model-side failures NEVER throw out of
 * `runAutocomplete` — they return { ok: false, reason }. Only malformed
 * bodies are the caller's (route's) 4xx concern, via `autocompleteBodySchema`.
 */

import { randomUUID } from "node:crypto";
import { applyStyleHints } from "./styleHints";
import { z } from "zod";

import {
  OPS_SHAPES_V1,
  OPS_SHAPES_V2_DIAGRAMS,
  strokeSchema,
  type OpShapesV1,
  type BBox,
  type ShapeCommand,
  type ShapeDetection,
  type ShapeDetectionSet,
  type ShapeKind,
  type ShapeOpCommand,
  type ShapesOutput,
  type Stroke,
} from "../../types/schemas";
import { analyzeInkShapes, type AnalyzeInkShapesArgs, type StrokeManifestEntry } from "../vision/client";
import { getShapeBuilder, type ShapeBuilderClient, type ShapeBuilderDetection } from "../models";
import { validateShapes, type ShapeValidationIssue } from "../validate/shapes";
import { classifyDiagram } from "./diagrams";
import {
  KIND_RECT_CORNERS_MAX,
  KIND_RECT_CORNERS_MIN,
  classifyClosedInk,
  normalizeDetections,
  type Canvas,
  type NormalizedDetection,
} from "./normalize";
import { applySnap } from "./snap";
import type { Pt } from "./rdp";

// ---------------------------------------------------------------------------
// Request contract (route zod-validates against this; 4xx on failure)
// ---------------------------------------------------------------------------

export const autocompleteBodySchema = z
  .object({
    /** Canvas-ink screenshot, base64 PNG (no data: prefix). Unused in forced mode. */
    png_base64: z.string(),
    canvas: z
      .object({ width: z.number().positive(), height: z.number().positive() })
      .strict(),
    /** Labeler stroke shape: {id, points: [{x, y, t?}], color, width}. */
    strokes: z.array(strokeSchema).min(1),
    /** Forced-component mode (PRD §6.4b): skip vision, guarantee this op. */
    forced_op: z.enum(OPS_SHAPES_V1).optional(),
  })
  .strict()
  .refine((b) => b.forced_op !== undefined || b.png_base64.length > 0, {
    message: "png_base64 is required unless forced_op is set",
    path: ["png_base64"],
  });

export type AutocompleteBody = z.infer<typeof autocompleteBodySchema>;

// ---------------------------------------------------------------------------
// Response contract
// ---------------------------------------------------------------------------

/** high >= 0.8 > medium >= 0.5 > low — from the DETECTION's kind confidence
 * (vision), never from the builder (ai-pipeline.md §3.2). */
export type ConfidenceTier = "high" | "medium" | "low";

export interface AutocompleteResultGeometry {
  bbox: BBox;
  path?: Pt[];
}

/**
 * One of the NEXT-TWO-BEST readings of the same ink (additive response field;
 * shared/schemas/README.md "kind correction + alternates"). Ranked
 * deterministically from the detection's measured ink-geometry scores — zero
 * extra model calls. The client renders an accepted alternate with the SAME
 * `geometry` the result already carries; no server round-trip needed.
 */
export interface AutocompleteAlternate {
  /** Alternate op to re-render this result's geometry as. */
  op: ShapeOpCommand["op"];
  /** Style params carried over from the primary command (fill/gradient/stroke). */
  params?: Record<string, unknown>;
  /** Short human-readable rationale, e.g. "keep as drawn" (choice-chip label). */
  note: string;
}

export interface AutocompleteResult {
  command: ShapeCommand;
  detection: {
    id: string;
    kind: ShapeKind;
    glyph: string | null;
    text: string | null;
    /** Observed ink colors (detection-shapes.json) — echoed for clients/debug. */
    colors: string[];
    gradient_direction: ShapeDetection["gradient_direction"];
    stroke_ids: string[];
    confidence: number;
  };
  /** Final geometry: ink-derived, with the command's snap policy applied. */
  geometry: AutocompleteResultGeometry;
  tier: ConfidenceTier;
  /** Next-two-best alternate interpretations, ranked deterministically from
   * ink geometry. Always present, length 0..2, never contains `command.op`. */
  alternates: AutocompleteAlternate[];
}

export type AutocompleteResponse =
  | { ok: true; request_id: string; results: AutocompleteResult[] }
  | {
      ok: false;
      request_id: string;
      reason: string;
      issues?: ShapeValidationIssue[];
    };

// ---------------------------------------------------------------------------
// Forced-component mode: synthesize the detection, skip vision entirely
// ---------------------------------------------------------------------------

/** Inverse of the builder's kind+glyph -> op book: which description would
 * make the builder choose this op (vocabulary.md §2/§4). */
const FORCED_OP_DESCRIPTION: Readonly<Record<OpShapesV1, { kind: ShapeKind; glyph: string | null }>> = {
  rect: { kind: "rect", glyph: null },
  ellipse: { kind: "ellipse", glyph: null },
  line: { kind: "line", glyph: null },
  arrow: { kind: "arrow", glyph: null },
  text: { kind: "text_writing", glyph: null },
  smooth_path: { kind: "smooth_path", glyph: null },
  image: { kind: "rect", glyph: "i" },
  form: { kind: "rect", glyph: "f" },
  button: { kind: "rect", glyph: "b" },
  navbar: { kind: "rect", glyph: "n" },
  video: { kind: "rect", glyph: "v" },
  placeholder: { kind: "rect", glyph: "?" },
  wave_divider: { kind: "scribble", glyph: null },
  night_sky: { kind: "scribble", glyph: null },
  sparkles: { kind: "scribble", glyph: null },
  aurora_gradient: { kind: "scribble", glyph: null },
};

const DEFAULT_INK = new Set(["#000", "#000000", "black"]);

function strokeBBox(s: Stroke): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of s.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function unionBBoxes(boxes: BBox[]): BBox {
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** One detection covering ALL strokes, kind/glyph matching the forced op,
 * confidence 1.0 — the pipeline proceeds from the normalizer as usual. */
function synthesizeForcedDetection(op: OpShapesV1, strokes: Stroke[]): ShapeDetectionSet {
  const { kind, glyph } = FORCED_OP_DESCRIPTION[op];
  const colors = [...new Set(strokes.map((s) => s.color))].filter(
    (c) => !DEFAULT_INK.has(c.toLowerCase())
  );
  const detection: ShapeDetection = {
    stroke_ids: strokes.map((s) => s.id),
    kind,
    glyph,
    text: null,
    colors,
    gradient_direction: null,
    confidence: 1.0,
    bbox: unionBBoxes(strokes.map(strokeBBox)),
  };
  return { detections: [detection] };
}

// ---------------------------------------------------------------------------
// Alternates — the next-two-best readings, ranked from ink geometry
// ---------------------------------------------------------------------------

/** Hard cap on alternates per result (the UI shows at most two choice chips). */
export const MAX_ALTERNATES = 2;

/** A rect primary offers an ellipse alternate when the outline's roundness
 * (perimeter²/(4π·area); 1 = circle, ~1.27 = square) is at most this —
 * "middling" roundness where both readings are plausible. Looser than the
 * normalizer's promotion threshold (1.2) on purpose: an alternate is an
 * offer, not a correction. */
export const ALT_ELLIPSE_ROUNDNESS_MAX = 1.35;

/** Glyph-derived component ops (box + letter): alternate back to the plain box.
 * `placeholder` is intentionally absent — it is coerced to `rect` before results
 * are built, so it is never a primary op here; `page` is absent too, as a page
 * op spawns a page object (not a re-renderable element) and offers no alternate. */
const GLYPH_COMPONENT_OPS: ReadonlySet<string> = new Set([
  "image", "form", "button", "navbar", "video",
]);

/** Decorative ops: the only honest alternate is the user's own path. */
const DECORATIVE_OPS: ReadonlySet<string> = new Set([
  "wave_divider", "night_sky", "sparkles", "aurora_gradient",
]);

const DIAGRAM_OPS: ReadonlySet<string> = new Set(OPS_SHAPES_V2_DIAGRAMS);

/** Style params that carry over to an alternate (never geometry — there is
 * none — and never op-specific knobs like `values` or `label`). */
function carriedStyleParams(command: ShapeCommand): Record<string, unknown> | undefined {
  if (command.op === "wait" || command.params === undefined) return undefined;
  const carried: Record<string, unknown> = {};
  for (const key of ["fill", "gradient", "stroke"] as const) {
    if (command.params[key] !== undefined) carried[key] = command.params[key];
  }
  return Object.keys(carried).length > 0 ? carried : undefined;
}

/**
 * Deterministic next-two-best alternates for one result. Pure ranking over
 * the detection's measured `kindScores` (normalize.ts) — no model calls.
 * Guarantees: ≤ MAX_ALTERNATES entries, primary op never repeated, no
 * duplicates. `wait` results get none (there is nothing to re-render).
 */
export function computeAlternates(
  command: ShapeCommand,
  det: NormalizedDetection
): AutocompleteAlternate[] {
  if (command.op === "wait") return [];
  const s = det.kindScores;
  const style = carriedStyleParams(command);
  const alt = (op: AutocompleteAlternate["op"], note: string, withStyle = true): AutocompleteAlternate => ({
    op,
    ...(withStyle && style ? { params: style } : {}),
    note,
  });
  const keepAsDrawn = alt("smooth_path", "keep as drawn");
  const candidates: AutocompleteAlternate[] = [];

  if (DECORATIVE_OPS.has(command.op) || DIAGRAM_OPS.has(command.op)) {
    // Decorative/diagram composites: only "keep as drawn".
    candidates.push(keepAsDrawn);
  } else if (GLYPH_COMPONENT_OPS.has(command.op)) {
    // Glyph components: the plain geometric box, then keep-as-drawn. (The old
    // `placeholder` alternate is gone — placeholder is no longer a producible
    // element.)
    candidates.push(alt("rect", "plain box (ignore the glyph)"));
    candidates.push(keepAsDrawn);
  } else {
    switch (command.op) {
      case "rect":
        if (s.closed && s.roundness <= ALT_ELLIPSE_ROUNDNESS_MAX) {
          candidates.push(alt("ellipse", "rounder reading of the same outline"));
        }
        candidates.push(keepAsDrawn);
        break;
      case "ellipse":
        if (s.closed && s.cornerCount >= KIND_RECT_CORNERS_MIN && s.cornerCount <= KIND_RECT_CORNERS_MAX) {
          candidates.push(alt("rect", "boxier reading of the same outline"));
        }
        candidates.push(keepAsDrawn);
        break;
      case "line": {
        // Closed ink read as a line: offer the enclosed promotion first.
        const closedKind = classifyClosedInk(s);
        if (closedKind === "rect" || closedKind === "ellipse") {
          candidates.push(alt(closedKind, "the stroke closes on itself"));
        }
        candidates.push(keepAsDrawn);
        break;
      }
      case "arrow":
        candidates.push(alt("line", "plain line (no arrowhead)"));
        candidates.push(keepAsDrawn);
        break;
      case "smooth_path": {
        if (s.closed) {
          // Closed freeform: offer the crisper enclosed readings, best fit first.
          const rectFit =
            s.cornerCount >= KIND_RECT_CORNERS_MIN && s.cornerCount <= KIND_RECT_CORNERS_MAX && s.axisAligned;
          const ellipseFit = s.roundness <= ALT_ELLIPSE_ROUNDNESS_MAX;
          if (rectFit) candidates.push(alt("rect", "boxy closed outline"));
          if (ellipseFit) candidates.push(alt("ellipse", "rounded closed outline"));
        } else {
          candidates.push(alt("line", "open stroke — straighten to a line"));
        }
        break;
      }
      default:
        // text and anything future: the drawn path is the only honest fallback.
        candidates.push(keepAsDrawn);
        break;
    }
  }

  const seen = new Set<string>([command.op]);
  const out: AutocompleteAlternate[] = [];
  for (const c of candidates) {
    if (seen.has(c.op)) continue;
    seen.add(c.op);
    out.push(c);
    if (out.length === MAX_ALTERNATES) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// runAutocomplete
// ---------------------------------------------------------------------------

/** Injection points for offline tests (defaults are the real vision client
 * and the env-selected builder chain). */
export interface AutocompleteDeps {
  builder?: ShapeBuilderClient;
  vision?: (args: AnalyzeInkShapesArgs) => Promise<ShapeDetectionSet>;
}

function tierOf(confidence: number): ConfidenceTier {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

function toBuilderDetection(n: NormalizedDetection): ShapeBuilderDetection {
  // Exactly the ShapeBuilderInput contract — no geometry fields, no stroke ids.
  return {
    id: n.id,
    kind: n.kind,
    glyph: n.glyph,
    text: n.text,
    colors: n.colors,
    gradient_direction: n.gradient_direction,
    confidence: n.confidence,
    bbox: n.geometry.bbox,
    parent: n.parent,
    // Wave-3.1 promotion (README §1.7): always serialized, null when absent --
    // byte-parity with training (adapter flash-1784456967-5a2f2897+).
    composite: n.composite ?? null,
  };
}

export async function runAutocomplete(
  body: AutocompleteBody,
  deps: AutocompleteDeps = {}
): Promise<AutocompleteResponse> {
  const request_id = randomUUID();
  const canvas: Canvas = body.canvas;
  const fail = (reason: string, issues?: ShapeValidationIssue[]): AutocompleteResponse => ({
    ok: false,
    request_id,
    reason,
    ...(issues ? { issues } : {}),
  });

  // (a) Describe: forced-op synthesis, or the vision call.
  let visionOut: ShapeDetectionSet;
  if (body.forced_op !== undefined) {
    visionOut = synthesizeForcedDetection(body.forced_op, body.strokes);
  } else {
    const strokeManifest: StrokeManifestEntry[] = body.strokes.map((s) => ({
      id: s.id,
      bbox: strokeBBox(s),
      point_count: s.points.length,
      color: s.color,
    }));
    try {
      visionOut = await (deps.vision ?? analyzeInkShapes)({
        pngBase64: body.png_base64,
        strokeManifest,
        canvas,
      });
    } catch (e) {
      return fail(`vision_failed: ${(e as Error).message}`);
    }
  }

  // (b) Normalize: geometry from ink, conflicts resolved, glyphs merged.
  const normalized = normalizeDetections(visionOut, body.strokes, canvas);
  if (normalized.length === 0) return { ok: true, request_id, results: [] };

  // (b2) Diagram composites: pure geometry. Vision groups a sketched diagram
  // into ONE scribble detection; the text-only builder can't see the structure
  // (axes, spokes, baselines) and rightly abstains. The recognizer reads the
  // claimed strokes and, on a confident signature match, synthesizes the
  // command directly — with params measured from the ink. Recognized
  // composites bypass the builder; everything else proceeds as usual.
  const strokeById = new Map(body.strokes.map((s) => [s.id, s]));
  const childCounts = new Map<string, number>();
  for (const n of normalized) if (n.parent) childCounts.set(n.parent, (childCounts.get(n.parent) ?? 0) + 1);
  const diagramCommands: ShapesOutput["components"] = [];
  const forBuilder: typeof normalized = [];
  for (const det of normalized) {
    const eligible = det.kind === "scribble" && det.parent === null && !childCounts.has(det.id);
    const hit = eligible
      ? classifyDiagram(det.stroke_ids.flatMap((id) => strokeById.get(id) ?? []))
      : null;
    if (hit) {
      diagramCommands.push({ op: hit.op, from: det.id, params: hit.params });
    } else if (eligible && det.composite && (OPS_SHAPES_V2_DIAGRAMS as readonly string[]).includes(det.composite)) {
      // Messy-ink rescue: geometry couldn't verify the structure, but vision's
      // composite hint (a glyph for diagrams) says what it looks like. Seeded
      // defaults instead of measured values — still a diagram, still instant.
      diagramCommands.push({ op: det.composite as (typeof OPS_SHAPES_V2_DIAGRAMS)[number], from: det.id, params: {} });
    } else {
      forBuilder.push(det);
    }
  }

  // (c) Build: text-only, exactly the ShapeBuilderInput contract.
  const builderInput = { artboard: canvas, detections: forBuilder.map(toBuilderDetection) };
  let builderComponents: ShapesOutput["components"] = [];
  if (forBuilder.length > 0) {
    let rawOutput: unknown;
    try {
      rawOutput = await (deps.builder ?? getShapeBuilder()).buildShapes(builderInput);
    } catch (e) {
      return fail(`builder_failed: ${(e as Error).message}`);
    }

    // (d/e) Validate, fail closed -> degrade (never 500 for model issues).
    // Wave 3: detections carry `parent`; only top-level detections take commands.
    const validation = validateShapes(rawOutput, builderInput, 3);
    if (!validation.ok) {
      return fail(`validation_failed_${validation.gate}`, validation.issues);
    }
    // COERCE placeholder -> rect, at the end of interpretation. `placeholder`
    // is retained in the grammar so the frozen adapter still validates it, but
    // it is no longer a user-facing element: any placeholder the model/adapter
    // emits (a mapped-glyph fallback, or the unreadable/unknown-glyph fallback)
    // degrades here to a plain rect BEFORE results are built, so it can never
    // surface as a producible element. This runs after the validator (which
    // still accepts placeholder) precisely so ambiguous ink degrades rather
    // than fails. `rect` inherits the placeholder command's snap/params, all of
    // which are legal for rect.
    builderComponents = validation.output.components.map((c) =>
      c.op === "placeholder" ? { ...c, op: "rect" as const } : c
    );
    // STYLE WORDS — "rainbow" written on a button paints it instead of
    // labelling it. Deterministic and builder-agnostic, so the FreeSolo
    // adapter (whose grammar predates style words) matches the Gemini
    // baseline, which is prompted to do the same routing itself.
    const detById = new Map(normalized.map((n) => [n.id, n]));
    builderComponents = builderComponents.map((c) => {
      if (c.op === "wait") return c;
      const det = detById.get(c.from);
      if (!det?.text) return c;
      const params = applyStyleHints(c.op, c.params, det.text);
      return params === c.params ? c : { ...c, params: params ?? {} };
    });
  }

  // (f) Snap math + tiering per command.
  const byId = new Map(normalized.map((n) => [n.id, n]));
  const results: AutocompleteResult[] = [...builderComponents, ...diagramCommands].map((command) => {
    const det = byId.get(command.from)!; // coverage gate guarantees existence
    const snap = command.op === "wait" ? "none" : command.snap ?? "none";
    const geometry = applySnap(snap, det.geometry, canvas);
    return {
      command,
      detection: {
        id: det.id,
        kind: det.kind,
        glyph: det.glyph,
        text: det.text,
        colors: det.colors,
        gradient_direction: det.gradient_direction,
        stroke_ids: det.stroke_ids,
        confidence: det.confidence,
      },
      geometry: {
        bbox: geometry.bbox,
        ...(geometry.path ? { path: geometry.path } : {}),
      },
      tier: tierOf(det.confidence),
      alternates: computeAlternates(command, det),
    };
  });

  return { ok: true, request_id, results };
}
