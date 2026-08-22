import { ACCENT, FILL, FONT, RADIUS, STROKE, num, type Template } from "./types";

const FIELD_NAMES = ["Name", "Email", "Message", "Company", "Phone"];

/**
 * form — stacked labeled inputs + accent submit button.
 * params.fields: 2–5 (default 3); label = submit button text.
 */
export const form: Template = (props) => {
  const { x, y, width: w, height: h, params, label } = props;
  const fields = Math.max(1, Math.min(5, num(params, "fields", 3)));
  const pad = Math.min(20, w * 0.06);
  const innerW = w - pad * 2;
  const btnH = 36;
  const avail = h - pad * 2 - btnH - 12;
  const rowH = avail / fields;
  const labelH = 12;
  const inputH = Math.min(38, rowH - labelH - 8);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx={RADIUS} fill={FILL} stroke={STROKE} strokeWidth={1} />
      {Array.from({ length: fields }, (_, i) => {
        const fy = pad + i * rowH;
        return (
          <g key={i} transform={`translate(${pad} ${fy})`}>
            <text fontFamily={FONT} fontSize={10} fontWeight={600} fill="#555" y={labelH - 4}>
              {FIELD_NAMES[i % FIELD_NAMES.length]}
            </text>
            <rect y={labelH} width={innerW} height={inputH} rx={6} fill={FILL} stroke={STROKE} strokeWidth={1} />
          </g>
        );
      })}
      <rect x={pad} y={h - pad - btnH} width={innerW} height={btnH} rx={8} fill={ACCENT} />
      <text
        x={w / 2}
        y={h - pad - btnH / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={FONT}
        fontSize={13}
        fontWeight={600}
        fill="#fff"
      >
        {label ?? "Submit"}
      </text>
    </g>
  );
};
