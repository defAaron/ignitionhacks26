import { FAINT, FONT, RADIUS, type ShapeTemplate } from "./types";

/**
 * placeholder — glyph `box + ?` → generic "something goes here" slot:
 * faint surface, dashed border, centered question mark.
 */
export const placeholder: ShapeTemplate = (props) => {
  const { x, y, width: w, height: h } = props.bbox;
  const r = Math.min(RADIUS, w / 4, h / 4);
  const fs = Math.min(w, h) * 0.34;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width={w}
        height={h}
        rx={r}
        fill={FAINT}
        stroke="#b9b9c0"
        strokeWidth={1.5}
        strokeDasharray="7 6"
      />
      <text
        x={w / 2}
        y={h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={FONT}
        fontSize={fs}
        fontWeight={700}
        fill="#9a9aa0"
      >
        ?
      </text>
    </g>
  );
};
