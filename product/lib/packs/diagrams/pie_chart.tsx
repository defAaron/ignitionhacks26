import { ACCENT, FILL, FONT, INK, nums, rngFrom, strs, type ShapeTemplate } from "../shapes/types";
import { mix } from "./util";

const TAU = Math.PI * 2;

/**
 * pie_chart — accent-ramp wedges separated by 2px white gaps; a wide bbox gets side legend dots.
 * params: values (number[], default seeded 3–5), labels (string[]), seed.
 */
export const pie_chart: ShapeTemplate = ({ bbox, params }) => {
  const { x, y, width: w, height: h } = bbox;
  const rng = rngFrom(params, 23);
  const seeded = Array.from({ length: 3 + Math.floor(rng() * 3) }, () => 12 + Math.round(rng() * 40));
  const values = nums(params, "values", seeded).filter((v) => v > 0);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const n = values.length;
  const labels = strs(params, "labels", values.map((_, i) => `Item ${i + 1}`));
  const wide = w >= h * 1.5;
  const R = Math.min(h, wide ? w * 0.55 : w) / 2 - 2;
  const cx = wide ? 2 + R : w / 2;
  const cy = h / 2;
  const color = (i: number) => mix(ACCENT, FILL, n > 1 ? (i / n) * 0.7 : 0);
  let a = -Math.PI / 2;
  const wedges = values.map((v, i) => {
    const a0 = a;
    a += (v / total) * TAU;
    const large = a - a0 > Math.PI ? 1 : 0;
    const p = (ang: number) => `${(cx + R * Math.cos(ang)).toFixed(2)} ${(cy + R * Math.sin(ang)).toFixed(2)}`;
    return { d: `M ${cx} ${cy} L ${p(a0)} A ${R} ${R} 0 ${large} 1 ${p(a - 0.0001)} Z`, fill: color(i) };
  });
  return (
    <g transform={`translate(${x} ${y})`}>
      {n === 1 ? (
        <circle cx={cx} cy={cy} r={R} fill={color(0)} />
      ) : (
        wedges.map((s, i) => <path key={i} d={s.d} fill={s.fill} stroke={FILL} strokeWidth={2} strokeLinejoin="round" />)
      )}
      {wide &&
        labels.slice(0, n).map((lab, i) => {
          const ly = cy - ((n - 1) * 15) / 2 + i * 15;
          return (
            <g key={i}>
              <circle cx={cx + R + 14} cy={ly} r={4} fill={color(i)} />
              <text x={cx + R + 23} y={ly + 3.2} fontFamily={FONT} fontSize={10} fill={INK} fillOpacity={0.7}>
                {lab}
              </text>
            </g>
          );
        })}
    </g>
  );
};
