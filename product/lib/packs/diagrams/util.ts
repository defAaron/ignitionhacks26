/* Tiny shared helpers for the diagrams pack — deterministic, no deps. */

/** Linear mix of two #rrggbb colors; t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const to = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${to(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t)}${to(ch(a, 1) + (ch(b, 1) - ch(a, 1)) * t)}${to(
    ch(a, 2) + (ch(b, 2) - ch(a, 2)) * t
  )}`;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
