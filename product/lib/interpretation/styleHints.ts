/**
 * Style hints: words written ON a shape that describe how it should look.
 *
 * A box with a `b` glyph and the word "rainbow" inside it is a rainbow
 * button, not a button labelled "rainbow". The Gemini baseline builder is
 * prompted to do this routing itself; the trained FreeSolo adapter is not
 * (its grammar was frozen before style words existed). This pass runs AFTER
 * whichever builder answered, so the behaviour is identical on both paths:
 * descriptor words become fill / gradient / outline / radius params, and
 * whatever is left over stays the label. Written words are an explicit
 * instruction, so they beat whatever paint the builder derived from the ink
 * (the default pen is a hue, so nearly every stroke "has a colour").
 *
 * Conventions (lib/packs/shapes):
 *   glyph components (button, navbar, form...)  fill: "solid"|"outline"|"gradient"|<css>, colors: [...]
 *   base shapes (rect, ellipse, smooth_path)    fill: <css>, gradient: {colors, direction}
 */

export type ParamBag = Record<string, unknown>;

/** Named colours -> a tasteful hex (Tailwind-ish mid tones). */
export const COLOR_WORDS: Readonly<Record<string, string>> = {
  red: "#ef4444",
  crimson: "#dc2626",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  navy: "#1e3a8a",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  magenta: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
  coral: "#fb7185",
  brown: "#92400e",
  tan: "#d6b48a",
  beige: "#e7d8c3",
  black: "#111111",
  white: "#ffffff",
  gray: "#6b7280",
  grey: "#6b7280",
  silver: "#c0c0c0",
};

/** Theme words -> gradient stops (left to right). */
export const THEME_WORDS: Readonly<Record<string, readonly string[]>> = {
  rainbow: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"],
  sunset: ["#f59e0b", "#f97316", "#ef4444", "#9d174d"],
  sunrise: ["#fde68a", "#fb923c", "#f472b6"],
  ocean: ["#0ea5e9", "#0369a1", "#1e3a8a"],
  sea: ["#22d3ee", "#0ea5e9", "#1d4ed8"],
  fire: ["#facc15", "#f97316", "#dc2626"],
  lava: ["#fbbf24", "#ea580c", "#7f1d1d"],
  neon: ["#22d3ee", "#a3e635", "#f472b6"],
  pastel: ["#fbcfe8", "#c7d2fe", "#bbf7d0"],
  gold: ["#fde68a", "#f59e0b", "#b45309"],
  aurora: ["#34d399", "#22d3ee", "#a78bfa"],
  dark: ["#1f2937", "#111827"],
  midnight: ["#0f172a", "#1e1b4b"],
  forest: ["#166534", "#15803d", "#4d7c0f"],
  candy: ["#f472b6", "#fb7185", "#fbbf24"],
  lavender: ["#e9d5ff", "#c4b5fd"],
  mint: ["#a7f3d0", "#5eead4"],
  peach: ["#fed7aa", "#fda4af"],
  ice: ["#e0f2fe", "#bae6fd", "#7dd3fc"],
  metal: ["#e5e7eb", "#9ca3af", "#e5e7eb"],
  chrome: ["#f3f4f6", "#9ca3af", "#f3f4f6"],
};

const OUTLINE_WORDS = new Set(["outline", "outlined", "hollow", "ghost"]);
const ROUND_WORDS = new Set(["rounded", "round", "pill"]);
const SQUARE_WORDS = new Set(["square", "sharp"]);
/** Connective noise that vanishes with the descriptors it joins ("red and blue"). */
const FILLER = new Set([
  "and", "with", "a", "an", "the", "in", "gradient", "color", "colour", "colored",
  "coloured", "style", "styled", "theme", "themed", "make", "it",
]);

export interface StyleHints {
  /** Solid colour (exactly one colour word), or null. */
  solid: string | null;
  /** Gradient stops (a theme word, or 2+ colour words), or null. */
  gradient: readonly string[] | null;
  outline: boolean;
  corners: "pill" | "rounded" | "square" | null;
  /** What is left after descriptors are removed; null when nothing is. */
  label: string | null;
  /** True when any descriptor was found. */
  any: boolean;
}

