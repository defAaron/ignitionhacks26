/**
 * Snap application (ai-pipeline.md §2 + shared/schemas/README.md §1 snap
 * table): the builder only NAMES a policy from a closed enum; the math lives
 * here — pure, deterministic, unit-testable. Applied AFTER validation, to the
 * geometry the normalizer derived from ink.
 *
 * | Policy            | Meaning                                                        |
 * |-------------------|----------------------------------------------------------------|
 * | none              | Identity — geometry exactly as derived from ink.               |
 * | full_width_top    | x=0, width=artboard.width, y=0, keep height. Navbar policy.    |
 * | full_width_bottom | Same stretch, pinned to the bottom edge. Footer-band policy.   |
 * | full_width        | Stretch x only; vertical position kept. Section dividers.      |
 * | straighten_h      | Level the endpoints to their mean y (near-horizontal line).    |
 * | straighten_v      | Level the endpoints to their mean x (near-vertical line).      |
 * | square            | Equalize width/height about the centroid (side = mean of w,h). |
 * | center_in_region  | Keep size, center within the artboard (v1 region = artboard).  |
 *
 * Path/endpoints/centroid are remapped affinely whenever the bbox transforms,
 * so every field of the returned geometry stays mutually consistent.
 */

import type { BBox, SnapPolicy } from "../../types/schemas";
import type { DetectionGeometry } from "./normalize";
import type { Pt } from "./rdp";

export interface Artboard {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clonePt = (p: Pt): Pt => ({ x: p.x, y: p.y });

function cloneGeometry(g: DetectionGeometry): DetectionGeometry {
  return {
    bbox: { ...g.bbox },
    centroid: clonePt(g.centroid),
    ...(g.endpoints ? { endpoints: [clonePt(g.endpoints[0]), clonePt(g.endpoints[1])] as [Pt, Pt] } : {}),
    ...(g.path ? { path: g.path.map(clonePt) } : {}),
  };
}

/** Affine-remap every geometry field from its current bbox onto `to`. */
function remapToBBox(g: DetectionGeometry, to: BBox): DetectionGeometry {
  const from = g.bbox;
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  const map = (p: Pt): Pt => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy });
  return {
    bbox: { ...to },
    centroid: map(g.centroid),
    ...(g.endpoints ? { endpoints: [map(g.endpoints[0]), map(g.endpoints[1])] as [Pt, Pt] } : {}),
    ...(g.path ? { path: g.path.map(map) } : {}),
  };
}

/** Endpoints for straighten snaps: real ink endpoints, or a bbox-derived
 * fallback when the geometry carries none. */
function endpointsOf(g: DetectionGeometry, horizontal: boolean): [Pt, Pt] {
  if (g.endpoints) return g.endpoints;
  const { x, y, width, height } = g.bbox;
  return horizontal
    ? [{ x, y: y + height / 2 }, { x: x + width, y: y + height / 2 }]
    : [{ x: x + width / 2, y }, { x: x + width / 2, y: y + height }];
}

function straighten(g: DetectionGeometry, axis: "h" | "v"): DetectionGeometry {
  const [a, b] = endpointsOf(g, axis === "h");
  let p0: Pt;
  let p1: Pt;
  if (axis === "h") {
    const meanY = (a.y + b.y) / 2;
    p0 = { x: a.x, y: meanY };
    p1 = { x: b.x, y: meanY };
  } else {
    const meanX = (a.x + b.x) / 2;
    p0 = { x: meanX, y: a.y };
    p1 = { x: meanX, y: b.y };
  }
  return {
    bbox: {
      x: Math.min(p0.x, p1.x),
      y: Math.min(p0.y, p1.y),
      width: Math.abs(p1.x - p0.x),
      height: Math.abs(p1.y - p0.y),
    },
    centroid: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
    endpoints: [p0, p1],
    path: [clonePt(p0), clonePt(p1)],
  };
}

// ---------------------------------------------------------------------------
// applySnap
// ---------------------------------------------------------------------------

/** Apply one named snap policy to an ink-derived geometry. Pure. */
export function applySnap(
  policy: SnapPolicy,
  geometry: DetectionGeometry,
  artboard: Artboard
): DetectionGeometry {
  const { bbox } = geometry;
  switch (policy) {
    case "none":
      return cloneGeometry(geometry);
    case "full_width_top":
      return remapToBBox(geometry, { x: 0, y: 0, width: artboard.width, height: bbox.height });
    case "full_width_bottom":
      return remapToBBox(geometry, {
        x: 0,
        y: artboard.height - bbox.height,
        width: artboard.width,
        height: bbox.height,
      });
    case "full_width":
      return remapToBBox(geometry, { x: 0, y: bbox.y, width: artboard.width, height: bbox.height });
    case "straighten_h":
      return straighten(geometry, "h");
    case "straighten_v":
      return straighten(geometry, "v");
    case "square": {
      const side = (bbox.width + bbox.height) / 2;
      const { centroid } = geometry;
      return remapToBBox(geometry, {
        x: centroid.x - side / 2,
        y: centroid.y - side / 2,
        width: side,
        height: side,
      });
    }
    case "center_in_region":
      // v1: the enclosing region is the artboard.
      return remapToBBox(geometry, {
        x: (artboard.width - bbox.width) / 2,
        y: (artboard.height - bbox.height) / 2,
        width: bbox.width,
        height: bbox.height,
      });
  }
}
