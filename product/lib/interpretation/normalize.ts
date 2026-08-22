/**
 * Normalizer (ai-pipeline.md §2, no model): the pure function between vision
 * and builder. Geometry always comes from ink — every detection's advisory
 * vision bbox is OVERWRITTEN with the union of its claimed strokes' real
 * bounds, and centroid / endpoints / simplified path are derived here.
 *
 * Conflict rules:
 *  - stroke ids that don't exist are dropped (a detection left with none is
 *    dropped entirely)
 *  - a stroke claimed by two detections goes to the higher-confidence one;
 *    the loser drops that stroke id and is dropped if emptied
 *  - NO confidence-floor drop here — every surviving detection is forwarded;
 *    abstention (`wait`) is the builder's call, tiering is the route's
 *
 * THE KIND-CORRECTION PASS (runs BEFORE the glyph merge and containment):
 * vision sometimes misreports an enclosed shape as kind "line" / "scribble".
 * Closedness is measurable from the actual stroke points, so it is corrected
 * HERE, deterministically: a reported line/scribble/smooth_path whose ink is
 * geometrically closed (closure ratio < KIND_CLOSURE_MAX_RATIO with enough
 * points and a meaningful bbox) is promoted to rect (~4 corners, near-axis-
 * aligned sides), else ellipse (roundness ≈ 1), else smooth_path. Scribbles
 * additionally require a single stroke with low self-intersection (a genuine
 * scribble crosses itself constantly). Enclosed ink is NEVER demoted to line.
 * The original vision kind is preserved as `visionKind` for telemetry.
 * Forced-op synthesized detections (confidence 1.0) are ground truth and are
 * never corrected. Thresholds: the KIND_* constants below.
 *
 * THE GLYPH MERGE (live-verified vision behavior): Gemini splits a glyph box
 * into TWO detections — the box as kind=rect, and the letter as its own
 * text_writing detection carrying `glyph`. A text_writing detection with a
 * non-null glyph whose real (stroke-union) bbox center sits inside a rect
 * detection's real bbox is merged into that rect: one detection with
 * {kind: "rect", the letter's glyph, stroke_ids: union, confidence: min of
 * the two}. The letter's ink is consumed by the merge.
 *
 * THE CONTAINMENT PASS (wave 3, wave3-semantics.md; runs AFTER the glyph
 * merge): containment is geometry, so it is assigned HERE, deterministically —
 * never by the vision prompt. Detection A is a child of detection B iff
 *   (a) B's kind is an enclosed kind (rect | ellipse | smooth_path),
 *   (b) at least CONTAINMENT_MIN_OVERLAP (92%) of A's real stroke-union bbox
 *       area lies inside B's real bbox (degenerate child boxes — straight
 *       lines, dots — get a 1px-per-axis floor so "inside" stays defined), and
 *   (c) B's bbox area is STRICTLY greater than A's (rules out coincident /
 *       equal boxes and makes parent chains acyclic by construction).
 * Tie-breaks: among all candidate parents the DEEPEST container wins —
 * smallest bbox area; an exact area tie breaks toward earlier vision order
 * (post-merge index). Glyph letters consumed by the merge no longer exist at
 * this point and never become children. Partial (non-nested) overlap below
 * the 92% threshold assigns NO parent. The result is `parent` on every
 * normalized detection: the minted det_N id of its immediate parent, or null
 * for top-level detections.
 */

import type { BBox, ShapeDetection, ShapeDetectionSet, ShapeKind, Stroke } from "../../types/schemas";
import type { ShapeBuilderDetection } from "../models/types";
import { rdpSimplify, type Pt } from "./rdp";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Canvas {
  width: number;
  height: number;
}

/** Everything deterministic code derived from the detection's claimed ink. */
export interface DetectionGeometry {
  /** Union of the claimed strokes' point bounds — NEVER the vision bbox. */
  bbox: BBox;
  /** Mean of all claimed points. */
  centroid: Pt;
  /** First/last ink point — only for kind line | arrow. */
  endpoints?: [Pt, Pt];
  /** RDP-simplified polyline — only for smooth_path | line | arrow | scribble. */
  path?: Pt[];
}

