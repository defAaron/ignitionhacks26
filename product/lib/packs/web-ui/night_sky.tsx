import { num, nums, rngFrom, uid, type Template } from "./types";

/**
 * night_sky — vertical gradient dark sky + seeded starfield.
 * params: density (0–1), size_range [min,max] px, cluster_bias (0–1, pulls stars upward), seed.
 */
export const night_sky: Template = (props) => {
  const { x, y, width: w, height: h, params } = props;
  const density = Math.max(0, Math.min(1, num(params, "density", 0.5)));
  const [sMin, sMax] = nums(params, "size_range", [0.6, 1.8]);
  const clusterBias = Math.max(0, Math.min(1, num(params, "cluster_bias", 0.6)));
  const rng = rngFrom(params, 7);
  const id = uid("night_sky", props);
  const count = Math.round(((w * h) / 4000) * (0.25 + density * 1.5));

  const stars: Array<{ sx: number; sy: number; r: number; o: number; cross: boolean }> = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      sx: rng() * w,
      sy: h * Math.pow(rng(), 1 + clusterBias * 2), // bias toward the top of the sky
      r: sMin + rng() * Math.max(0.01, sMax - sMin),
      o: 0.4 + rng() * 0.6,
      cross: rng() > 0.88, // occasional 4-point twinkle
    });
  }

  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1026" />
          <stop offset="0.6" stopColor="#1b2a55" />
          <stop offset="1" stopColor="#2f4470" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <rect width={w} height={h} rx={8} />
        </clipPath>
      </defs>
      <rect width={w} height={h} rx={8} fill={`url(#${id}-sky)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {stars.map((s, i) =>
          s.cross ? (
            <g key={i} stroke="#fff" strokeOpacity={s.o} strokeWidth={0.8} strokeLinecap="round">
              <line x1={s.sx - s.r * 2.4} y1={s.sy} x2={s.sx + s.r * 2.4} y2={s.sy} />
              <line x1={s.sx} y1={s.sy - s.r * 2.4} x2={s.sx} y2={s.sy + s.r * 2.4} />
            </g>
          ) : (
            <circle key={i} cx={s.sx} cy={s.sy} r={s.r} fill="#fff" fillOpacity={s.o} />
          )
        )}
      </g>
    </g>
  );
};
