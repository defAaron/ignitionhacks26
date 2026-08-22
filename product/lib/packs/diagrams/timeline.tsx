import { ACCENT, FILL, FONT, INK, STROKE, strs, type ShapeTemplate } from "../shapes/types";
import { clamp } from "./util";

/**
 * timeline — horizontal spine + milestone dots with alternating above/below labels and an accent endpoint arrow.
 * params: events (string[], default 4 generic milestones).
 */
export const timeline: ShapeTemplate = ({ bbox, params }) => {
  const { x, y, width: w, height: h } = bbox;
  const events = strs(params, "events", ["Kickoff", "Design", "Build", "Launch"]);
  const n = events.length;
  const sy = h / 2;
  const ax = w - 2; // arrow tip
  const x0 = 6;
  const x1 = w - 26; // last dot leaves room for the arrow
  const dotX = (i: number) => (n > 1 ? x0 + (i * (x1 - x0)) / (n - 1) : (x0 + x1) / 2);
  const off = clamp(h * 0.3, 18, 34);
  const fs = clamp(w / (n * 9), 9, 11);
  return (
    <g transform={`translate(${x} ${y})`}>
      <line x1={x0 - 4} y1={sy} x2={ax - 8} y2={sy} stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <path d={`M ${ax} ${sy} L ${ax - 10} ${sy - 5.5} L ${ax - 10} ${sy + 5.5} Z`} fill={ACCENT} />
      {events.map((ev, i) => {
        const cx = dotX(i);
        const up = i % 2 === 0;
        const textY = up ? sy - off : sy + off;
        const tickEnd = up ? sy - off + 4 : sy + off - fs - 4;
        return (
          <g key={i}>
            <line x1={cx} y1={up ? sy - 8 : sy + 8} x2={cx} y2={tickEnd} stroke={STROKE} strokeWidth={1.2} />
            <circle cx={cx} cy={sy} r={5.5} fill={FILL} stroke={ACCENT} strokeWidth={2} />
            <circle cx={cx} cy={sy} r={2} fill={ACCENT} />
            <text x={cx} y={textY} textAnchor="middle" fontFamily={FONT} fontSize={fs} fontWeight={600} fill={INK} fillOpacity={0.75}>
              {ev}
            </text>
          </g>
        );
      })}
    </g>
  );
};