/**
 * One canonical detection: exactly the ShapeBuilderDetection fields the
 * builder receives (id minted here, det_N), plus the ink-derived geometry and
 * the resolved stroke claim (both server-side only — never sent to the model).
 */
export interface NormalizedDetection extends ShapeBuilderDetection {
  stroke_ids: string[];
  geometry: DetectionGeometry;
  /**
   * Wave-3 containment (wave3-semantics.md): minted id (det_N) of the deepest
   * enclosed detection whose real bbox contains this one, or null when
   * top-level. Assigned by the deterministic containment pass below — geometry
   * is code's job, so vision never reports this.
   */
  parent: string | null;
  /**
   * Vision's diagram-cluster hint (a glyph for diagrams) — advisory appearance
   * report. Server-side only: consumed by the pipeline's diagram step, never
   * forwarded to the builder (the deployed adapter predates the field).
   */
  composite: string | null;
  /**
   * The kind exactly as VISION reported it, before the deterministic
   * kind-correction pass (telemetry: measures the vision misreport rate).
   * Equal to `kind` whenever no correction fired. Server-side only — never
   * forwarded to the builder.
   */
  visionKind: ShapeKind;
  /**
   * Ink-geometry scores measured for this detection (closure, corners,
   * roundness, …) — the deterministic inputs to the kind-correction pass,
   * re-used by the pipeline to rank alternate interpretations without any
   * extra model call. Server-side only.
   */
  kindScores: InkKindScores;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const PATH_KINDS: ReadonlySet<ShapeKind> = new Set(["smooth_path", "line", "arrow", "scribble"]);
const ENDPOINT_KINDS: ReadonlySet<ShapeKind> = new Set(["line", "arrow"]);

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function unionBBox(points: readonly Pt[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const bboxCenter = (b: BBox): Pt => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

const bboxContains = (b: BBox, p: Pt): boolean =>
  p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

// --- kind correction (deterministic closedness) -----------------------------

/** Kinds the correction pass may re-read (enclosed misreports land here). */
const CORRECTABLE_KINDS: ReadonlySet<ShapeKind> = new Set(["line", "scribble", "smooth_path"]);

/** Closed iff distance(first, last) / total path length is below this — the
 * pen ended (nearly) where it started relative to how far it travelled. */
export const KIND_CLOSURE_MAX_RATIO = 0.15;

/** Closure is only meaningful with at least this many raw ink points (a
 * 2-point "line" trivially has ratio 1; a dot cluster is noise). */
export const KIND_CLOSURE_MIN_POINTS = 8;

/** Minimum real bbox area (px², 20×20) for closure to be meaningful — tiny
 * marks keep their reported kind. */
export const KIND_CLOSURE_MIN_BBOX_AREA = 400;

/** Coarse RDP epsilon = this fraction of the bbox diagonal (floor 2px):
 * removes hand wobble so only STRUCTURAL corners survive. */
export const KIND_RDP_EPSILON_FRAC = 0.04;

/** A simplified vertex is a corner when the direction change exceeds this. */
export const KIND_CORNER_MIN_TURN_DEG = 35;

/** Corner-count band that reads as a quadrilateral (hand-drawn boxes at the
 * coarse epsilon land on 3-5 sharp turns, not exactly 4). */
export const KIND_RECT_CORNERS_MIN = 3;
export const KIND_RECT_CORNERS_MAX = 5;

/** Every long side of the simplified ring must sit within this many degrees
 * of horizontal/vertical for the rect promotion (a diamond is not a rect). */
export const KIND_AXIS_ALIGN_MAX_DEG = 20;

/** Roundness = perimeter² / (4π·area): 1 for a circle, ~1.19 for a 2:1
 * ellipse, ~1.27 for a square. Closed ink at or below this promotes to
 * ellipse (measured on the coarse ring, i.e. wobble-free). */
export const KIND_ELLIPSE_ROUNDNESS_MAX = 1.2;

/** A closed single-stroke "scribble" may promote only when its simplified
 * polyline crosses itself at most this many times (a genuine scribble is
 * dense with self-intersections; a closing overlap can cross once). */
export const KIND_SCRIBBLE_MAX_SELF_INTERSECTIONS = 1;

/** Detections at/above this confidence are never corrected: forced-op mode
 * synthesizes detections at exactly 1.0 — those are ground truth, not a
 * vision guess (pipeline.ts synthesizeForcedDetection). */
export const KIND_CORRECTION_MAX_CONFIDENCE = 0.999;

/** Deterministic ink-geometry measurements behind the kind correction (and
 * the pipeline's alternates ranking). All pure functions of the raw points. */
export interface InkKindScores {
  /** distance(first, last) / path length; Infinity when degenerate. */
  closureRatio: number;
  /** The full closure test: ratio + min points + min bbox area. */
  closed: boolean;
  /** Structural corners in the coarse-RDP ring (closed) / polyline (open). */
  cornerCount: number;
  /** perimeter²/(4π·area) of the coarse ring; Infinity when open/degenerate. */
  roundness: number;
  /** True when every long ring side is near-horizontal or near-vertical. */
  axisAligned: boolean;
  /** Proper crossings between non-adjacent segments of the coarse polyline. */
  selfIntersections: number;
  pointCount: number;
}

const OPEN_SCORES: InkKindScores = {
  closureRatio: Infinity,
  closed: false,
  cornerCount: 0,
  roundness: Infinity,
  axisAligned: false,
  selfIntersections: 0,
  pointCount: 0,
};

/** Direction change (degrees, 0..180) entering vs leaving vertex b. */
function turnDeg(a: Pt, b: Pt, c: Pt): number {
  const a1 = Math.atan2(b.y - a.y, b.x - a.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(a2 - a1) * (180 / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

/** Angular distance (degrees, 0..45) of segment a-b from the nearest axis. */
function offAxisDeg(a: Pt, b: Pt): number {
  const ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * (180 / Math.PI); // 0..180
  const mod = ang % 90;
  return Math.min(mod, 90 - mod);
}

/** True when segments p1-p2 and p3-p4 properly intersect. */
function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Measure the kind-correction scores for one detection's concatenated ink.
 * Pure and deterministic — exported so tests (and the datagen parity mirror)
 * can exercise the exact serving measurements.
 */
export function analyzeInkKind(points: readonly Pt[]): InkKindScores {
  if (points.length < 2) return { ...OPEN_SCORES, pointCount: points.length };

  let pathLength = 0;
  for (let i = 1; i < points.length; i++) {
    pathLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const bbox = unionBBox(points);
  if (pathLength <= 0) return { ...OPEN_SCORES, pointCount: points.length };

  const closureRatio =
    Math.hypot(points[points.length - 1].x - points[0].x, points[points.length - 1].y - points[0].y) /
    pathLength;
  const closed =
    closureRatio < KIND_CLOSURE_MAX_RATIO &&
    points.length >= KIND_CLOSURE_MIN_POINTS &&
    bbox.width * bbox.height >= KIND_CLOSURE_MIN_BBOX_AREA;

  // Coarse simplification: keep only structure, drop hand wobble.
  const epsilon = Math.max(2, Math.hypot(bbox.width, bbox.height) * KIND_RDP_EPSILON_FRAC);
  const simplified = rdpSimplify(points, epsilon);

  // Self-intersections over the simplified polyline (non-adjacent segments).
  let selfIntersections = 0;
  for (let i = 0; i + 1 < simplified.length; i++) {
    for (let j = i + 2; j + 1 < simplified.length; j++) {
      if (segmentsCross(simplified[i], simplified[i + 1], simplified[j], simplified[j + 1])) {
        selfIntersections++;
      }
    }
  }

  // The RING: simplified vertices with the duplicate closing point dropped.
  const ring = [...simplified];
  if (
    ring.length > 2 &&
    Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) <= epsilon * 2
  ) {
    ring.pop();
  }

  // Corners: cyclic turn angles when closed, interior vertices when open.
  let cornerCount = 0;
  if (closed && ring.length >= 3) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i - 1 + ring.length) % ring.length];
      const c = ring[(i + 1) % ring.length];
      if (turnDeg(a, ring[i], c) >= KIND_CORNER_MIN_TURN_DEG) cornerCount++;
    }
  } else {
    for (let i = 1; i + 1 < simplified.length; i++) {
      if (turnDeg(simplified[i - 1], simplified[i], simplified[i + 1]) >= KIND_CORNER_MIN_TURN_DEG) cornerCount++;
    }
  }

  // Roundness + axis alignment on the ring (closed only).
  let roundness = Infinity;
  let axisAligned = false;
  if (closed && ring.length >= 3) {
    let perimeter = 0;
    let area2 = 0; // 2x shoelace area
    let longest = 0;
    const sides: Array<[Pt, Pt]> = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      perimeter += len;
      if (len > longest) longest = len;
      area2 += a.x * b.y - b.x * a.y;
      sides.push([a, b]);
    }
    const area = Math.abs(area2) / 2;
    if (area > 0) roundness = (perimeter * perimeter) / (4 * Math.PI * area);
    // Only sides long enough to be structural (≥ 25% of the longest side)
    // vote on axis alignment — corner-rounding stubs don't disqualify a box.
    const structural = sides.filter(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) >= longest * 0.25);
    axisAligned =
      structural.length > 0 && structural.every(([a, b]) => offAxisDeg(a, b) <= KIND_AXIS_ALIGN_MAX_DEG);
  }

