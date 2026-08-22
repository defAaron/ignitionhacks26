import { ACCENT, FILL, FONT, INK, MUTED, nums, rngFrom, strs, type ShapeTemplate } from "../shapes/types";
import { mix } from "./util";

/**
 * bar_chart — axes + N bars with per-bar accent lightness steps and faint gridlines.
 * params: values (number[], default seeded 4–6), labels (string[]), seed.
 */
export const bar_chart: ShapeTemplate = ({ bbox, params }) => {
  const { x, y, width: w, height: h } = bbox;
  const rng = rngFrom(params, 11);
  const seeded = Array.from({ length: 4 + Math.floor(rng() * 3) }, () => 18 + Math.round(rng() * 78));
  const values = nums(params, "values", seeded).map((v) => Math.max(0, v));
  const labels = strs(params, "labels", []);
  const padB = labels.length > 0 ? 16 : 6;
  const ox = 6; // y-axis inset
  const oy = 4;
  const cw = w - ox - 4;
  const ch = h - oy - padB;
  const max = Math.max(...values, 1);
  const n = values.length;
  const gap = Math.min(16, (cw / n) * 0.28);
  const bw = (cw - gap * (n - 1)) / n;
  const baseY = oy + ch;
  const bar = (v: number, i: number): string => {
    const bh = Math.max(1.5, (v / max) * (ch - 6));
    const bx = ox + i * (bw + gap);
    const by = baseY - bh;
    const r = Math.min(3.5, bw / 2, bh); // rounded top corners only
    return `M ${bx} ${baseY} L ${bx} ${by + r} Q ${bx} ${by} ${bx + r} ${by} L ${bx + bw - r} ${by} Q ${bx + bw} ${by} ${bx + bw} ${by + r} L ${bx + bw} ${baseY} Z`;
  };
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={ox} y1={baseY - (ch - 6) * t} x2={ox + cw} y2={baseY - (ch - 6) * t} stroke={MUTED} strokeWidth={1} />
      ))}
      {values.map((v, i) => (
        <path key={i} d={bar(v, i)} fill={mix(ACCENT, FILL, n > 1 ? (i / (n - 1)) * 0.55 : 0)} />
      ))}
      <line x1={ox} y1={oy} x2={ox} y2={baseY} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      <line x1={ox} y1={baseY} x2={ox + cw} y2={baseY} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      {labels.length > 0 &&
        bw >= 16 &&
        values.map((_, i) => (
          <text
            key={i}
            x={ox + i * (bw + gap) + bw / 2}
            y={h - 3}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={9.5}
            fill={INK}
            fillOpacity={0.6}
          >
            {labels[i] ?? ""}
          </text>
        ))}
    </g>
  );
};
