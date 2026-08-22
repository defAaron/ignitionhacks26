import { ACCENT, num, nums, rngFrom, strs, type Template } from "./types";

/** Concave 4-point star path centered at origin, arm length s. */
function sparklePath(s: number): string {
  const p = s * 0.18; // pinch — smaller = pointier
  return `M 0 ${-s} Q ${p} ${-p} ${s} 0 Q ${p} ${p} 0 ${s} Q ${-p} ${p} ${-s} 0 Q ${-p} ${-p} 0 ${-s} Z`;
}

/**
 * sparkles — seeded cluster of 4-point "AI shimmer" stars.
 * params: count, size_range [min,max] px, spread (0–1, fraction of bbox used), colors, seed.
 */
export const sparkles: Template = (props) => {
  const { x, y, width: w, height: h, params } = props;
  const count = Math.max(1, Math.min(24, num(params, "count", 7)));
  const [sMin, sMax] = nums(params, "size_range", [5, 13]);
  const spread = Math.max(0.2, Math.min(1, num(params, "spread", 0.9)));
  const colors = strs(params, "colors", [ACCENT, "#f5a623"]);
  const rng = rngFrom(params, 11);

  const cx = w / 2, cy = h / 2;
  const items: Array<{ px: number; py: number; s: number; rot: number; c: string; o: number }> = [];
  for (let i = 0; i < count; i++) {
    items.push({
      px: cx + (rng() - 0.5) * w * spread,
      py: cy + (rng() - 0.5) * h * spread,
      s: sMin + rng() * Math.max(0.01, sMax - sMin),
      rot: (rng() - 0.5) * 30,
      c: colors[Math.floor(rng() * colors.length)],
      o: 0.65 + rng() * 0.35,
    });
  }
  // draw big sparkles last so they sit on top
  items.sort((a, b) => a.s - b.s);

  return (
    <g transform={`translate(${x} ${y})`}>
      {items.map((sp, i) => (
        <g key={i} transform={`translate(${sp.px.toFixed(2)} ${sp.py.toFixed(2)}) rotate(${sp.rot.toFixed(1)})`}>
          <path d={sparklePath(sp.s)} fill={sp.c} fillOpacity={sp.o} />
          {sp.s > (sMin + sMax) / 2 && <circle r={sp.s * 0.14} fill="#fff" fillOpacity={0.9} />}
        </g>
      ))}
    </g>
  );
};
