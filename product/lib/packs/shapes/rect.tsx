import { INK_STROKE, NO_STROKE, num, readStroke, resolvePaint, type ShapeTemplate } from "./types";

/**
 * rect — the crisped rectangle. Geometry is exactly the ink's bbox (square snap already
 * applied by the caller when relevant). Unfilled boxes keep a clean ink outline; filled
 * or gradient boxes drop the outline unless params.stroke asks for one.
 * params: fill, gradient, stroke {color,width}, radius (rounded corners, default 0).
 */
export const rect: ShapeTemplate = (props) => {
  const { x, y, width: w, height: h } = props.bbox;
  const { fill, defs } = resolvePaint("rect", props, "none");
  const hasFill = fill !== "none";
  const stroke = readStroke(props.params, hasFill ? NO_STROKE : INK_STROKE);
  const r = Math.max(0, Math.min(num(props.params, "radius", 0), Math.min(w, h) / 2));
  return (
    <g>
      {defs}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={r}
        fill={fill}
        stroke={stroke.width > 0 ? stroke.color : "none"}
        strokeWidth={stroke.width}
        strokeLinejoin="round"
      />
    </g>
  );
};
