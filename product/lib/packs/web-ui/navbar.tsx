import { ACCENT, FILL, FONT, INK, STROKE, bool, num, type Template } from "./types";

const LINK_NAMES = ["Home", "Features", "Pricing", "About", "Blog", "Docs"];

/**
 * navbar — full-width top bar: accent logo mark + wordmark left, real link text right, optional CTA pill.
 * params.links: number of links (default 4); params.cta: show accent button (default true); label = brand name.
 */
export const navbar: Template = (props) => {
  const { x, y, width: w, height: h, params, label } = props;
  const links = Math.max(0, Math.min(6, num(params, "links", 4)));
  const cta = bool(params, "cta", true);
  const cy = h / 2;
  const pad = Math.min(24, w * 0.04);
  const fs = Math.max(10, Math.min(13, h * 0.28));
  const ctaW = fs * 5.2;
  const ctaH = Math.min(h * 0.62, fs * 2.4);
  const linkGap = fs * 5;
  const linksRight = cta ? w - pad - ctaW - fs * 1.8 : w - pad;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} fill={FILL} />
      <line x1={0} y1={h - 0.5} x2={w} y2={h - 0.5} stroke={STROKE} strokeWidth={1} />
      {/* logo mark + wordmark */}
      <rect x={pad} y={cy - fs * 0.85} width={fs * 1.7} height={fs * 1.7} rx={5} fill={ACCENT} />
      <text
        x={pad + fs * 2.4}
        y={cy}
        dominantBaseline="central"
        fontFamily={FONT}
        fontSize={fs * 1.15}
        fontWeight={700}
        fill={INK}
      >
        {label ?? "baio"}
      </text>
      {/* links, right-aligned */}
      {Array.from({ length: links }, (_, i) => (
        <text
          key={i}
          x={linksRight - (links - 1 - i) * linkGap}
          y={cy}
          textAnchor="end"
          dominantBaseline="central"
          fontFamily={FONT}
          fontSize={fs}
          fill={i === 0 ? ACCENT : "#555"}
        >
          {LINK_NAMES[i % LINK_NAMES.length]}
        </text>
      ))}
      {cta && (
        <g>
          <rect x={w - pad - ctaW} y={cy - ctaH / 2} width={ctaW} height={ctaH} rx={ctaH / 2} fill={ACCENT} />
          <text
            x={w - pad - ctaW / 2}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={FONT}
            fontSize={fs}
            fontWeight={600}
            fill="#fff"
          >
            Sign up
          </text>
        </g>
      )}
    </g>
  );
};