  return { closureRatio, closed, cornerCount, roundness, axisAligned, selfIntersections, pointCount: points.length };
}

/**
 * What geometrically CLOSED ink reads as: rect (~4 corners, near-axis-aligned
 * sides), else ellipse (roundness ≈ 1), else smooth_path ("closed, but freeform
 * — keep the drawn outline"). Returns null for open ink. Note this can never
 * return "line" — enclosed ink is never demoted.
 */
export function classifyClosedInk(scores: InkKindScores): Extract<ShapeKind, "rect" | "ellipse" | "smooth_path"> | null {
  if (!scores.closed) return null;
  if (
    scores.cornerCount >= KIND_RECT_CORNERS_MIN &&
    scores.cornerCount <= KIND_RECT_CORNERS_MAX &&
    scores.axisAligned
  ) {
    return "rect";
  }
  if (scores.roundness <= KIND_ELLIPSE_ROUNDNESS_MAX) return "ellipse";
  return "smooth_path";
}

// --- containment (wave 3) ---------------------------------------------------

/** Kinds that can PARENT: closed outlines with an interior. */
const ENCLOSED_KINDS: ReadonlySet<ShapeKind> = new Set(["rect", "ellipse", "smooth_path"]);

/** Fraction of the child's bbox area that must lie inside the parent's bbox. */
export const CONTAINMENT_MIN_OVERLAP = 0.92;

