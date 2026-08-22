import { FONT, INK, str, type ShapeTemplate } from "./types";

/**
 * text — handwriting typeset in the design-token type ramp. Size follows the ink bbox
 * height (small box → body weight, tall box → heading weight + tighter tracking), and
 * is clamped so the content fits the bbox width.
 * params: text (content), fill (color), align ("left" | "center").
 */
export const text: ShapeTemplate = (props) => {
  const { x, y, width: w, height: h } = props.bbox;
  const content = str(props.params, "text", "Text");
  const fill = str(props.params, "fill", INK);
  const align = str(props.params, "align", "left");
  const len = Math.max(1, content.length);
  const fontSize = Math.max(10, Math.min(h * 0.62, w / (len * 0.58)));
  const heading = fontSize >= 26;
  return (
    <g>
      <text
        x={align === "center" ? x + w / 2 : x}
        y={y + h / 2}
        textAnchor={align === "center" ? "middle" : "start"}
        dominantBaseline="central"
        fontFamily={FONT}
        fontSize={fontSize}
        fontWeight={heading ? 800 : fontSize >= 16 ? 600 : 400}
        letterSpacing={heading ? "-0.02em" : "0"}
        fill={fill}
      >
        {content}
      </text>
    </g>
  );
};
