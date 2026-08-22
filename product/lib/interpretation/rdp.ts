/**
 * Path simplification + smoothing primitives for the normalizer
 * (ai-pipeline.md §2 — geometry always comes from ink, in pure code).
 *
 * - `rdpSimplify` — Ramer-Douglas-Peucker: collapse a dense ink polyline to
 *   its structural points within a tolerance. The normalizer stores these as
 *   the detection's `path`; the renderer's Catmull-Rom pass (lib/packs/shapes)
 *   re-smooths through them at draw time.
 * - `chaikinSmooth` — corner-cutting smoothing pass for consumers that want a
 *   softened point array directly (endpoints preserved).
 *
 * Pure, deterministic, no deps.
 */

export interface Pt {
  x: number;
  y: number;
}

const clonePt = (p: Pt): Pt => ({ x: p.x, y: p.y });

/** Perpendicular distance from `p` to the (infinite) line through a-b; falls
 * back to point distance when a === b. */
export function perpendicularDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len;
}

/**
 * Ramer-Douglas-Peucker simplification (iterative, stack-based — safe on long
 * ink strokes). Always keeps the first and last point; `epsilon` is the max
 * allowed deviation in px. Returns fresh point objects.
 */
export function rdpSimplify(points: readonly Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return points.map(clonePt);

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > epsilon) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }

  return points.filter((_, i) => keep[i]).map(clonePt);
}

/**
 * Chaikin corner-cutting: each iteration replaces every segment with its 1/4
 * and 3/4 points, keeping the original endpoints (open-path variant). Two
 * iterations turn an RDP skeleton into a visually smooth polyline.
 */
export function chaikinSmooth(points: readonly Pt[], iterations = 2): Pt[] {
  let pts = points.map(clonePt);
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) break;
    const out: Pt[] = [clonePt(pts[0])];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      out.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }
      );
    }
    out.push(clonePt(pts[pts.length - 1]));
    pts = out;
  }
  return pts;
}
