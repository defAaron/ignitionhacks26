import { ACCENT, FILL, STROKE, num, nums, rngFrom, type ShapeTemplate } from "../shapes/types";
import { clamp, mix } from "./util";

const CAPACITY = [2, 8, 18, 32, 50];

/**
 * atomic_structure — seeded 2-tone nucleus cluster + tilted orbit ellipses with electrons per shell.
 * params: shells (default 3), electrons (number[], default [2,8,3…] trimmed), seed.
 */
export const atomic_structure: ShapeTemplate = ({ bbox, params }) => {
  const { x, y, width: w, height: h } = bbox;
  const shells = clamp(Math.round(num(params, "shells", 3)), 1, 5);
  const def = CAPACITY.slice(0, shells);
  if (shells > 1) def[shells - 1] = 3; // filled inner shells, light valence shell
  const electrons = nums(params, "electrons", def)
    .slice(0, shells)
    .map((k) => clamp(Math.round(k), 0, 50));
  const rng = rngFrom(params, 17);
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) / 2 - 5;
  const nucR = Math.max(6, maxR * 0.17);
  const eR = clamp(maxR * 0.045, 2, 4.2);
  const tones = [mix("#f76e6e", FILL, 0.12), mix(ACCENT, FILL, 0.18)];
  const nucleons = Array.from({ length: 10 + Math.floor(rng() * 4) }, (_, i) => {
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * nucR * 0.62;
    return { nx: cx + Math.cos(ang) * rad, ny: cy + Math.sin(ang) * rad, tone: tones[i % 2] };
  });
  const orbits = Array.from({ length: shells }, (_, i) => {
    const orx = nucR + ((i + 1) / shells) * (maxR - nucR);
    const ory = orx * 0.9;
    const tilt = -16 + i * 11; // slight rotation per shell for depth
    const rad = (tilt * Math.PI) / 180;
    const phase = rng() * Math.PI * 2;
    const k = electrons[i] ?? 0;
    const dots = Array.from({ length: k }, (_, j) => {
      const t = phase + (j * Math.PI * 2) / Math.max(1, k);
      const px = orx * Math.cos(t);
      const py = ory * Math.sin(t);
      return {
        ex: cx + px * Math.cos(rad) - py * Math.sin(rad),
        ey: cy + px * Math.sin(rad) + py * Math.cos(rad),
      };
    });
    return { orx, ory, tilt, dots };
  });
  return (
    <g transform={`translate(${x} ${y})`}>
      {orbits.map((o, i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={o.orx} ry={o.ory} transform={`rotate(${o.tilt} ${cx} ${cy})`} fill="none" stroke={STROKE} strokeWidth={1.2} />
      ))}
      {nucleons.map((p, i) => (
        <circle key={i} cx={p.nx} cy={p.ny} r={nucR * 0.34} fill={p.tone} stroke={FILL} strokeWidth={0.8} />
      ))}
      {orbits.map((o, i) =>
        o.dots.map((d, j) => <circle key={`${i}-${j}`} cx={d.ex} cy={d.ey} r={eR} fill={ACCENT} stroke={FILL} strokeWidth={1} />)
      )}
    </g>
  );
};
