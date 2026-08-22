import { ACCENT, bool, num, rngFrom, smoothPath, strs, uid, type Template } from "./types";

/**
 * wave_divider — layered smooth bezier waves filling down to the bbox bottom.
 * params: amplitude (px), layers (1–5), flip (mirror vertically), colors, seed.
 */
export const wave_divider: Template = (props) => {
  const { x, y, width: w, height: h, params } = props;
  const layers = Math.max(1, Math.min(5, num(params, "layers", 3)));
  const amplitude = Math.min(num(params, "amplitude", h * 0.28), h * 0.45);
  const flip = bool(params, "flip", false);
  const colors = strs(params, "colors", [ACCENT]);
  const rng = rngFrom(params, 5);
  const id = uid("wave_divider", props);

  const layerPaths: Array<{ d: string; color: string; opacity: number }> = [];
  for (let L = 0; L < layers; L++) {
    // back layers are taller and fainter; front layer is full-strength
    const depth = layers === 1 ? 1 : L / (layers - 1); // 0 = back, 1 = front
    const amp = amplitude * (0.55 + 0.45 * depth);
    const base = h * (0.35 + 0.3 * depth);
    const crests = 3 + Math.floor(rng() * 2); // 3–4 crests per layer
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= crests; i++) {
      const px = (w / crests) * i + (i > 0 && i < crests ? (rng() - 0.5) * (w / crests) * 0.3 : 0);
      const dir = i % 2 === 0 ? -1 : 1;
      const py = base + dir * amp * (0.6 + rng() * 0.4);
      pts.push([px, py]);
    }
    const d = `${smoothPath(pts, false)} L ${w} ${h} L 0 ${h} Z`;
    layerPaths.push({
      d,
      color: colors[L % colors.length],
      opacity: 0.18 + 0.82 * Math.pow(depth, 1.6),
    });
  }

  return (
    <g transform={flip ? `translate(${x} ${y + h}) scale(1 -1)` : `translate(${x} ${y})`}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        {layerPaths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} fillOpacity={p.opacity} />
        ))}
      </g>
    </g>
  );
};
