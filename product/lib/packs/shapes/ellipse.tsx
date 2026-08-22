import { INK_STROKE, NO_STROKE, readStroke, resolvePaint, type ShapeTemplate } from "./types";

/**
 * ellipse — the crisped closed convex curve; a circle when the caller applied `snap: square`.
 * Unfilled keeps a clean ink outline; filled/gradient drops it unless params.stroke asks.
 * params: fill, gradient, stroke {color,width}.
 */
export const ellipse: ShapeTemplate = (props) => {
  const { x, y, width: w, height: h } = props.bbox;
  const { fill, defs } = resolvePaint("ellipse", props, "none");
  const hasFill = fill !== "none";
  const stroke = readStroke(props.params, hasFill ? NO_STROKE : INK_STROKE);
  return (
    <g>
      {defs}
      <ellipse
        cx={x + w / 2}
        cy={y + h / 2}
        rx={w / 2}
        ry={h / 2}
        fill={fill}
        stroke={stroke.width > 0 ? stroke.color : "none"}
        strokeWidth={stroke.width}
      />
    </g>
  );
};