/** bbox area with a 1px floor per axis, so lines/dots (zero-area boxes) still
 * participate in containment with a well-defined ratio. */
const effectiveArea = (b: BBox): number => Math.max(b.width, 1) * Math.max(b.height, 1);

/**
 * Fraction of `child`'s area lying inside `parent`. Degenerate child boxes are
 * inflated to 1px per axis (centered) before intersecting — a straight line
 * strictly inside a rect is contained (ratio ~1), one crossing the edge isn't.
 */
function containmentRatio(child: BBox, parent: BBox): number {
  const cw = Math.max(child.width, 1);
  const ch = Math.max(child.height, 1);
  const cx = child.x - (cw - child.width) / 2;
  const cy = child.y - (ch - child.height) / 2;
  const overlapW = Math.max(0, Math.min(cx + cw, parent.x + parent.width) - Math.max(cx, parent.x));
  const overlapH = Math.max(0, Math.min(cy + ch, parent.y + parent.height) - Math.max(cy, parent.y));
  return (overlapW * overlapH) / (cw * ch);
}

/** Derive the full geometry of a detection from its claimed strokes. */
export function computeGeometry(kind: ShapeKind, strokes: readonly Stroke[]): DetectionGeometry {
  const allPoints: Pt[] = [];
  for (const s of strokes) for (const p of s.points) allPoints.push({ x: p.x, y: p.y });

  const bbox = unionBBox(allPoints);
  let cx = 0, cy = 0;
  for (const p of allPoints) {
    cx += p.x;
    cy += p.y;
  }
  const centroid: Pt = { x: cx / allPoints.length, y: cy / allPoints.length };

  const geometry: DetectionGeometry = { bbox, centroid };

  if (ENDPOINT_KINDS.has(kind)) {
    const firstStroke = strokes[0];
    const lastStroke = strokes[strokes.length - 1];
    const first = firstStroke.points[0];
    const last = lastStroke.points[lastStroke.points.length - 1];
    geometry.endpoints = [
      { x: first.x, y: first.y },
      { x: last.x, y: last.y },
    ];
  }

  if (PATH_KINDS.has(kind)) {
    const epsilon = Math.max(1.5, Math.hypot(bbox.width, bbox.height) * 0.01);
    geometry.path = rdpSimplify(allPoints, epsilon);
  }

  return geometry;
}

