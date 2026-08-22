import { FAINT, RADIUS, STROKE, str, uid, type Template } from "./types";

/**
 * image — placeholder frame. params.variant: "photo" (sun + mountains glyph, default) | "x" (corner-to-corner wireframe X).
 */
export const image: Template = (props) => {
  const { x, y, width: w, height: h, params } = props;
  const variant = str(params, "variant", "photo");
  const id = uid("image", props);
  const r = Math.min(RADIUS, w / 4, h / 4);
  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect width={w} height={h} rx={r} />
        </clipPath>
      </defs>
      <rect width={w} height={h} rx={r} fill={FAINT} stroke={STROKE} strokeWidth={1} />
      {variant === "x" ? (
        <g stroke={STROKE} strokeWidth={1.5} clipPath={`url(#${id}-clip)`}>
          <line x1={0} y1={0} x2={w} y2={h} />
          <line x1={w} y1={0} x2={0} y2={h} />
        </g>
      ) : (
        <g clipPath={`url(#${id}-clip)`}>
          <circle cx={w * 0.32} cy={h * 0.3} r={Math.min(w, h) * 0.1} fill="#d8d8dc" />
          <path
            d={`M ${-w * 0.05} ${h} L ${w * 0.38} ${h * 0.48} L ${w * 0.62} ${h * 0.78} L ${w * 0.78} ${h * 0.58} L ${w * 1.05} ${h} Z`}
            fill="#d8d8dc"
          />
        </g>
      )}
    </g>
  );
};
