import type { ReactElement } from "react";

/** Bounding-box contract shared by every template: the model emits {op, bbox, params}; the renderer owns the beauty. */
export interface TemplateProps {
  x: number;
  y: number;
  width: number;
  height: number;
  params?: Record<string, unknown>;
  label?: string;
}

/** A template renders one op as an absolutely-positioned SVG <g> at its bbox. */
export type Template = (props: TemplateProps) => ReactElement;

/* ---- design tokens (light design-system look) ---- */
export const INK = "#1a1a1a";
export const STROKE = "#d0d0d0";
export const FILL = "#ffffff";
export const MUTED = "#e4e4e7"; // wireframe text stubs
export const FAINT = "#f1f1f3"; // placeholder surfaces
export const ACCENT = "#0b764d";
export const RADIUS = 8;
export const FONT = "var(--font-ui, ui-sans-serif, system-ui, sans-serif)";
export const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** mulberry32 — tiny deterministic PRNG. ALL template randomness must flow through this via params.seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG seeded from params.seed (falls back to a fixed seed — never Math.random). */
export function rngFrom(params: Record<string, unknown> | undefined, fallbackSeed = 1): () => number {
  return mulberry32(num(params, "seed", fallbackSeed));
}

/* ---- typed param getters ---- */
export function num(p: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const v = p?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
export function str(p: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const v = p?.[key];
  return typeof v === "string" ? v : fallback;
}
export function bool(p: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const v = p?.[key];
  return typeof v === "boolean" ? v : fallback;
}
export function strs(p: Record<string, unknown> | undefined, key: string, fallback: string[]): string[] {
  const v = p?.[key];
  return Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string") ? (v as string[]) : fallback;
}
export function nums(p: Record<string, unknown> | undefined, key: string, fallback: number[]): number[] {
  const v = p?.[key];
  return Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === "number") ? (v as number[]) : fallback;
}

/** Deterministic unique id for <defs> entries (gradients/filters/clips) — collision-safe across a page. */
export function uid(op: string, props: TemplateProps): string {
  const raw = `${op}|${props.x},${props.y},${props.width},${props.height}|${JSON.stringify(props.params ?? {})}|${props.label ?? ""}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h * 33) ^ raw.charCodeAt(i)) >>> 0;
  return `${op}-${h.toString(36)}`;
}

/** Catmull-Rom spline → smooth cubic-bezier SVG path through points. */
export function smoothPath(pts: Array<[number, number]>, closed: boolean): string {
  const n = pts.length;
  if (n < 3) return "";
  const at = (i: number): [number, number] =>
    closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return closed ? d + " Z" : d;
}
