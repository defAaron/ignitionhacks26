import { ACCENT, RADIUS, shapeUid, type ShapeTemplate } from "./types";

/**
 * video — glyph `box + v` → dark player frame: subtle vertical sheen, centered white
 * play disc with a dark triangle, and an accent progress bar with a scrubber knob.
 */
export const video: ShapeTemplate = (props) => {
  const { x, y, width: w, height: h } = props.bbox;
  const id = shapeUid("video", props);
  const r = Math.min(RADIUS + 2, w / 4, h / 4);
  const pad = Math.max(10, Math.min(w, h) * 0.08);
  const barY = h - pad;
  const pr = Math.min(w, h) * 0.17; // play disc radius
  const cx = w / 2;
  const cy = (barY - pad * 0.2) / 2 + pad * 0.1; // optically centered above the bar
  const played = pad + (w - pad * 2) * 0.35;
  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <linearGradient id={`${id}-frame`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262b36" />
          <stop offset="1" stopColor="#14171f" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <rect width={w} height={h} rx={r} />
        </clipPath>
      </defs>
      <rect width={w} height={h} rx={r} fill={`url(#${id}-frame)`} stroke="#0d0f14" strokeWidth={1} />
      <g clipPath={`url(#${id}-clip)`}>
        {/* faint screen sheen */}
        <rect width={w} height={h * 0.45} fill="#ffffff" fillOpacity={0.035} />
        <circle cx={cx} cy={cy} r={pr} fill="#ffffff" fillOpacity={0.94} />
        <path
          d={`M ${(cx - pr * 0.3).toFixed(2)} ${(cy - pr * 0.48).toFixed(2)} L ${(cx + pr * 0.56).toFixed(
            2
          )} ${cy.toFixed(2)} L ${(cx - pr * 0.3).toFixed(2)} ${(cy + pr * 0.48).toFixed(2)} Z`}
          fill="#14171f"
        />
        {/* progress bar */}
        <line x1={pad} y1={barY} x2={w - pad} y2={barY} stroke="#ffffff" strokeOpacity={0.25} strokeWidth={3} strokeLinecap="round" />
        <line x1={pad} y1={barY} x2={played} y2={barY} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
        <circle cx={played} cy={barY} r={4} fill={ACCENT} stroke="#ffffff" strokeWidth={1.2} />
      </g>
    </g>
  );
};
