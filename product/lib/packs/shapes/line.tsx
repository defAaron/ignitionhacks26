import { INK, endpoints, readStroke, type ShapeTemplate } from "./types";

/**
 * line — a clean straight stroke between the ink path's endpoints (no head; that's `arrow`).
 * Straighten snaps are already applied by the caller — this only draws crisply.
 * params: stroke {color,width}.
 */
export const line: ShapeTemplate = (props) => {
  const [a, b] = endpoints(props);
  const stroke = readStroke(props.params, { color: INK, width: 3 });
  return (
    <g>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
      />
    </g>
  );
};
