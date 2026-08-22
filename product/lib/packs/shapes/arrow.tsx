import { INK, endpoints, readStroke, type ShapeTemplate } from "./types";

/**
 * arrow — clean shaft + crisp filled triangular head, oriented by the ink path's
 * endpoints (tail = first point, tip = last point — direction from ink).
 * params: stroke {color,width} (the head fills with the stroke color).
 */
export const arrow: ShapeTemplate = (props) => {
  const [a, b] = endpoints(props);
  const stroke = readStroke(props.params, { color: INK, width: 3 });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // head scales with stroke weight but never eats the whole shaft
  const head = Math.min(Math.max(10, stroke.width * 3.6), len * 0.45);
  const half = head * 0.42;
  const bx = b.x - ux * head; // head base center
  const by = b.y - uy * head;
  const px = -uy; // unit perpendicular
  const py = ux;
  return (
    <g>
      <line
        x1={a.x}
        y1={a.y}
        x2={bx}
        y2={by}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
      />
      <path
        d={`M ${b.x.toFixed(2)} ${b.y.toFixed(2)} L ${(bx + px * half).toFixed(2)} ${(by + py * half).toFixed(
          2
        )} L ${(bx - px * half).toFixed(2)} ${(by - py * half).toFixed(2)} Z`}
        fill={stroke.color}
        strokeLinejoin="round"
      />
    </g>
  );
};
