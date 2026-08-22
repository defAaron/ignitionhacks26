/**
 * Deterministic diagram recognition (wave 1.5 composites).
 *
 * Vision reports a sketched diagram as ONE kind=scribble detection claiming
 * all of its strokes (lib/vision/prompt.ts "Diagram composites") — but the
 * text-only builder receives just {kind, bbox} and correctly abstains: the
 * structural signal (axes, bars sharing a baseline, radial spokes…) lives in
 * stroke geometry it never sees. Geometry is code's job (vocabulary.md §0),
 * so THIS module reads the claimed strokes and recognizes the six diagram
 * signatures deterministically; recognized composites bypass the builder and
 * carry real params measured from the ink (actual bar heights, actual wedge
 * angles, actual tick counts).
 *
 * Every classifier is conservative: on any doubt return null and let the
 * builder abstain — a missed diagram costs a redraw, a false positive costs
 * trust.
 */

export interface InkStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
}

export interface DiagramHit {
  op: "bar_chart" | "pie_chart" | "venn_diagram" | "timeline" | "periodic_table" | "atomic_structure";
  params: Record<string, unknown>;
}

/* ---- per-stroke features ------------------------------------------------ */

interface Fea {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  first: { x: number; y: number };
  last: { x: number; y: number };
  pathLen: number;
  chord: number;
  closed: boolean;
  /** Open stroke whose path barely deviates from its chord. */
  straight: boolean;
  /** Closed, roundish, near-constant centroid distance. */
  circleish: boolean;
  /** Closed but not circleish. */
  boxish: boolean;
  /** Mean distance from centroid (meaningful for circleish). */
  radius: number;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function featurize(s: InkStroke): Fea | null {
  const pts = s.points;
  if (pts.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let pathLen = 0, sx = 0, sy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    sx += p.x;
    sy += p.y;
    if (i > 0) pathLen += dist(pts[i - 1], p);
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const cx = sx / pts.length;
  const cy = sy / pts.length;
  const chord = dist(pts[0], pts[pts.length - 1]);
  const diag = Math.hypot(w, h);
  const closed = chord < Math.max(12, diag * 0.15) && pathLen > diag * 1.5;
  const straight = !closed && pathLen > 30 && chord / pathLen > 0.88;

  let circleish = false;
  let radius = 0;
  if (closed) {
    let sum = 0;
    let maxDist = 0;
    for (const p of pts) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      sum += d;
      if (d > maxDist) maxDist = d;
    }
    radius = sum / pts.length;
    let varSum = 0;
    for (const p of pts) {
      const d = Math.hypot(p.x - cx, p.y - cy) - radius;
      varSum += d * d;
    }
    const cv = Math.sqrt(varSum / pts.length) / Math.max(radius, 1);
    const aspect = w / h;
    // A rectangle's corners reach its bbox half-diagonal; a circle's points
    // stop at ~0.71 of it — that separates near-square boxes from circles
    // more reliably than radius variance alone.
    const cornerReach = maxDist / Math.max(Math.hypot(w, h) / 2, 1);
    circleish = cv < 0.2 && cornerReach < 0.87 && aspect > 0.62 && aspect < 1.6;
  }

  return {
    id: s.id, x: minX, y: minY, w, h, cx, cy,
    first: pts[0], last: pts[pts.length - 1],
    pathLen, chord, closed, straight, circleish,
    boxish: closed && !circleish, radius,
  };
}

const nearHorizontal = (f: Fea): boolean => f.straight && f.h < Math.max(20, f.w * 0.18);
const nearVertical = (f: Fea): boolean => f.straight && f.w < Math.max(20, f.h * 0.18);

/* ---- the six signatures -------------------------------------------------- */

function barChart(feats: Fea[]): DiagramHit | null {
  const boxes = feats.filter((f) => f.boxish && f.h > 20);
  const lines = feats.filter((f) => f.straight);
  if (boxes.length < 3 || boxes.length + lines.length < feats.length - 1) return null;
  // Bars share a baseline.
  const bottoms = boxes.map((f) => f.y + f.h).sort((a, b) => a - b);
  const baseline = bottoms[Math.floor(bottoms.length / 2)];
  const bars = boxes.filter((f) => Math.abs(f.y + f.h - baseline) < 30);
  if (bars.length < 3) return null;
  // An axis: a near-horizontal line at the baseline (or a near-vertical one at the left edge).
  const hasXAxis = lines.some((f) => nearHorizontal(f) && Math.abs(f.cy - baseline) < 40);
  const hasYAxis = lines.some((f) => nearVertical(f));
  if (!hasXAxis && !hasYAxis) return null;
  const values = [...bars].sort((a, b) => a.x - b.x).map((f) => Math.round(f.h));
  return { op: "bar_chart", params: { values } };
}

function pieChart(feats: Fea[]): DiagramHit | null {
  const circles = feats.filter((f) => f.circleish && f.radius > 40);
  if (circles.length !== 1) return null;
  const c = circles[0];
  const center = { x: c.cx, y: c.cy };
  const spokes = feats.filter((f) => {
    if (!f.straight || f === c) return false;
    const dNear = Math.min(dist(f.first, center), dist(f.last, center));
    const dFar = Math.max(dist(f.first, center), dist(f.last, center));
    return dNear < c.radius * 0.35 && dFar > c.radius * 0.4 && dFar < c.radius * 1.35;
  });
  if (spokes.length < 2 || spokes.length + 1 < feats.length - 1) return null;
  // Wedge sizes from the angular gaps between spoke tips.
  const angles = spokes
    .map((f) => {
      const tip = dist(f.first, center) > dist(f.last, center) ? f.first : f.last;
      return Math.atan2(tip.y - center.y, tip.x - center.x);
    })
    .sort((a, b) => a - b);
  const values = angles.map((a, i) => {
    const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
    return Math.max(1, Math.round(((next - a) / (Math.PI * 2)) * 100));
  });
  return { op: "pie_chart", params: { values } };
}

function vennDiagram(feats: Fea[]): DiagramHit | null {
  const circles = feats.filter((f) => f.circleish && f.radius > 30);
  if (circles.length < 2 || circles.length > 3 || circles.length !== feats.length) return null;
  let overlaps = 0;
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i], b = circles[j];
      const d = dist({ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy });
      // Overlapping but not concentric (concentric is atomic_structure's shape).
      if (d < (a.radius + b.radius) * 0.92 && d > Math.max(a.radius, b.radius) * 0.45) overlaps++;
    }
  }
  const needed = circles.length === 2 ? 1 : 2;
  return overlaps >= needed ? { op: "venn_diagram", params: {} } : null;
}

