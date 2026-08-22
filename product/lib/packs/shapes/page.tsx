import { FAINT, FONT, RADIUS, STROKE, type ShapeTemplate } from "./types";

/**
 * page — glyph `box + p` → the PAGE object preview. A page is not a normal
 * element: committing it spawns a NEW page in the liminal space (see Studio /
 * lib/space addPage). This template is only ever the PREVIEW ghost of that
 * spawn, so it reads as a little window: a titlebar with traffic lights over a
 * paper body, hinting "a page appears here".
 */
export const page: ShapeTemplate = (props) => {
  const { x, y, width: w, height: h } = props.bbox;
  const r = Math.min(RADIUS, w / 6, h / 6);
  const bar = Math.max(12, Math.min(h * 0.16, 26)); // titlebar height
  const dot = Math.max(2, bar * 0.18);
  const cy = bar / 2;
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* Paper body */}
      <rect
        width={w}
        height={h}
        rx={r}
        fill="#ffffff"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      {/* Titlebar strip */}
      <path
        d={`M0 ${bar} V${r} Q0 0 ${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${bar} Z`}
        fill={FAINT}
        stroke={STROKE}
        strokeWidth={1.5}
      />
      {/* Traffic lights */}
      <circle cx={bar * 0.7} cy={cy} r={dot} fill="#e0605a" />
      <circle cx={bar * 0.7 + dot * 3} cy={cy} r={dot} fill="#e6b04a" />
      <circle cx={bar * 0.7 + dot * 6} cy={cy} r={dot} fill="#5bb85b" />
      {/* A centered "p" so the page glyph reads at a glance */}
      <text
        x={w / 2}
        y={bar + (h - bar) / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={FONT}
        fontSize={Math.min(w, h - bar) * 0.34}
        fontWeight={700}
        fill="#b8b8bf"
      >
        p
      </text>
    </g>
  );
};
