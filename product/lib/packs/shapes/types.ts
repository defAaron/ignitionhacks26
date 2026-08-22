import { createElement, type ReactElement } from "react";
import {
  ACCENT,
  FAINT,
  FILL,
  FONT,
  INK,
  MONO,
  MUTED,
  RADIUS,
  STROKE,
  bool,
  mulberry32,
  num,
  nums,
  rngFrom,
  smoothPath,
  str,
  strs,
  type TemplateProps,
} from "../web-ui/types";

/* Design tokens, seeded RNG and typed param getters are shared with the web-ui pack — one look across packs. */
export {
  ACCENT,
  FAINT,
  FILL,
  FONT,
  INK,
  MONO,
  MUTED,
  RADIUS,
  STROKE,
  bool,
  mulberry32,
  num,
  nums,
  rngFrom,
  smoothPath,
  str,
  strs,
};

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PathPoint {
  x: number;
  y: number;
}

/**
 * Shapes-first template contract (vocabulary.md §0: geometry from ink, semantics from
 * the model, precision from code). `bbox` and `path` ARRIVE from the source strokes —
 * any snap policy has already been applied by the caller. Templates style geometry;
 * they never move, resize or invent it.
 */
export interface ShapeTemplateProps {
  bbox: BBox;
  /** Smoothed source-stroke path (artboard coords) — present for smooth_path / line / arrow. */
  path?: PathPoint[];
  params?: Record<string, unknown>;
}

/** A shape template renders one op as an SVG <g> from ink-derived geometry. */
export type ShapeTemplate = (props: ShapeTemplateProps) => ReactElement;

/** Deterministic collision-safe id for <defs> entries — same djb2 pattern as web-ui `uid`. */
export function shapeUid(op: string, props: ShapeTemplateProps): string {
  const { x, y, width, height } = props.bbox;
  const raw = `${op}|${x},${y},${width},${height}|${JSON.stringify(props.params ?? {})}|${JSON.stringify(
    props.path ?? []
  )}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h * 33) ^ raw.charCodeAt(i)) >>> 0;
  return `${op}-${h.toString(36)}`;
}

/* ---- fill / gradient resolution (shapes-v1 params conventions) ---- */

export interface GradientSpec {
  colors: string[];
  direction: "down" | "right" | "diagonal" | "radial";
}

const DIRECTIONS: ReadonlySet<string> = new Set(["down", "right", "diagonal", "radial"]);
const LINEAR_AXES: Record<"down" | "right" | "diagonal", { x2: string; y2: string }> = {
  down: { x2: "0", y2: "1" },
  right: { x2: "1", y2: "0" },
  diagonal: { x2: "1", y2: "1" },
};

/** Validated read of `params.gradient` ({colors[], direction}), or null when absent/malformed. */
export function readGradient(params: Record<string, unknown> | undefined): GradientSpec | null {
  const g = params?.gradient;
  if (typeof g !== "object" || g === null) return null;
  const rec = g as Record<string, unknown>;
  const colors = Array.isArray(rec.colors)
    ? rec.colors.filter((c): c is string => typeof c === "string")
    : [];
  if (colors.length === 0) return null;
  const direction =
    typeof rec.direction === "string" && DIRECTIONS.has(rec.direction)
      ? (rec.direction as GradientSpec["direction"])
      : "down";
  return { colors: colors.length === 1 ? [colors[0], colors[0]] : colors, direction };
}

export interface Paint {
  /** SVG fill value — a css color, "none", or `url(#…)` when `defs` is non-null. */
  fill: string;
  /** Render inside the template's <g> when non-null (gradient <defs>). */
  defs: ReactElement | null;
}

/**
 * Resolve `params.fill` (css color) / `params.gradient` into an SVG paint.
 * Gradient wins over fill; ids come from `shapeUid` so multiple instances never collide.
 */
export function resolvePaint(op: string, props: ShapeTemplateProps, fallback = "none"): Paint {
  const grad = readGradient(props.params);
  if (!grad) return { fill: str(props.params, "fill", fallback), defs: null };
  const id = `${shapeUid(op, props)}-fill`;
  const stops = grad.colors.map((c, i) =>
    createElement("stop", {
      key: i,
      offset: grad.colors.length > 1 ? i / (grad.colors.length - 1) : 0,
      stopColor: c,
    })
  );
  const gradient =
    grad.direction === "radial"
      ? createElement("radialGradient", { id, cx: "0.5", cy: "0.5", r: "0.72" }, stops)
      : createElement("linearGradient", { id, x1: "0", y1: "0", ...LINEAR_AXES[grad.direction] }, stops);
  return { fill: `url(#${id})`, defs: createElement("defs", null, gradient) };
}

/* ---- stroke resolution ---- */

export interface StrokeSpec {
  color: string;
  width: number;
}

export const INK_STROKE: StrokeSpec = { color: INK, width: 2 };
export const NO_STROKE: StrokeSpec = { color: "none", width: 0 };

/** Validated read of `params.stroke` ({color, width}) with a per-op fallback. */
export function readStroke(params: Record<string, unknown> | undefined, fallback: StrokeSpec): StrokeSpec {
  const s = params?.stroke;
  if (typeof s !== "object" || s === null) return fallback;
  const rec = s as Record<string, unknown>;
  return {
    color: typeof rec.color === "string" ? rec.color : fallback.color,
    width: typeof rec.width === "number" && Number.isFinite(rec.width) ? rec.width : fallback.width,
  };
}

/** Ink-path endpoints for line/arrow; falls back to the bbox's long-axis midline. */
export function endpoints(props: ShapeTemplateProps): [PathPoint, PathPoint] {
  const p = props.path;
  if (p && p.length >= 2) return [p[0], p[p.length - 1]];
  const { x, y, width, height } = props.bbox;
  return width >= height
    ? [
        { x, y: y + height / 2 },
        { x: x + width, y: y + height / 2 },
      ]
    : [
        { x: x + width / 2, y },
        { x: x + width / 2, y: y + height },
      ];
}

/** Adapt shapes-props → the web-ui pack's bbox contract (`params.label` routes to `label`). */
export function legacyProps(props: ShapeTemplateProps): TemplateProps {
  const { bbox, params } = props;
  const rawLabel = params?.label;
  return {
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    params,
    label: typeof rawLabel === "string" ? rawLabel : undefined,
  };
}
