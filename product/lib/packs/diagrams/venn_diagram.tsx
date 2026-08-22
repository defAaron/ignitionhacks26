import { ACCENT, FONT, INK, num, strs, type ShapeTemplate } from "../shapes/types";
import { clamp } from "./util";

const COLORS = [ACCENT, "#38d9c3", "#f5a623"];

/**
 * venn_diagram — 2 or 3 translucent overlapping sets; intersections read through layered opacity.
 * params: sets (2|3, default 2), labels (string[], default A/B/C).
 */
export const venn_diagram: ShapeTemplate = ({ bbox, params }) => {
  const { x, y, width: w, height: h } = bbox;
  const sets = clamp(Math.round(num(params, "sets", 2)), 2, 3);
  const labels = strs(params, "labels", ["A", "B", "C"]);
  let r: number;
  let centers: Array<[number, number]>;
  if (sets === 2) {
    r = Math.min(h / 2 - 4, w / 3.1);
    centers = [
      [w / 2 - r * 0.58, h / 2],
      [w / 2 + r * 0.58, h / 2],
    ];
  } else {
    r = Math.min(w, h) / 3.15;
    const d = r * 0.62;
    centers = [
      [w / 2 - d, h / 2 - d * 0.62],
      [w / 2 + d, h / 2 - d * 0.62],
      [w / 2, h / 2 + d * 0.85],
    ];
  }
  const mx = centers.reduce((s, c) => s + c[0], 0) / sets;
  const my = centers.reduce((s, c) => s + c[1], 0) / sets;
  const fs = clamp(r * 0.26, 10, 16);
  return (
    <g transform={`translate(${x} ${y})`}>
      {centers.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={COLORS[i]} fillOpacity={0.3} stroke={COLORS[i]} strokeWidth={1.5} strokeOpacity={0.75} />
      ))}
      {centers.map(([cx, cy], i) => {
        const dx = cx - mx;
        const dy = cy - my;
        const len = Math.hypot(dx, dy) || 1;
        return (
          <text
            key={i}
            x={cx + (dx / len) * r * 0.52}
            y={cy + (dy / len) * r * 0.52 + fs * 0.35}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={fs}
            fontWeight={600}
            fill={INK}
            fillOpacity={0.72}
          >
            {labels[i] ?? ""}
          </text>
        );
      })}
    </g>
  );
};