// ---------------------------------------------------------------------------
// normalizeDetections
// ---------------------------------------------------------------------------

interface Working {
  det: ShapeDetection;
  strokeIds: string[];
  /** Set by the kind-correction pass when it promoted the vision kind. */
  correctedKind?: ShapeKind;
  /** Ink-geometry measurements (kind-correction pass; alternates ranking). */
  scores?: InkKindScores;
  /** Set when a glyph letter merged into this rect. */
  mergedGlyph?: string;
  mergedConfidence?: number;
  mergedColors?: string[];
}

/** Effective kind: the correction-pass promotion when set, else vision's. */
const kindOf = (w: Working): ShapeKind => w.correctedKind ?? w.det.kind;

/**
 * Vision output + raw strokes -> the canonical detection list (ids minted
 * det_1..det_N in vision order after merges). Pure; `canvas` is accepted for
 * signature completeness/future clamping but geometry is taken from ink as-is.
 */
export function normalizeDetections(
  visionOut: ShapeDetectionSet,
  strokes: Stroke[],
  _canvas: Canvas
): NormalizedDetection[] {
  const strokeById = new Map(strokes.map((s) => [s.id, s]));

  // 1. Existence filter: unknown stroke ids are dropped; emptied detections too.
  let working: Working[] = visionOut.detections
    .map((det) => ({
      det,
      strokeIds: [...new Set(det.stroke_ids)].filter((id) => strokeById.has(id)),
    }))
    .filter((w) => w.strokeIds.length > 0);

  // 2. Stroke-claim conflicts: higher confidence keeps a contested stroke
  //    (ties break toward earlier vision order via stable sort).
  const byConfidence = [...working].sort((a, b) => b.det.confidence - a.det.confidence);
  const claimed = new Set<string>();
  for (const w of byConfidence) {
    w.strokeIds = w.strokeIds.filter((id) => !claimed.has(id));
    for (const id of w.strokeIds) claimed.add(id);
  }
  working = working.filter((w) => w.strokeIds.length > 0);

  const strokesOf = (w: Working): Stroke[] => w.strokeIds.map((id) => strokeById.get(id)!);
  const pointsOf = (w: Working): Pt[] =>
    strokesOf(w).flatMap((s) => s.points.map((p) => ({ x: p.x, y: p.y })));
  const realBBox = (w: Working): BBox => unionBBox(pointsOf(w));

  // 2.5. THE KIND-CORRECTION PASS — closedness is measurable from the ink, so
  //      an enclosed shape misreported as line/scribble/smooth_path is promoted
  //      here, deterministically, BEFORE the glyph merge and containment (a
  //      corrected rect can host a glyph and can parent children). Enclosed
  //      ink is never demoted to line (classifyClosedInk can't return "line").
  //      Original vision kind survives as visionKind for telemetry.
  for (const w of working) {
    w.scores = analyzeInkKind(pointsOf(w));
    if (!CORRECTABLE_KINDS.has(w.det.kind)) continue;
    // Forced-op synthesized detections (confidence 1.0) are ground truth, not
    // a vision guess — never second-guess them (protects forced decorative
    // ops, whose ink is legitimately a closed scribble).
    if (w.det.confidence >= KIND_CORRECTION_MAX_CONFIDENCE) continue;
    // A scribble promotes only as a SINGLE closed stroke with low
    // self-intersection — a genuine scribble crosses itself constantly, and
    // multi-stroke scribbles may be diagram composites (pipeline step b2).
    if (
      w.det.kind === "scribble" &&
      (w.strokeIds.length !== 1 || w.scores.selfIntersections > KIND_SCRIBBLE_MAX_SELF_INTERSECTIONS)
    ) {
      continue;
    }
    const promoted = classifyClosedInk(w.scores);
    if (promoted !== null && promoted !== w.det.kind) w.correctedKind = promoted;
  }

  // 3. THE GLYPH MERGE — letter-in-a-box collapses into its host rect.

  const consumed = new Set<Working>();
  for (const letter of working) {
    if (letter.det.kind !== "text_writing" || letter.det.glyph === null) continue;
    const center = bboxCenter(realBBox(letter));
    // Host = the DEEPEST (smallest-area) containing rect, so under wave-3
    // nesting the letter lands on its immediate box, never an outer container
    // (tie-break aligned with the containment pass; exact area tie -> earlier
    // vision order). Identical to the old first-match rule when nothing nests.
    let host: Working | undefined;
    for (const h of working) {
      if (h === letter || consumed.has(h) || kindOf(h) !== "rect") continue;
      if (!bboxContains(realBBox(h), center)) continue;
      if (host === undefined || effectiveArea(realBBox(h)) < effectiveArea(realBBox(host))) host = h;
    }
    if (!host) continue;
    consumed.add(letter);
    host.strokeIds = [...host.strokeIds, ...letter.strokeIds];
    host.mergedGlyph = host.det.glyph ?? letter.det.glyph ?? undefined;
    host.mergedConfidence = Math.min(
      host.mergedConfidence ?? host.det.confidence,
      letter.det.confidence
    );
    host.mergedColors = [...new Set([...(host.mergedColors ?? host.det.colors), ...letter.det.colors])];
  }
  working = working.filter((w) => !consumed.has(w));

  // 4. THE CONTAINMENT PASS (wave 3) — assign each detection its immediate
  //    (deepest) enclosing parent, per the rules in the module comment.
  //    Ids are minted det_{index+1} in step 5, so a parent INDEX here maps
  //    1:1 onto the parent's minted id.
  const realBBoxes = working.map(realBBox);
  const parentIndex: (number | null)[] = working.map((_, i) => {
    let best: number | null = null;
    for (let j = 0; j < working.length; j++) {
      if (j === i) continue;
      if (!ENCLOSED_KINDS.has(kindOf(working[j]))) continue; // (a) enclosed kinds only (post-correction)
      if (effectiveArea(realBBoxes[j]) <= effectiveArea(realBBoxes[i])) continue; // (c) strictly larger
      if (containmentRatio(realBBoxes[i], realBBoxes[j]) < CONTAINMENT_MIN_OVERLAP) continue; // (b) ≥92% inside
      // Deepest container wins (smallest area); strict < keeps the earliest
      // vision-order candidate on an exact area tie.
      if (best === null || effectiveArea(realBBoxes[j]) < effectiveArea(realBBoxes[best])) best = j;
    }
    return best;
  });

  // 5. Mint ids + derive geometry (real bounds overwrite the advisory bbox).
  return working.map((w, i) => {
    const geometry = computeGeometry(kindOf(w), strokesOf(w));
    const pIdx = parentIndex[i];
    return {
      id: `det_${i + 1}`,
      kind: kindOf(w),
      glyph: w.mergedGlyph ?? w.det.glyph,
      text: w.det.text,
      colors: w.mergedColors ?? w.det.colors,
      gradient_direction: w.det.gradient_direction,
      composite: w.det.composite ?? null,
      confidence: clamp01(w.mergedConfidence ?? w.det.confidence),
      bbox: geometry.bbox,
      parent: pIdx === null ? null : `det_${pIdx + 1}`,
      stroke_ids: w.strokeIds,
      geometry,
      visionKind: w.det.kind,
      kindScores: w.scores ?? analyzeInkKind(pointsOf(w)),
    };
  });
}