/** Read descriptor words out of free text. Case-insensitive; punctuation ignored. */
export function parseStyleHints(text: string | null | undefined): StyleHints {
  const none: StyleHints = { solid: null, gradient: null, outline: false, corners: null, label: text?.trim() || null, any: false };
  if (!text) return none;
  const words = text.split(/[^\p{L}\p{N}'#-]+/u).filter(Boolean);
  // "Ocean Tours" / "Red Lobster" are names: a Capitalised descriptor that
  // shares the text with other real words is read as a name, never a style.
  // Lower-case descriptors ("Login rainbow") and descriptor-only text
  // ("Rainbow") are styles. Mirrors the baseline builder's when-in-doubt rule.
  const isDescriptor = (w: string): boolean => {
    const k = w.toLowerCase().replace(/['-]/g, "");
    return k in THEME_WORDS || k in COLOR_WORDS || OUTLINE_WORDS.has(k) || ROUND_WORDS.has(k) || SQUARE_WORDS.has(k) || /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(w);
  };
  const meaningful = words.filter((w) => !FILLER.has(w.toLowerCase()));
  const allDescriptors = meaningful.every(isDescriptor);
  const looksLikeName = (w: string): boolean => !allDescriptors && /^\p{Lu}/u.test(w);
  const colors: string[] = [];
  let theme: readonly string[] | null = null;
  let outline = false;
  let corners: StyleHints["corners"] = null;
  const rest: string[] = [];
  let consumed = 0;
  for (const w of words) {
    const k = w.toLowerCase().replace(/['-]/g, "");
    if (looksLikeName(w)) {
      rest.push(w);
    } else if (k in THEME_WORDS) {
      theme = theme ?? THEME_WORDS[k];
      consumed++;
    } else if (k in COLOR_WORDS) {
      colors.push(COLOR_WORDS[k]);
      consumed++;
    } else if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(w)) {
      colors.push(w);
      consumed++;
    } else if (OUTLINE_WORDS.has(k)) {
      outline = true;
      consumed++;
    } else if (ROUND_WORDS.has(k)) {
      corners = k === "pill" ? "pill" : "rounded";
      consumed++;
    } else if (SQUARE_WORDS.has(k)) {
      corners = "square";
      consumed++;
    } else {
      rest.push(w);
    }
  }
  if (consumed === 0) return none;
  // Filler only drops once a descriptor was found, so "the" in a plain label survives.
  const label = rest.filter((w) => !FILLER.has(w.toLowerCase())).join(" ").trim() || null;
  return {
    solid: !theme && colors.length === 1 ? colors[0] : null,
    gradient: theme ?? (colors.length >= 2 ? colors : null),
    outline,
    corners,
    label,
    any: true,
  };
}

/** Ops drawn by the web-ui (glyph) templates: fill is a mode keyword + `colors`. */
export const GLYPH_COMPONENT_OPS: ReadonlySet<string> = new Set(["button", "navbar", "form", "image", "video"]);
/** Ops that are pure content or connectors: never restyled from their own words. */
const SKIP_OPS: ReadonlySet<string> = new Set(["text", "line", "arrow", "wait"]);

/**
 * Fold style words from `text` into a command's params. Returns the input
 * untouched when nothing applies.
 */
export function applyStyleHints(op: string, params: ParamBag | undefined, text: string | null | undefined): ParamBag | undefined {
  if (SKIP_OPS.has(op)) return params;
  const hints = parseStyleHints(text);
  if (!hints.any) return params;
  const next: ParamBag = { ...(params ?? {}) };
  const glyph = GLYPH_COMPONENT_OPS.has(op);

  // Descriptors never stay in the label. If the builder copied the raw text
  // (or something still carrying descriptors) into the label, swap in the
  // cleaned remainder; a label the builder already cleaned is left alone.
  if (glyph) {
    const current = typeof next.label === "string" ? next.label : null;
    if (current === null || parseStyleHints(current).any) {
      if (hints.label) next.label = hints.label;
      else delete next.label;
    }
  }

  if (hints.gradient) {
    if (glyph) {
      next.fill = "gradient";
      next.colors = [...hints.gradient];
    } else {
      delete next.fill;
      next.gradient = { colors: [...hints.gradient], direction: "right" };
    }
  } else if (hints.solid) {
    next.fill = hints.solid;
    delete next.colors;
    delete next.gradient;
  }
  if (hints.outline) {
    const accent = hints.solid ?? (hints.gradient ? hints.gradient[0] : null);
    if (glyph) {
      next.fill = "outline";
      delete next.colors;
      if (accent) {
        next.stroke = { color: accent, width: 1.5 };
        next.textColor = accent;
      }
    } else {
      delete next.fill;
      delete next.gradient;
      next.stroke = { color: accent ?? "#111111", width: 2 };
    }
  }
  if (hints.corners === "pill") next.radius = 999;
  else if (hints.corners === "rounded") next.radius = 12;
  else if (hints.corners === "square") next.radius = 0;
  return next;
}
