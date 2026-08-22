import {
  INK,
  INK_STROKE,
  NO_STROKE,
  readStroke,
  resolvePaint,
  smoothPath,
  type ShapeTemplate,
} from "./types";

/**
 * smooth_path — THE fire-shape renderer: the user's own silhouette, kept. Catmull-Rom
 * smooths the provided ink path; the curve closes when the endpoints land near each
 * other (relative to the ink's diagonal). Closed + fill/gradient covers the removed
 * `blob` op without substituting a generic potato. Open paths render as a clean stroke.
 * params: fill, gradient, stroke {color,width}.
 */
export const smooth_path: ShapeTemplate = (props) => {
  const pts = (props.path ?? []).map((p) => [p.x, p.y] as [number, number]);
  if (pts.length < 3) return <g />;
  const [fx, fy] = pts[0];
  const [lx, ly] = pts[pts.length - 1];
  const diag = Math.hypot(props.bbox.width, props.bbox.height) || 1;
  const closed = Math.hypot(lx - fx, ly - fy) < Math.max(12, diag * 0.12);
  const d = smoothPath(pts, closed);
  const { fill, defs } = closed ? resolvePaint("smooth_path", props, "none") : { fill: "none", defs: null };
  const hasFill = fill !== "none";
  const stroke = readStroke(
    props.params,
    hasFill ? NO_STROKE : closed ? INK_STROKE : { color: INK, width: 2.5 }
  );
  return (
    <g>
      {defs}
      <path
        d={d}
        fill={fill}
        stroke={stroke.width > 0 ? stroke.color : "none"}
        strokeWidth={stroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};
