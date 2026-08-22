import { ACCENT, FILL, FONT, RADIUS, str, strs, uid, type Template } from "./types";

/**
 * button — rounded rect with centered label.
 * params.fill: "solid" (accent) | "outline" | "gradient" (params.colors)
 */
export const button: Template = (props) => {
  const { x, y, width: w, height: h, params, label } = props;
  const mode = str(params, "fill", "solid");
  const id = uid("button", props);
  // Gradient colors arrive flat (params.colors) or nested (params.gradient.colors,
  // the base-shape convention) — accept both; a hex in params.fill is a custom solid.
  const nested = (params?.gradient as { colors?: unknown } | undefined)?.colors;
  const nestedColors = Array.isArray(nested)
    ? nested.filter((c): c is string => typeof c === "string")
    : [];
  const colors = nestedColors.length > 0 ? nestedColors : strs(params, "colors", [ACCENT, "#8b5cf6"]);
  const gradient = mode === "gradient" || nestedColors.length > 0;
  const r = Math.min(RADIUS, h / 2);
  const fontSize = Math.max(11, Math.min(16, h * 0.36));
  // Anything that isn't a mode keyword is a custom paint (hex or CSS color name).
  const paint = gradient
    ? `url(#${id}-g)`
    : mode === "outline"
      ? FILL
      : mode !== "solid"
        ? mode
        : ACCENT;
  const textFill = mode === "outline" ? ACCENT : "#ffffff";
  return (
    <g transform={`translate(${x} ${y})`}>
      {gradient && (
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            {colors.map((c, i) => (
              <stop key={i} offset={colors.length > 1 ? i / (colors.length - 1) : 0} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
      )}
      <rect
        width={w}
        height={h}
        rx={r}
        fill={paint}
        stroke={mode === "outline" ? ACCENT : "none"}
        strokeWidth={mode === "outline" ? 1.5 : 0}
      />
      <text
        x={w / 2}
        y={h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={FONT}
        fontSize={fontSize}
        fontWeight={600}
        fill={textFill}
      >
        {label ?? "Button"}
      </text>
    </g>
  );
};