function atomicStructure(feats: Fea[]): DiagramHit | null {
  const rings = feats.filter((f) => f.circleish && f.radius > 25);
  if (rings.length < 2) return null;
  // Everything else must be small (nucleus dot, electron dots).
  const rest = feats.filter((f) => !rings.includes(f));
  if (rest.some((f) => Math.max(f.w, f.h) > 60)) return null;
  const mx = rings.reduce((s, f) => s + f.cx, 0) / rings.length;
  const my = rings.reduce((s, f) => s + f.cy, 0) / rings.length;
  const minR = Math.min(...rings.map((f) => f.radius));
  const maxR = Math.max(...rings.map((f) => f.radius));
  const concentric = rings.every((f) => dist({ x: f.cx, y: f.cy }, { x: mx, y: my }) < minR * 0.4);
  return concentric && maxR / minR > 1.3 ? { op: "atomic_structure", params: {} } : null;
}

function timeline(feats: Fea[]): DiagramHit | null {
  const spines = feats.filter((f) => nearHorizontal(f) && f.w > 200);
  if (spines.length !== 1) return null;
  const spine = spines[0];
  const ticks = feats.filter(
    (f) =>
      f !== spine &&
      Math.max(f.w, f.h) < 70 &&
      Math.abs(f.cy - spine.cy) < 45 &&
      f.cx > spine.x - 20 &&
      f.cx < spine.x + spine.w + 20
  );
  if (ticks.length < 3 || ticks.length + 1 < feats.length) return null;
  const events = Array.from({ length: ticks.length }, (_, i) => `Step ${i + 1}`);
  return { op: "timeline", params: { events } };
}

function periodicTable(feats: Fea[]): DiagramHit | null {
  const boxes = feats.filter((f) => f.boxish);
  if (boxes.length < 10 || boxes.length < feats.length * 0.8) return null;
  const ws = boxes.map((f) => f.w).sort((a, b) => a - b);
  const hs = boxes.map((f) => f.h).sort((a, b) => a - b);
  const mw = ws[Math.floor(ws.length / 2)];
  const mh = hs[Math.floor(hs.length / 2)];
  const similar = boxes.filter(
    (f) => f.w > mw * 0.5 && f.w < mw * 1.7 && f.h > mh * 0.5 && f.h < mh * 1.7
  );
  if (similar.length < boxes.length * 0.8) return null;
  const minX = Math.min(...boxes.map((f) => f.x));
  const maxX = Math.max(...boxes.map((f) => f.x + f.w));
  const minY = Math.min(...boxes.map((f) => f.y));
  const maxY = Math.max(...boxes.map((f) => f.y + f.h));
  return (maxX - minX) / Math.max(maxY - minY, 1) > 1.15
    ? { op: "periodic_table", params: {} }
    : null;
}

/* ---- entry point --------------------------------------------------------- */

/** Most-specific first: many-box grids before bar charts, ring pairs before pies. */
const CLASSIFIERS = [periodicTable, barChart, vennDiagram, atomicStructure, pieChart, timeline];

export function classifyDiagram(strokes: InkStroke[]): DiagramHit | null {
  if (strokes.length < 2) return null; // 2-circle venn is the smallest composite
  const feats: Fea[] = [];
  for (const s of strokes) {
    const f = featurize(s);
    if (f) feats.push(f);
  }
  if (feats.length < 2) return null;
  for (const classify of CLASSIFIERS) {
    const hit = classify(feats);
    if (hit) return hit;
  }
  return null;
}
