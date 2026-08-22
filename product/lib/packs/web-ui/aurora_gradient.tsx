import { num, rngFrom, str, strs, uid, type Template } from "./types";

const PALETTES: Record<string, string[]> = {
  aurora: ["#4f6ef7", "#38d9c3", "#9f7bff", "#4fa8f7"],
  sunset: ["#f76e6e", "#f5a623", "#e64fb0", "#7b4ff7"],
  candy: ["#ff8fd8", "#8fb8ff", "#b7ff8f", "#ffd68f"],
};

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Resolve the aurora colors from params, honoring REAL observed colors first:
 * params.gradient.colors > params.colors > palette-as-color-array >
 * palette-as-hex > named palette > default. Only an unknown NAMED palette
 * falls back to the default aurora colors.
 */
function auroraColors(params: Record<string, unknown> | undefined): string[] {
  const grad = params?.["gradient"];
  if (grad !== null && typeof grad === "object" && !Array.isArray(grad)) {
    const gc = (grad as { colors?: unknown }).colors;
    if (Array.isArray(gc) && gc.length > 0 && gc.every((c) => typeof c === "string")) {
      return gc as string[];
    }
  }
  const palette = params?.["palette"];
  const fallback =
    Array.isArray(palette) && palette.length > 0 && palette.every((c) => typeof c === "string")
      ? (palette as string[]) // explicit color list where the name usually goes
      : typeof palette === "string" && HEX_COLOR.test(palette.trim())
        ? [palette.trim()] // a real hex in palette is a real color — honor it
        : PALETTES[str(params, "palette", "aurora")] ?? PALETTES.aurora;
  return strs(params, "colors", fallback);
}

/**
 * aurora_gradient — 3–5 blurred ellipses over a deep backdrop (Stripe/Linear glow).
 * params: palette (name, hex, or color array — hex/arrays are used as the actual
 * colors), gradient {colors} / params.colors (explicit colors, highest priority),
 * blob_count (3–5), blur_radius, background, seed.
 */
export const aurora_gradient: Template = (props) => {
  const { x, y, width: w, height: h, params } = props;
  const colors = auroraColors(params);
  const blobCount = Math.max(3, Math.min(5, num(params, "blob_count", 4)));
  const blur = num(params, "blur_radius", Math.min(w, h) / 5);
  const background = str(params, "background", "#0e1224");
  const rng = rngFrom(params, 17);
  const id = uid("aurora_gradient", props);

  const blobs: Array<{ cx: number; cy: number; rx: number; ry: number; rot: number; c: string }> = [];
  for (let i = 0; i < blobCount; i++) {
    blobs.push({
      cx: w * (0.15 + rng() * 0.7),
      cy: h * (0.2 + rng() * 0.6),
      rx: w * (0.18 + rng() * 0.22),
      ry: h * (0.18 + rng() * 0.25),
      rot: rng() * 180,
      c: colors[i % colors.length],
    });
  }

  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect width={w} height={h} rx={10} />
        </clipPath>
        <filter id={`${id}-blur`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={w} height={h} fill={background} />
        <g filter={`url(#${id}-blur)`}>
          {blobs.map((b, i) => (
            <ellipse
              key={i}
              cx={b.cx.toFixed(1)}
              cy={b.cy.toFixed(1)}
              rx={b.rx.toFixed(1)}
              ry={b.ry.toFixed(1)}
              transform={`rotate(${b.rot.toFixed(1)} ${b.cx.toFixed(1)} ${b.cy.toFixed(1)})`}
              fill={b.c}
              fillOpacity={0.75}
            />
          ))}
        </g>
        {/* subtle top sheen keeps it from reading flat */}
        <rect width={w} height={h} fill="#ffffff" fillOpacity={0.03} />
      </g>
    </g>
  );
};
