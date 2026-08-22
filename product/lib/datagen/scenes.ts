/**
 * Seeded procedural SCENE generator — the "answer-first" half of the synthetic
 * pipeline, reworked for WAVE 3 (containment semantics, 2026-07-19).
 *
 * A scene is a plausible 1440×900 canvas of sketched SHAPES: base shapes
 * (rects, ellipses, lines, arrows, freeform paths), glyph boxes (box + one of
 * i/f/b/n/v/?), handwriting, decorative signatures, and — new in wave 3 —
 * NESTED groups: enclosed shapes containing words, color marks, glyph letters,
 * and even inner shapes (depth 2). corrupt.ts derives noisy detections FROM
 * these shapes, `assignParents` (an exact mirror of the normalizer's §1.6
 * containment pass) mints `parent` links from the FINAL corrupted geometry,
 * and the GOLD output is a pure function of the detections + parents via
 * `goldForDetectionV3` — the policy the builder model must learn:
 *
 *   1. BASELINE  every top-level enclosed detection → its geometric op, filled
 *                with its drawn/shaded color (fill or gradient).
 *   2. DETAILS   children (parent !== null) emit NO commands: a child word →
 *                the parent command's `label`; a child color mark → the
 *                parent's `fill`/`gradient`.
 *   3. FUNCTION  a single-letter child (or a merged `glyph`) selects the glyph
 *                op for the PARENT's command, sibling details still routed in.
 *   4. DIAGRAMS  single-scribble composites unchanged (wave-1.5 mechanism).
 *
 * Keeping the policy a function of the DETECTIONS (never the hidden truth)
 * guarantees the dataset contains no label the model couldn't infer from its
 * input: if noise flips a rect's kind to smooth_path, the gold really is
 * smooth_path — "crisp what vision saw" is the product behavior.
 *
 * No-coordinates principle (vocabulary.md §0): the gold output carries no
 * geometry at all — only op + params + snap. Detections DO carry a bbox (ink
 * position context), which is exactly what the decorative priors, snap
 * decisions, and the containment pass read.
 */

import type { BBox, OpShapesV2, OpShapesV2Diagram, ShapeKind, SnapPolicy } from "../../types/schemas";
import { OPS_SHAPES_V2_DIAGRAMS } from "../../types/schemas";
import type { Rng } from "./prng";

export const ARTBOARD = { width: 1440, height: 900 } as const;

export type SceneArchetype = "landing" | "wireframe" | "diagram" | "freeform" | "decorated";
export const SCENE_ARCHETYPES: readonly SceneArchetype[] = [
  "landing",
  "wireframe",
  "diagram",
  "freeform",
  "decorated",
];

export type GradientDirection = "down" | "right" | "diagonal";

/**
 * What the vision layer reports for one stroke-set, sans the id the normalizer
 * assigns (build.ts adds `det_N`). Field-for-field the builder input contract.
 */
export interface SceneDetection {
  kind: ShapeKind;
  glyph: string | null;
  text: string | null;
  colors: string[];
  gradient_direction: GradientDirection | null;
  confidence: number;
  bbox: BBox;
  /**
   * Wave 3.1: vision's diagram-cluster hint (§1.7 — "a glyph for diagrams").
   * REQUIRED-nullable, mirroring NormalizedDetection.composite (`?? null`):
   * the serialized builder input carries the key on EVERY detection, null when
   * absent. Meaningful only on kind "scribble"; ignored on all other kinds.
   */
  composite: OpShapesV2Diagram | null;
}

/** One shape in the TRUE scene (pre-noise). */
export interface SceneShape {
  kind: ShapeKind;
  glyph: string | null;
  text: string | null;
  colors: string[];
  gradientDirection: GradientDirection | null;
  bbox: BBox;
  /**
   * Quota-steered (build.ts): corruption must not change this shape's policy
   * outcome — no kind confusion / glyph noise / demotion, jitter capped.
   */
  essential?: boolean;
  /**
   * Wave-3 nesting intent: index into the scene's shapes array of the shape
   * this one is drawn inside. NOT the source of truth for the minted `parent`
   * field — that is always `assignParents` over the final corrupted
   * detections (rule-zero parity with the normalizer) — but constructors keep
   * enough geometric margin that the intent survives jitter.
   */
  parentIndex?: number;
  /**
   * Member of a nested group (parent or child): corrupt.ts caps its bbox
   * jitter (nestedJitterCapPx) so containment relations survive corruption.
   */
  nested?: boolean;
  /**
   * Wave 3.1: vision's composite hint carried by this shape's detection (only
   * ever authored on kind "scribble" shapes; corrupt.ts may additionally mint
   * a SPURIOUS hint on a non-scribble detection — gold ignores those).
   */
  composite?: OpShapesV2Diagram;
}

export interface Scene {
  artboard: { width: number; height: number };
  archetype: SceneArchetype;
  shapes: SceneShape[];
}

// ---------------------------------------------------------------------------
// The gold policy — thresholds first, all in one place.
// ---------------------------------------------------------------------------

/**
 * Every number here is part of the LABELING FUNCTION, not a heuristic to tune
 * against the truth: gold is defined as policy(detection), so these thresholds
 * can never be "wrong", only more or less useful. Chosen with enough margin
 * that corrupt.ts's bbox jitter cannot push a steered (essential) shape across
 * a boundary.
 */
export const POLICY = {
  /** detection.confidence below this → wait("low_confidence"), always. */
  waitConfidence: 0.35,
  /** rect/ellipse: |w−h|/max(w,h) ≤ this → snap square. */
  squareTolerance: 0.15,
  /** line/arrow: minor/major bbox ratio ≤ this → straighten toward the major axis. */
  straightenRatio: 0.15,
  /** plain rect touching the top edge within this → full_width_top band. */
  topBandMaxY: 60,
  /** plain rect with y+h ≥ height−this → full_width_bottom band. */
  bottomBandSlackPx: 80,
  /** band rects must span at least this fraction of the artboard width. */
  bandMinWidthFrac: 0.76,
  /** glyph components: |bbox center x − artboard center| ≤ this → center_in_region. */
  centerTolerancePx: 48,
  /** scribble as wide as this fraction of the artboard (and short) → wave_divider. */
  waveMinWidthFrac: 0.6,
  waveMaxHeightPx: 180,
  /**
   * NEW lower bound (wave 1.5): a wave squiggle has real crest height. Keeps
   * the wave band disjoint from the timeline band below it (48 > 40).
   */
  waveMinHeightPx: 48,
  /**
   * dark wide shape hugging the top → night_sky. Wave 3: applies to BOTH the
   * legacy scribble signature AND a plain dark-FILLED rect (the fixed vision
   * layer reports a shaded sky box as one kind=rect detection with a dark
   * fill color — the 2026-07-19 color-chain gap the adapter must learn).
   */
  nightSkyMaxY: 60,
  nightSkyMinWidth: 700,
  nightSkyMinHeight: 160,
  /** multicolor large scribble in the hero region → aurora_gradient. */
  auroraMinColors: 2,
  auroraMinWidth: 400,
  auroraMinHeight: 140,
  auroraMaxY: 480,
  /** small scribble near handwriting → sparkles. */
  sparklesMaxSizePx: 200,
  sparklesTextRadiusPx: 160,
  /** relative luminance (0–255) below this counts as "dark" ink. */
  darkLuminance: 60,

  // -- Diagram composite signatures (wave 1.5 / shapes-v2) -------------------
  // Diagram composites arrive from vision as ONE kind="scribble" detection
  // (vision prompt "diagram composites" rule); these thresholds map them to
  // the six diagram ops. DESIGN RULES keeping every signature pairwise
  // disjoint from the four decorative signatures above, the stray-scribble
  // band (corrupt.ts: 260–380px square-ish, colorless or dark), and each
  // other — verified at threshold boundaries:
  //   * bar/pie/atomic require EXACTLY ONE BRIGHT color (luminance ≥
  //     darkLuminance) → disjoint from night_sky (needs dark), aurora + venn
  //     (need ≥2 colors), and strays (colorless/dark).
  //   * timeline shares the wave width band but is thin (h ≤ 40 < 48 ≤ wave).
  //   * periodic_table is the only wide-aspect ≤1-color signature; its width
  //     floor (560) clears bar's ceiling (520) and the stray band (≤380), its
  //     y floor (90) clears night_sky's ceiling (60), and its aspect ceiling
  //     (2.6) forces h ≥ 216 > waveMaxHeightPx at wave widths.
  //   * venn needs ≥2 colors AND sits below aurora's ceiling (y ≥ 520 > 480).
  //   * pie (≥330) / atomic (210–310) / sparkles (≤200) are separated by
  //     disjoint size bands; all are near-square (squareTolerance).

  /** very wide + thin scribble (w ≥ waveMinWidthFrac·width, h ≤ this) → timeline. */
  timelineMaxHeightPx: 40,
  /** timeline at least this fraction of the artboard width → snap full_width. */
  timelineFullWidthFrac: 0.8,
  /** side-by-side vertical bars: exactly 1 bright color, mid-wide aspect. */
  barMinWidth: 300,
  barMaxWidth: 520,
  barMinHeight: 160,
  barMinAspect: 1.3,
  barMaxAspect: 2.4,
  /** circle + radial slice lines: exactly 1 bright color, near-square, big. */
  pieMinSizePx: 330,
  /** 2–3 overlapping circles: ≥2 colors, wide-ish, LOW on the page. */
  vennMinWidth: 380,
  vennMaxWidth: 760,
  vennMinAspect: 1.4,
  vennMaxAspect: 2.4,
  vennMinY: 520,
  /** wide grid of many small rects: ≤1 color, wide aspect, below the top band. */
  periodicMinWidth: 560,
  periodicMinAspect: 1.5,
  periodicMaxAspect: 2.6,
  periodicMinY: 90,
  /** nucleus + concentric rings: exactly 1 bright color, near-square, small. */
  atomicMinSizePx: 210,
  atomicMaxSizePx: 310,
} as const;

/** The glyph book (vocabulary.md §2): one letter alone in a box → semantics. */
export const GLYPH_OPS: Readonly<Record<string, OpShapesV2>> = {
  i: "image",
  f: "form",
  b: "button",
  n: "navbar",
  v: "video",
  "?": "placeholder",
};

// ---------------------------------------------------------------------------
// Wave 3.1 — STYLE DESCRIPTORS (mirrors lib/models/baselineShapes.ts rule &
// README §1.7). Written words that DESCRIBE appearance are styling
// instructions, not labels. These tables are part of the LABELING FUNCTION:
// deterministic, frozen — a color word always maps to the same hex, a theme
// word always to the same palette (direction always "right", matching the
// serving baseline's convention for theme gradients).
// ---------------------------------------------------------------------------

/** Color word → tasteful hex (params.fill). Lowercased lookup. */
export const COLOR_WORDS: Readonly<Record<string, string>> = {
  purple: "#7c3aed",
  red: "#ef4444",
  teal: "#14b8a6",
  blue: "#3b82f6",
  green: "#22c55e",
  pink: "#ec4899",
  orange: "#f97316",
  yellow: "#eab308",
};

/** Theme word → 3–7 hexes evoking the theme (gradient colors). Lowercased. */
export const THEME_PALETTES: Readonly<Record<string, readonly string[]>> = {
  rainbow: ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"],
  sunset: ["#7c2d12", "#ea580c", "#f59e0b", "#fbbf24"],
  ocean: ["#0c4a6e", "#0284c7", "#38bdf8", "#a5f3fc"],
  fire: ["#7f1d1d", "#dc2626", "#f97316", "#fbbf24"],
  neon: ["#22d3ee", "#a3e635", "#f472b6"],
  pastel: ["#fbcfe8", "#bfdbfe", "#bbf7d0", "#fef3c7"],
  gold: ["#92400e", "#d97706", "#fbbf24", "#fde68a"],
  dark: ["#0f172a", "#1e293b", "#334155"],
  midnight: ["#020617", "#0f172a", "#1e1b4b", "#312e81"],
};

/** Theme gradients always flow right (the baseline prompt's convention). */
export const THEME_GRADIENT_DIRECTION = "right" as const;

export type StyleDescriptor =
  | { type: "color"; hex: string }
  | { type: "theme"; name: string };

export interface ParsedLabelText {
  /** Non-descriptor words joined (original text verbatim when no descriptor). */
  label: string | null;
  /** First descriptor word found, or null. */
  descriptor: StyleDescriptor | null;
  /** Brand guard fired: the whole text stays a label ("Ocean Tours"). */
  brandGuard: boolean;
}

const descriptorOf = (token: string): StyleDescriptor | null => {
  const t = token.toLowerCase();
  if (COLOR_WORDS[t] !== undefined) return { type: "color", hex: COLOR_WORDS[t] };
  if (THEME_PALETTES[t] !== undefined) return { type: "theme", name: t };
  return null;
};

/**
 * Deterministic descriptor split for LABEL-POSITION text (own text on a shape,
 * or a child word routed into a parent). NEVER applied to `text_writing`
 * content — the `text` op's content is verbatim, always.
 *
 * Rules (frozen; mirrors the baseline prompt + README §1.7):
 *  - tokens matching COLOR_WORDS / THEME_PALETTES (case-insensitive) are
 *    descriptors; everything else is label material.
 *  - BRAND GUARD ("when in doubt it is a label"): the whole text stays a label
 *    when it has ≥2 tokens, at least one NON-descriptor token, and either
 *    (a) the host is a navbar, or (b) every token starts uppercase (Title-Case
 *    brand-ish, e.g. "Ocean Tours"). "Login rainbow" (lowercase descriptor)
 *    is NOT brand-ish → label "Login" + rainbow gradient.
 *  - descriptor-only text → style, NO label. Mixed → label + style.
 */
export function parseLabelText(text: string | null, hostIsNavbar: boolean): ParsedLabelText {
  if (text === null || text.trim().length === 0) {
    return { label: null, descriptor: null, brandGuard: false };
  }
  const tokens = text.trim().split(/\s+/);
  const descs = tokens.map(descriptorOf);
  const hasDescriptor = descs.some((d) => d !== null);
  if (!hasDescriptor) return { label: text, descriptor: null, brandGuard: false };
  const labelTokens = tokens.filter((_, i) => descs[i] === null);
  const brandish =
    tokens.length >= 2 &&
    labelTokens.length >= 1 &&
    (hostIsNavbar || tokens.every((t) => t[0] === t[0].toUpperCase() && /[A-Za-z]/.test(t[0])));
  if (brandish) return { label: text, descriptor: null, brandGuard: true };
  const descriptor = descs.find((d) => d !== null) ?? null;
  return {
    label: labelTokens.length > 0 ? labelTokens.join(" ") : null,
    descriptor,
    brandGuard: false,
  };
}

/** Glyph-component ops use the glyph templates' gradient convention
 * (fill:"gradient" + colors); base closed shapes use params.gradient. */
const GLYPH_COMPONENT_OPS: ReadonlySet<OpShapesV2> = new Set([
  "image", "form", "button", "navbar", "video", "placeholder",
]);
/** Ops eligible for descriptor styling (closed/base + glyph components). */
const DESCRIPTOR_STYLABLE_OPS: ReadonlySet<OpShapesV2> = new Set([
  "rect", "ellipse", "smooth_path", ...GLYPH_COMPONENT_OPS,
]);

/**
 * Apply a parsed style descriptor to an emitted command. Returns true when the
 * style landed. Observed ink ALWAYS wins: if the command already carries
 * fill/gradient (from observed colors), the descriptor is suppressed (it was
 * still dropped from the label — a styling word never becomes label text).
 */
function applyDescriptor(cmd: GoldOpCommand, d: StyleDescriptor): boolean {
  if (!DESCRIPTOR_STYLABLE_OPS.has(cmd.op)) return false;
  const params = cmd.params ?? {};
  if (params.fill !== undefined || params.gradient !== undefined) return false; // ink wins
  if (d.type === "color") {
    params.fill = d.hex;
  } else if (GLYPH_COMPONENT_OPS.has(cmd.op)) {
    params.fill = "gradient";
    params.colors = [...THEME_PALETTES[d.name]];
  } else {
    params.gradient = { colors: [...THEME_PALETTES[d.name]], direction: THEME_GRADIENT_DIRECTION };
  }
  cmd.params = params;
  return true;
}

export interface GoldOpCommand {
  op: OpShapesV2;
  params?: Record<string, unknown>;
  snap?: SnapPolicy;
}
export type GoldCommand = GoldOpCommand | { op: "wait"; reason: string };

// ---------------------------------------------------------------------------
// Wave-3 containment — EXACT mirror of the normalizer's deterministic parent
// pass (shared/schemas/README.md §1.6). The generator NEVER hand-assigns
// parents: it runs this over the final corrupted detections, so minted links
// are byte-for-byte what lib/interpretation/normalize.ts would produce
// (rule-zero parity). build.ts's validator re-runs it as the geometry check.
// ---------------------------------------------------------------------------

/** §1.6: "strictly inside, with tolerance for ink that kisses the outline". */
export const CONTAINMENT_MIN_OVERLAP = 0.92;

/** Only enclosed kinds can parent (§1.6 rule (a)). */
export const ENCLOSED_KINDS: ReadonlySet<ShapeKind> = new Set(["rect", "ellipse", "smooth_path"]);

interface ContainGeom {
  kind: ShapeKind;
  bbox: BBox;
}

/** Degenerate boxes get a 1px-per-axis floor so containment stays well-defined. */
const flooredDims = (b: BBox) => ({ w: Math.max(1, b.width), h: Math.max(1, b.height) });

/**
 * A is a child of B iff B.kind ∈ {rect, ellipse, smooth_path}, ≥92% of A's
 * bbox area lies inside B's, and B's area is strictly greater than A's.
 * Deepest (smallest-area) candidate wins; exact area tie → earlier order;
 * result is each detection's immediate parent index, or null (top-level).
 * Acyclic by construction (parent area strictly greater than child area).
 */
export function assignParents(dets: readonly ContainGeom[]): (number | null)[] {
  return dets.map((a, i) => {
    const A = flooredDims(a.bbox);
    const areaA = A.w * A.h;
    let best: number | null = null;
    let bestArea = Infinity;
    for (let j = 0; j < dets.length; j++) {
      if (j === i) continue;
      const b = dets[j];
      if (!ENCLOSED_KINDS.has(b.kind)) continue;
      const B = flooredDims(b.bbox);
      const areaB = B.w * B.h;
      if (areaB <= areaA) continue; // strictly larger only; equal boxes never parent
      const overlapX = Math.max(0, Math.min(a.bbox.x + A.w, b.bbox.x + B.w) - Math.max(a.bbox.x, b.bbox.x));
      const overlapY = Math.max(0, Math.min(a.bbox.y + A.h, b.bbox.y + B.h) - Math.max(a.bbox.y, b.bbox.y));
      if ((overlapX * overlapY) / areaA < CONTAINMENT_MIN_OVERLAP) continue;
      if (areaB < bestArea) {
        // strict < keeps the EARLIER candidate on an exact area tie.
        best = j;
        bestArea = areaB;
      }
    }
    return best;
  });
}

/** Relative luminance 0–255 of a #rgb/#rrggbb color; 255 (not dark) on parse failure. */
export function luminance(color: string): number {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return 255;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const isDark = (c: string) => luminance(c) < POLICY.darkLuminance;

/**
 * Styling params from the detection's color signal:
 * 2+ colors AND a gradient_direction → params.gradient {colors, direction};
 * otherwise any color → params.fill; no colors → nothing.
 */
export function styleParams(det: SceneDetection): Record<string, unknown> {
  if (det.colors.length >= 2 && det.gradient_direction !== null) {
    return { gradient: { colors: [...det.colors], direction: det.gradient_direction } };
  }
  if (det.colors.length >= 1) return { fill: det.colors[0] };
  return {};
}

const nearSquare = (b: BBox) =>
  Math.abs(b.width - b.height) / Math.max(b.width, b.height, 1) <= POLICY.squareTolerance;

function straightenSnap(b: BBox): SnapPolicy | undefined {
  const major = Math.max(b.width, b.height, 1);
  const minor = Math.min(b.width, b.height);
  if (minor / major > POLICY.straightenRatio) return undefined;
  return b.width >= b.height ? "straighten_h" : "straighten_v";
}

const isCentered = (b: BBox, artboard: { width: number }) =>
  Math.abs(b.x + b.width / 2 - artboard.width / 2) <= POLICY.centerTolerancePx;

/** Single trimmed lowercase character, or null (a word is never a glyph). */
function normGlyph(glyph: string | null): string | null {
  if (glyph === null) return null;
  const g = glyph.trim().toLowerCase();
  return g.length === 1 ? g : null;
}

function withStyle(op: OpShapesV2, det: SceneDetection, extra?: Record<string, unknown>): GoldOpCommand {
  const params = { ...styleParams(det), ...(extra ?? {}) };
  const cmd: GoldOpCommand = { op };
  if (Object.keys(params).length > 0) cmd.params = params;
  return cmd;
}

/**
 * Rect policy, wave 3. `det` carries the EFFECTIVE glyph/colors (own values,
 * or routed from children by goldForDetectionV3); `label` is the effective
 * label (own text, or a routed child word).
 */
function rectGold(
  det: SceneDetection,
  label: string | null,
  artboard: { width: number; height: number },
  rng: Rng,
): GoldCommand {
  const g = normGlyph(det.glyph);
  if (g !== null) {
    // FUNCTION: a single letter opts into semantics; letters outside the
    // book fall back to `placeholder` ("something goes here" was clearly meant).
    const op = GLYPH_OPS[g] ?? "placeholder";
    const cmd = withStyle(op, det, label !== null ? { label } : undefined);
    if (op === "navbar") cmd.snap = "full_width_top";
    else if (isCentered(det.bbox, artboard)) cmd.snap = "center_in_region";
    return cmd;
  }
  // Wave-3 known gap: a dark-FILLED rect hugging the top region is a night
  // sky (the fixed vision layer reports the shaded sky box + claimed star
  // dots as ONE rect detection with a dark fill color). Same thresholds as
  // the legacy scribble signature; decorative knobs are free values.
  if (
    det.bbox.y <= POLICY.nightSkyMaxY &&
    det.bbox.width >= POLICY.nightSkyMinWidth &&
    det.bbox.height >= POLICY.nightSkyMinHeight &&
    det.colors.some(isDark)
  ) {
    return {
      op: "night_sky",
      params: {
        density: Math.round(rng.float(0.3, 0.9) * 100) / 100,
        size_range: [1, rng.int(3, 5)],
        cluster_bias: Math.round(rng.float(0.2, 0.8) * 100) / 100,
        seed: rng.seed(),
      },
    };
  }
  // No glyph, no semantics: a plain box stays a crisp rect (word inside → label).
  const cmd = withStyle("rect", det, label !== null ? { label } : undefined);
  const { bbox } = det;
  const wideEnough = bbox.width >= POLICY.bandMinWidthFrac * artboard.width;
  if (wideEnough && bbox.y + bbox.height >= artboard.height - POLICY.bottomBandSlackPx) {
    cmd.snap = "full_width_bottom";
  } else if (wideEnough && bbox.y <= POLICY.topBandMaxY) {
    cmd.snap = "full_width_top";
  } else if (nearSquare(bbox)) {
    cmd.snap = "square";
  }
  return cmd;
}

/** Is there handwriting near this bbox? (sparkles prior) */
function nearText(det: SceneDetection, all: readonly SceneDetection[]): boolean {
  const r = POLICY.sparklesTextRadiusPx;
  const a = det.bbox;
  return all.some((other) => {
    if (other === det || other.kind !== "text_writing") return false;
    const b = other.bbox;
    return (
      a.x < b.x + b.width + r &&
      b.x < a.x + a.width + r &&
      a.y < b.y + b.height + r &&
      b.y < a.y + a.height + r
    );
  });
}

/**
 * Decorative + diagram signature classification for scribbles (vocabulary.md
 * §4 position priors; §1.5 diagram composites). The renderer owns the beauty;
 * params knobs + seed are free values the model may emit — only
 * fill/gradient/text/label are score-checked. The four decorative signatures
 * are checked first (unchanged behavior), then the six diagram signatures —
 * all ten are pairwise disjoint (see the POLICY diagram-signature comment), so
 * the order between the two blocks never decides an outcome.
 */
/** Seeded free-value params for a composite-hint diagram command (§1.7:
 * "params optional/seeded" — the grader never value-checks them). Wave-3.1
 * variation: wider count ranges than the signature gold (bars 2–8, wedges 2–7,
 * ticks 3–9). */
function compositeHintParams(op: OpShapesV2Diagram, rng: Rng): Record<string, unknown> | undefined {
  if (rng.chance(0.3)) return undefined; // params are optional on the hint path
  switch (op) {
    case "bar_chart":
      return { values: Array.from({ length: rng.int(2, 8) }, () => rng.int(10, 100)), seed: rng.seed() };
    case "pie_chart":
      return { values: Array.from({ length: rng.int(2, 7) }, () => rng.int(5, 50)), seed: rng.seed() };
    case "venn_diagram":
      return { sets: rng.int(2, 3), seed: rng.seed() };
    case "timeline":
      return { events: rng.int(3, 9), seed: rng.seed() };
    case "periodic_table":
      return undefined; // none by default (§1.5)
    case "atomic_structure":
      return rng.chance(0.3) ? { shells: rng.int(2, 4) } : undefined;
  }
}

function scribbleGold(
  det: SceneDetection,
  all: readonly SceneDetection[],
  artboard: { width: number; height: number },
  rng: Rng,
): GoldCommand {
  const { bbox } = det;

  // -- Wave 3.1: the composite hint (§1.7) — HIGHEST scribble precedence,
  // mirroring FUNCTION (a glyph selects the op; the hint selects the diagram).
  // Only meaningful here, on kind "scribble" — every other kind ignores it.
  // The low-confidence wait rule still outranks it (goldForDetectionV3 returns
  // wait before this ever runs). Composite-less ambiguous scribbles fall
  // through to the signatures and, failing those, wait — never a guessed
  // diagram.
  if (det.composite !== null && (OPS_SHAPES_V2_DIAGRAMS as readonly string[]).includes(det.composite)) {
    const cmd: GoldOpCommand = { op: det.composite };
    const params = compositeHintParams(det.composite, rng);
    if (params !== undefined) cmd.params = params;
    if (
      det.composite === "timeline" &&
      bbox.width >= POLICY.timelineFullWidthFrac * artboard.width
    ) {
      cmd.snap = "full_width";
    }
    return cmd;
  }
  if (
    bbox.width >= POLICY.waveMinWidthFrac * artboard.width &&
    bbox.height >= POLICY.waveMinHeightPx &&
    bbox.height <= POLICY.waveMaxHeightPx
  ) {
    return {
      op: "wave_divider",
      params: { amplitude: rng.int(12, 48), layers: rng.int(1, 3), flip: rng.chance(0.5), seed: rng.seed() },
      snap: "full_width",
    };
  }
  if (
    bbox.y <= POLICY.nightSkyMaxY &&
    bbox.width >= POLICY.nightSkyMinWidth &&
    bbox.height >= POLICY.nightSkyMinHeight &&
    det.colors.some(isDark)
  ) {
    return {
      op: "night_sky",
      params: {
        density: Math.round(rng.float(0.3, 0.9) * 100) / 100,
        size_range: [1, rng.int(3, 5)],
        cluster_bias: Math.round(rng.float(0.2, 0.8) * 100) / 100,
        seed: rng.seed(),
      },
    };
  }
  if (
    det.colors.length >= POLICY.auroraMinColors &&
    bbox.width >= POLICY.auroraMinWidth &&
    bbox.height >= POLICY.auroraMinHeight &&
    bbox.y <= POLICY.auroraMaxY
  ) {
    return {
      op: "aurora_gradient",
      params: {
        palette: [...det.colors],
        blob_count: rng.int(3, 6),
        blur_radius: rng.int(40, 120),
        seed: rng.seed(),
      },
    };
  }
  if (
    bbox.width <= POLICY.sparklesMaxSizePx &&
    bbox.height <= POLICY.sparklesMaxSizePx &&
    nearText(det, all)
  ) {
    return {
      op: "sparkles",
      params: { count: rng.int(5, 14), size_range: [4, rng.int(8, 16)], seed: rng.seed() },
    };
  }

  // -- Diagram composite signatures (wave 1.5) -------------------------------
  const aspect = bbox.width / Math.max(bbox.height, 1);
  const oneBright = det.colors.length === 1 && !isDark(det.colors[0]);

  // timeline: very wide + thin (shares the wave width band; thinner than any
  // wave crest). Snap full_width only when VERY wide — same band-rule style.
  if (bbox.width >= POLICY.waveMinWidthFrac * artboard.width && bbox.height <= POLICY.timelineMaxHeightPx) {
    const cmd: GoldOpCommand = {
      op: "timeline",
      params: { events: rng.int(3, 9), seed: rng.seed() }, // 3-9 ticks (was 3-6)
    };
    if (bbox.width >= POLICY.timelineFullWidthFrac * artboard.width) cmd.snap = "full_width";
    return cmd;
  }
  // bar_chart: mid-wide single-bright-color cluster (bars share a baseline).
  if (
    oneBright &&
    bbox.width >= POLICY.barMinWidth &&
    bbox.width <= POLICY.barMaxWidth &&
    bbox.height >= POLICY.barMinHeight &&
    aspect >= POLICY.barMinAspect &&
    aspect <= POLICY.barMaxAspect
  ) {
    return {
      op: "bar_chart",
      params: {
        // Wave 3.1 variation: 2-8 bars (was 3-6).
        values: Array.from({ length: rng.int(2, 8) }, () => rng.int(10, 100)),
        seed: rng.seed(),
      },
    };
  }
  // pie_chart: big near-square single-bright-color cluster (circle + slices).
  if (
    oneBright &&
    bbox.width >= POLICY.pieMinSizePx &&
    bbox.height >= POLICY.pieMinSizePx &&
    nearSquare(bbox)
  ) {
    const n = rng.int(2, 7); // wave 3.1 variation: 2-7 wedges (was 2-5)
    return {
      op: "pie_chart",
      params: { values: Array.from({ length: n }, () => rng.int(5, 50)), seed: rng.seed() },
    };
  }
  // atomic_structure: small near-square single-bright-color cluster (nucleus +
  // rings). No params by default — the renderer's defaults own the look.
  if (
    oneBright &&
    bbox.width >= POLICY.atomicMinSizePx &&
    bbox.width <= POLICY.atomicMaxSizePx &&
    bbox.height >= POLICY.atomicMinSizePx &&
    bbox.height <= POLICY.atomicMaxSizePx &&
    nearSquare(bbox)
  ) {
    return { op: "atomic_structure" };
  }
  // venn_diagram: multicolor overlapping circles, LOW on the page (below the
  // aurora ceiling — that is what keeps the two multicolor signatures apart).
  if (
    det.colors.length >= 2 &&
    bbox.y >= POLICY.vennMinY &&
    bbox.width >= POLICY.vennMinWidth &&
    bbox.width <= POLICY.vennMaxWidth &&
    aspect >= POLICY.vennMinAspect &&
    aspect <= POLICY.vennMaxAspect
  ) {
    return {
      op: "venn_diagram",
      params: { sets: Math.min(det.colors.length, 3), seed: rng.seed() },
    };
  }
  // periodic_table: wide grid-ish cluster of many small rects, ≤1 color, below
  // the top band. No params by default.
  if (
    det.colors.length <= 1 &&
    bbox.y >= POLICY.periodicMinY &&
    bbox.width >= POLICY.periodicMinWidth &&
    aspect >= POLICY.periodicMinAspect &&
    aspect <= POLICY.periodicMaxAspect
  ) {
    return { op: "periodic_table" };
  }

  return { op: "wait", reason: "ambiguous" };
}

/** Which effective details were sourced from CHILD detections (for reporting). */
export interface RoutedDetails {
  glyph: boolean;
  label: boolean;
  fill: boolean;
  gradient: boolean;
}

/** Wave 3.1: how a style-descriptor word resolved on this command. */
export interface StyleDescriptorInfo {
  type: "color" | "theme";
  /** Where the descriptor word came from: the shape's own text or a child word. */
  source: "own" | "child";
  /** A non-descriptor label also landed on the command ("Login rainbow"). */
  mixed: boolean;
  /** The style params were written (false when suppressed). */
  applied: boolean;
  /** Suppressed because observed ink colors already styled the command. */
  inkOverride: boolean;
}

export interface GoldV3 {
  command: GoldCommand;
  routed: RoutedDetails;
  /** Wave 3.1: descriptor word present in this detection's label-position text. */
  styleDescriptor: StyleDescriptorInfo | null;
  /** Wave 3.1: brand guard fired — descriptor-looking text kept as a label. */
  brandGuard: boolean;
  /** Wave 3.1: outcome of a non-null composite hint on this detection. */
  compositeOutcome: "command" | "wait" | "ignored" | null;
}

/** Kind dispatch over the EFFECTIVE detection (details already routed in). */
function commandForKind(
  det: SceneDetection,
  label: string | null,
  all: readonly SceneDetection[],
  artboard: { width: number; height: number },
  rng: Rng,
): GoldCommand {
  switch (det.kind) {
    case "rect":
      return rectGold(det, label, artboard, rng);
    case "ellipse": {
      const cmd = withStyle("ellipse", det, label !== null ? { label } : undefined);
      if (nearSquare(det.bbox)) cmd.snap = "square"; // roundish → circle
      return cmd;
    }
    case "line":
    case "arrow": {
      const cmd = withStyle(det.kind, det);
      const snap = straightenSnap(det.bbox);
      if (snap) cmd.snap = snap;
      return cmd;
    }
    case "text_writing": {
      if (det.text === null || det.text.trim().length === 0) {
        return { op: "wait", reason: "unreadable_text" };
      }
      return withStyle("text", det, { text: det.text });
    }
    case "smooth_path":
      // The user's own shape, smoothed — NEVER snapped, geometry always kept.
      // With a gradient fill this covers the removed `blob` op.
      return withStyle("smooth_path", det, label !== null ? { label } : undefined);
    case "scribble":
      return scribbleGold(det, all, artboard, rng);
  }
}

/**
 * THE wave-3 gold policy: (all detections in input order, their §1.6 parent
 * assignment, one index) → exactly one command for a TOP-LEVEL detection, or
 * null for a child (children emit NOTHING — the containment rule this wave
 * exists to teach). Details route from DIRECT children into the parent's
 * command:
 *
 *  - glyph: the detection's own merged `glyph` wins; else the first child
 *    text_writing whose text is a single character selects the glyph op.
 *  - label: the detection's own `text` wins; else the first child word
 *    (text_writing, ≥2 chars) becomes params.label.
 *  - colors: the detection's own drawn colors win; else the first child color
 *    mark (scribble/smooth_path with colors) supplies fill — or gradient when
 *    the mark carries ≥2 colors and a gradient_direction.
 *
 * Grandchildren (details of a non-commanding child) route nowhere. Children
 * route regardless of their own confidence; a LOW-confidence top-level still
 * golds wait (details lost). `rng` only mints free-valued decorative knobs.
 */
export function goldForDetectionV3(
  all: readonly SceneDetection[],
  parents: readonly (number | null)[],
  index: number,
  artboard: { width: number; height: number },
  rng: Rng,
): GoldV3 | null {
  if (parents[index] !== null) return null; // children emit no commands, ever
  const det = all[index];
  const routed: RoutedDetails = { glyph: false, label: false, fill: false, gradient: false };
  const compositeOutcomeFor = (op: string): GoldV3["compositeOutcome"] =>
    det.composite === null ? null : det.kind !== "scribble" ? "ignored" : op === "wait" ? "wait" : "command";
  if (det.confidence < POLICY.waitConfidence) {
    return {
      command: { op: "wait", reason: "low_confidence" },
      routed,
      styleDescriptor: null,
      brandGuard: false,
      compositeOutcome: compositeOutcomeFor("wait"),
    };
  }

  // Direct children in input order (only enclosed kinds can have any).
  const children = ENCLOSED_KINDS.has(det.kind) ? all.filter((_, i) => parents[i] === index) : [];

  let glyph = normGlyph(det.glyph);
  if (glyph === null) {
    const glyphChild = children.find((c) => c.kind === "text_writing" && normGlyph(c.text) !== null);
    if (glyphChild) {
      glyph = normGlyph(glyphChild.text);
      routed.glyph = true;
    }
  }

  let label = det.text !== null && det.text.trim().length > 0 ? det.text : null;
  let labelSource: "own" | "child" = "own";
  if (label === null) {
    const wordChild = children.find(
      (c) => c.kind === "text_writing" && c.text !== null && c.text.trim().length >= 2,
    );
    if (wordChild) {
      label = wordChild.text;
      labelSource = "child";
      routed.label = true;
    }
  }

  // Wave 3.1 STYLE DESCRIPTORS (§1.7): label-position text is split into
  // label material vs styling words. Never for text_writing — content verbatim.
  let descriptor: StyleDescriptor | null = null;
  let brandGuard = false;
  if (det.kind !== "text_writing" && label !== null) {
    const parsed = parseLabelText(label, glyph === "n");
    descriptor = parsed.descriptor;
    brandGuard = parsed.brandGuard;
    label = parsed.label;
  }

  let colors = det.colors;
  let gradientDirection = det.gradient_direction;
  if (colors.length === 0) {
    const mark = children.find(
      (c) => (c.kind === "scribble" || c.kind === "smooth_path") && c.colors.length >= 1,
    );
    if (mark) {
      colors = mark.colors;
      gradientDirection = mark.gradient_direction;
      if (colors.length >= 2 && gradientDirection !== null) routed.gradient = true;
      else routed.fill = true;
    }
  }

  const eff: SceneDetection = { ...det, glyph, colors, gradient_direction: gradientDirection };
  const command = commandForKind(eff, label, all, artboard, rng);

  // Descriptor styling lands AFTER the op is chosen: observed ink (own or
  // child-routed) always wins; ineligible ops (decoratives, diagrams, text,
  // open strokes) never take descriptor style.
  let styleDescriptor: StyleDescriptorInfo | null = null;
  if (descriptor !== null && command.op !== "wait") {
    const hadInk = (command.params?.fill !== undefined || command.params?.gradient !== undefined);
    const applied = applyDescriptor(command, descriptor);
    styleDescriptor = {
      type: descriptor.type,
      source: labelSource,
      mixed: label !== null && command.params !== undefined && "label" in command.params,
      applied,
      inkOverride: !applied && hadInk && DESCRIPTOR_STYLABLE_OPS.has(command.op as OpShapesV2),
    };
  }

  // A routed detail only counts when it landed on the emitted command (e.g. a
  // night_sky rect takes no label/fill params even if a child offered them).
  if (command.op === "wait") {
    routed.glyph = routed.label = routed.fill = routed.gradient = false;
  } else {
    const params = command.params ?? {};
    routed.label = routed.label && "label" in params;
    routed.fill = routed.fill && "fill" in params;
    routed.gradient = routed.gradient && "gradient" in params;
  }
  return {
    command,
    routed,
    styleDescriptor,
    brandGuard,
    compositeOutcome: compositeOutcomeFor(command.op),
  };
}

// ---------------------------------------------------------------------------
// Text / color pools — small and realistic; the routing behavior is what
// matters, not text variety.
// ---------------------------------------------------------------------------

const HEADINGS = [
  "I love baio",
  "Welcome",
  "Our features",
  "Draw it, get it",
  "Ship faster",
  "Why baio",
  "Pricing",
  "How it works",
  "Hello world",
  "About us",
];
/**
 * Wave 3.1: the 16 high-frequency UI words users actually write (handoff §3)
 * — densified across confidence tiers as button/child labels.
 */
export const COMMON_LABELS = [
  "Login",
  "Sign up",
  "Submit",
  "Search",
  "Home",
  "About",
  "Contact",
  "Buy",
  "Menu",
  "Send",
  "Next",
  "Learn more",
  "Get started",
  "Subscribe",
  "Play",
  "Download",
] as const;
const BUTTON_LABELS = COMMON_LABELS;
const BRAND_NAMES = ["baio", "Acme", "Nimbus", "Studio"];
/** Brand-ish names containing descriptor words — the BRAND GUARD material
 * ("Ocean Tours" is a label, never an ocean gradient). */
const BRANDISH_NAMES = [
  "Ocean Tours",
  "Fire Media",
  "Midnight Labs",
  "Gold Coast",
  "Neon Nights",
  "Sunset Grill",
] as const;
const FORM_TITLES = ["Contact", "Sign up", "Feedback"];
const DESCRIPTOR_COLOR_POOL = Object.keys(COLOR_WORDS);
const DESCRIPTOR_THEME_POOL = Object.keys(THEME_PALETTES);

/** A descriptor-laced label text: mixed ("Login rainbow") or descriptor-only. */
function descriptorText(rng: Rng, type: "color" | "theme", mixed: boolean): string {
  const word = type === "color" ? rng.pick(DESCRIPTOR_COLOR_POOL) : rng.pick(DESCRIPTOR_THEME_POOL);
  return mixed ? `${rng.pick(COMMON_LABELS)} ${word}` : word;
}

/** Bright ink palette — all above the dark-luminance threshold. */
const BRIGHT_INK = [
  "#2563eb",
  "#e63946",
  "#2a9d8f",
  "#f59e0b",
  "#7c3aed",
  "#10b981",
  "#ec4899",
] as const;
/** Dark ink — night-sky material (below the dark-luminance threshold). */
const DARK_INK = ["#0b1026", "#111827", "#1a1a2e", "#0f172a"] as const;

export const TEXT_POOL = HEADINGS;

// ---------------------------------------------------------------------------
// Shape constructors — sizes chosen so noise-model jitter cannot move a shape
// across the policy thresholds that define it (see POLICY margins).
// ---------------------------------------------------------------------------

interface StyleOpts {
  allowGradient?: boolean;
  gradientChance?: number;
  colorChance?: number;
}

function sampleStyle(rng: Rng, opts: StyleOpts = {}): Pick<SceneShape, "colors" | "gradientDirection"> {
  const gradientChance = opts.allowGradient === false ? 0 : opts.gradientChance ?? 0.14;
  // Wave 3: the fixed vision layer reports FILLS on closed shapes (hatch
  // inside an outline = fill, not a scribble), so closed shapes carry colors
  // more often than the wave-2 distribution did (0.38 → 0.52).
  const colorChance = opts.colorChance ?? 0.52;
  const r = rng.next();
  if (r < gradientChance) {
    const n = rng.chance(0.3) ? 3 : 2;
    const colors = rng.shuffle(BRIGHT_INK).slice(0, n);
    return { colors, gradientDirection: rng.pick(["down", "right", "diagonal"] as const) };
  }
  if (r < gradientChance + colorChance) {
    return { colors: [rng.pick(BRIGHT_INK)], gradientDirection: null };
  }
  return { colors: [], gradientDirection: null };
}

function base(kind: ShapeKind, bbox: BBox, style: Pick<SceneShape, "colors" | "gradientDirection">): SceneShape {
  return { kind, glyph: null, text: null, colors: style.colors, gradientDirection: style.gradientDirection, bbox };
}

/** cx well clear of the centered-band (|cx−720| ≥ 110) unless `centered`. */
function boxX(rng: Rng, w: number, centered: boolean): number {
  if (centered) return Math.round(ARTBOARD.width / 2 - w / 2) + rng.int(-6, 6);
  const cx = rng.chance(0.5) ? rng.int(180, 560) : rng.int(880, 1260);
  return Math.max(10, Math.min(ARTBOARD.width - w - 10, Math.round(cx - w / 2)));
}

function plainRect(rng: Rng, opts: { nearSquare?: boolean; y?: number } = {}): SceneShape {
  if (opts.nearSquare) {
    const s = rng.int(340, 440);
    return base(
      "rect",
      { x: rng.int(80, 950), y: opts.y ?? rng.int(140, 620), width: s, height: s },
      sampleStyle(rng),
    );
  }
  const w = rng.int(240, 460);
  const h = Math.round(w * rng.float(0.35, 0.6));
  return base(
    "rect",
    { x: rng.int(80, 950), y: opts.y ?? rng.int(120, 680), width: w, height: h },
    sampleStyle(rng),
  );
}

/** Full-width band rect: top (navbar-less header strip) or bottom (footer band). */
function bandRect(rng: Rng, edge: "top" | "bottom"): SceneShape {
  const w = rng.int(1200, 1400);
  const h = rng.int(58, 80);
  const x = rng.int(0, ARTBOARD.width - w);
  const y = edge === "top" ? rng.int(0, 20) : rng.int(ARTBOARD.height - h - 8, ARTBOARD.height - h - 2);
  return base("rect", { x, y, width: w, height: h }, sampleStyle(rng));
}

function ellipseShape(rng: Rng, opts: { circle?: boolean } = {}): SceneShape {
  if (opts.circle) {
    const s = rng.int(340, 420);
    return base("ellipse", { x: rng.int(100, 950), y: rng.int(140, 480), width: s, height: s }, sampleStyle(rng));
  }
  const w = rng.int(220, 400);
  const h = Math.round(w * rng.float(0.4, 0.62));
  return base("ellipse", { x: rng.int(90, 980), y: rng.int(120, 640), width: w, height: h }, sampleStyle(rng));
}

function lineShape(rng: Rng, kind: "line" | "arrow", orient: "h" | "v" | "diag"): SceneShape {
  let bbox: BBox;
  if (orient === "h") {
    const w = rng.int(300, 700);
    bbox = { x: rng.int(80, ARTBOARD.width - w - 60), y: rng.int(120, 780), width: w, height: rng.int(8, 24) };
  } else if (orient === "v") {
    const h = rng.int(280, 560);
    bbox = { x: rng.int(100, 1300), y: rng.int(100, ARTBOARD.height - h - 60), width: rng.int(8, 24), height: h };
  } else {
    const w = rng.int(220, 480);
    const h = Math.round(w * rng.float(0.5, 0.9));
    bbox = { x: rng.int(100, 900), y: rng.int(120, Math.max(130, 800 - h)), width: w, height: h };
  }
  return base(kind, bbox, sampleStyle(rng, { allowGradient: false, colorChance: 0.35 }));
}

const GLYPH_BOX_SIZES: Record<string, (rng: Rng) => { w: number; h: number }> = {
  n: (rng) => ({ w: rng.int(1200, 1400), h: rng.int(56, 90) }),
  b: (rng) => ({ w: rng.int(170, 260), h: rng.int(48, 80) }),
  i: (rng) => {
    const w = rng.int(260, 430);
    return { w, h: Math.round(w * rng.float(0.55, 0.72)) };
  },
  v: (rng) => {
    const w = rng.int(320, 480);
    return { w, h: Math.round(w * rng.float(0.5, 0.62)) };
  },
  f: (rng) => ({ w: rng.int(320, 460), h: rng.int(280, 420) }),
  "?": (rng) => ({ w: rng.int(200, 380), h: rng.int(140, 260) }),
};

function glyphBox(
  rng: Rng,
  glyph: keyof typeof GLYPH_OPS & string,
  opts: { centered?: boolean; text?: string; y?: number } = {},
): SceneShape {
  const { w, h } = GLYPH_BOX_SIZES[glyph](rng);
  const bbox: BBox =
    glyph === "n"
      ? { x: rng.int(0, ARTBOARD.width - w), y: rng.int(0, 14), width: w, height: h }
      : {
          x: boxX(rng, w, opts.centered ?? false),
          y: opts.y ?? rng.int(110, Math.max(120, 780 - h)),
          width: w,
          height: h,
        };
  return {
    kind: "rect",
    glyph,
    text: opts.text ?? null,
    bbox,
    ...sampleStyle(rng, { gradientChance: 0.1, colorChance: 0.4 }),
  };
}

function textShape(rng: Rng, text: string, at?: { x: number; y: number }): SceneShape {
  const w = Math.max(90, Math.min(620, text.length * rng.int(13, 20)));
  const h = rng.int(28, 54);
  const bbox: BBox = at
    ? { x: at.x, y: at.y, width: w, height: h }
    : { x: rng.int(100, Math.max(110, 1300 - w)), y: rng.int(110, 760), width: w, height: h };
  return {
    kind: "text_writing",
    glyph: null,
    text,
    bbox,
    ...sampleStyle(rng, { allowGradient: false, colorChance: 0.45 }),
  };
}

function freeformShape(rng: Rng): SceneShape {
  const w = rng.int(170, 420);
  const h = rng.int(150, 380);
  return base(
    "smooth_path",
    { x: rng.int(60, 1000), y: rng.int(120, Math.max(130, 740 - h)), width: w, height: h },
    sampleStyle(rng, { gradientChance: 0.3, colorChance: 0.4 }),
  );
}

function waveShape(rng: Rng, y?: number): SceneShape {
  const w = rng.int(1000, 1380);
  // h floor 80: even max non-essential jitter (−25) keeps h ≥ 55 > the
  // waveMinHeightPx=48 floor, so a wave never slides into the timeline band.
  const h = rng.int(80, 150);
  return base(
    "scribble",
    { x: rng.int(0, ARTBOARD.width - w), y: y ?? rng.int(300, 700), width: w, height: h },
    { colors: rng.chance(0.5) ? [rng.pick(BRIGHT_INK)] : [], gradientDirection: null },
  );
}

function nightSkyShape(rng: Rng): SceneShape {
  const colors: string[] = [rng.pick(DARK_INK)];
  if (rng.chance(0.4)) colors.push(rng.pick(BRIGHT_INK)); // star ink
  const w = rng.int(900, 1380);
  return base(
    "scribble",
    { x: rng.int(0, ARTBOARD.width - w), y: rng.int(0, 25), width: w, height: rng.int(220, 380) },
    { colors, gradientDirection: null },
  );
}

/**
 * Wave-3 night sky: ONE kind=rect detection with a dark fill (the fixed
 * vision behavior), sometimes with claimed star-dot ink merged into `colors`.
 * Margins vs jitter (±25 non-essential): y ≤ 22+25=47 ≤ 60; w ≥ 950−25 > 700;
 * h ≥ 220−25 > 160 — the signature always survives corruption.
 */
export function nightSkyRectShape(rng: Rng): SceneShape {
  const colors: string[] = [rng.pick(DARK_INK)];
  if (rng.chance(0.35)) colors.push(rng.pick(BRIGHT_INK)); // merged star-dot ink
  const w = rng.int(950, 1380);
  return base(
    "rect",
    { x: rng.int(0, ARTBOARD.width - w), y: rng.int(0, 22), width: w, height: rng.int(220, 360) },
    { colors, gradientDirection: null },
  );
}

function auroraShape(rng: Rng): SceneShape {
  const colors = rng.shuffle(BRIGHT_INK).slice(0, 3);
  const w = rng.int(520, 880);
  return base(
    "scribble",
    { x: rng.int(120, ARTBOARD.width - w - 100), y: rng.int(90, 360), width: w, height: rng.int(190, 320) },
    { colors, gradientDirection: null },
  );
}

// -- Diagram composite constructors (wave 1.5) --------------------------------
// Each emits ONE kind="scribble" shape whose bbox/colors sit safely inside its
// POLICY signature band — margins chosen so even non-essential jitter (±25px
// per edge) rarely leaves the band, and essential jitter (±10px) never does.

/** Long thin tick-marked line. `full` steers the full_width snap band. */
function timelineShape(rng: Rng, opts: { full?: boolean } = {}): SceneShape {
  const full = opts.full ?? rng.chance(0.5);
  // full: ≥1200 (jitter −25 → 1175 > 1152 = 0.8·1440); not-full: ≤1100
  // (jitter +25 → 1125 < 1152). Both stay ≥ 864 (0.6·1440) after jitter.
  const w = full ? rng.int(1200, 1380) : rng.int(980, 1100);
  const h = rng.int(12, 22); // jitter +25 → ≤47 < waveMinHeightPx=48
  return base(
    "scribble",
    { x: rng.int(20, ARTBOARD.width - w - 20), y: rng.int(140, 800), width: w, height: h },
    { colors: rng.chance(0.5) ? [rng.pick(BRIGHT_INK)] : [], gradientDirection: null },
  );
}

/** 3–6 side-by-side vertical bars on a baseline, one bright ink. */
function barChartShape(rng: Rng): SceneShape {
  const w = rng.int(360, 480); // band [300, 520]
  const h = Math.round(w / rng.float(1.6, 1.8)); // aspect ~1.6–1.8 ∈ [1.3, 2.4]
  return base(
    "scribble",
    { x: rng.int(80, ARTBOARD.width - w - 80), y: rng.int(160, ARTBOARD.height - h - 60), width: w, height: h },
    { colors: [rng.pick(BRIGHT_INK)], gradientDirection: null },
  );
}

/** Circle with radial slice lines, one bright ink. */
function pieChartShape(rng: Rng): SceneShape {
  const s = rng.int(360, 430); // jitter −25 → ≥335 > pieMinSizePx=330
  return base(
    "scribble",
    { x: rng.int(90, ARTBOARD.width - s - 90), y: rng.int(140, ARTBOARD.height - s - 60), width: s, height: s },
    { colors: [rng.pick(BRIGHT_INK)], gradientDirection: null },
  );
}

/** 2–3 overlapping circles low on the page, one bright ink per set. */
function vennShape(rng: Rng): SceneShape {
  const sets = rng.chance(0.35) ? 3 : 2;
  const w = rng.int(440, 560); // band [380, 760]
  const h = Math.round(w / rng.float(1.8, 2.0)); // aspect ∈ [1.4, 2.4] with margin
  const y = rng.int(550, Math.max(551, ARTBOARD.height - h - 20)); // ≥ vennMinY=520 + jitter margin
  return base(
    "scribble",
    { x: rng.int(100, ARTBOARD.width - w - 100), y, width: w, height: h },
    { colors: rng.shuffle(BRIGHT_INK).slice(0, sets), gradientDirection: null },
  );
}

/** Wide grid of many small rects (the periodic-table silhouette), ≤1 color. */
function periodicTableShape(rng: Rng): SceneShape {
  const w = rng.int(640, 900); // ≥ periodicMinWidth=560 with margin
  const h = Math.round(w / rng.float(1.9, 2.2)); // aspect ∈ [1.5, 2.6] with margin
  return base(
    "scribble",
    { x: rng.int(60, ARTBOARD.width - w - 60), y: rng.int(130, Math.max(131, ARTBOARD.height - h - 40)), width: w, height: h },
    { colors: rng.chance(0.5) ? [rng.pick(BRIGHT_INK)] : [], gradientDirection: null },
  );
}

/** Filled nucleus + concentric rings with dots, one bright ink. */
function atomicShape(rng: Rng): SceneShape {
  const s = rng.int(240, 280); // jitter ±25 → [215, 305] ⊂ [210, 310]
  return base(
    "scribble",
    { x: rng.int(90, ARTBOARD.width - s - 90), y: rng.int(130, ARTBOARD.height - s - 60), width: s, height: s },
    { colors: [rng.pick(BRIGHT_INK)], gradientDirection: null },
  );
}

/** Small 4-point-asterisk scribbles next to a piece of handwriting. */
function sparklesShape(rng: Rng, near: BBox): SceneShape {
  const w = rng.int(60, 150);
  const h = rng.int(50, 140);
  const right = near.x + near.width + rng.int(10, 90);
  const x = right + w <= ARTBOARD.width - 10 ? right : Math.max(10, near.x - w - rng.int(10, 90));
  const y = Math.max(8, near.y - rng.int(0, 60));
  return base("scribble", { x, y, width: w, height: h }, {
    colors: rng.chance(0.5) ? [rng.pick(BRIGHT_INK)] : [],
    gradientDirection: null,
  });
}

// ---------------------------------------------------------------------------
// Wave-3 nested groups — enclosed shapes with child detections drawn inside.
// Children are laid out side by side with gaps (so siblings never contain
// each other) and inset CHILD_INSET from the parent's edges: worst-case
// combined drift under the nested jitter cap (8px on 2 edges of child AND
// parent = 32px) never breaks the ≥92% containment — in fact keeps children
// 100% inside.
// ---------------------------------------------------------------------------

const SHORT_WORDS = ["New", "Pro", "Beta", "Sale", "Info", "Hello", "Menu"] as const;
const CHILD_INSET = 40;
const CHILD_GAP = 20;

export type NestedVariant = "glyph_function" | "labeled_card" | "filled_shape" | "night_sky_rect";

interface ChildSpec {
  w: number;
  h: number;
  build: (bbox: BBox) => SceneShape;
}

/** Row-layout child bboxes inside the parent's inner region (never overlapping). */
function layoutChildren(rng: Rng, parent: BBox, specs: readonly ChildSpec[]): BBox[] {
  const innerX = parent.x + CHILD_INSET;
  const innerY = parent.y + CHILD_INSET;
  const innerW = Math.max(20, parent.width - 2 * CHILD_INSET);
  const innerH = Math.max(16, parent.height - 2 * CHILD_INSET);
  let dims = specs.map((s) => ({ w: Math.min(s.w, innerW), h: Math.min(s.h, innerH) }));
  const gaps = CHILD_GAP * Math.max(0, dims.length - 1);
  const total = dims.reduce((a, d) => a + d.w, 0) + gaps;
  if (total > innerW && total > gaps) {
    const scale = Math.max(0.1, (innerW - gaps) / (total - gaps));
    dims = dims.map((d) => ({ w: Math.max(14, Math.floor(d.w * scale)), h: d.h }));
  }
  const used = dims.reduce((a, d) => a + d.w, 0) + gaps;
  let x = innerX + rng.int(0, Math.max(0, Math.floor(innerW - used)));
  return dims.map((d) => {
    const bbox: BBox = {
      x,
      y: innerY + rng.int(0, Math.max(0, Math.floor(innerH - d.h))),
      width: d.w,
      height: d.h,
    };
    x += d.w + CHILD_GAP;
    return bbox;
  });
}

/** A colored interior mark (routes into the parent's fill/gradient). */
function markSpec(rng: Rng): ChildSpec {
  const gradient = rng.chance(0.25);
  const colors = gradient ? rng.shuffle(BRIGHT_INK).slice(0, 2) : [rng.pick(BRIGHT_INK)];
  const gradientDirection = gradient ? rng.pick(["down", "right", "diagonal"] as const) : null;
  const kind: ShapeKind = rng.chance(0.7) ? "scribble" : "smooth_path";
  return {
    w: rng.int(50, 130),
    h: rng.int(40, 100),
    build: (bbox) => ({ kind, glyph: null, text: null, colors, gradientDirection, bbox }),
  };
}

/** A handwritten word inside the parent (routes into the parent's label). */
function wordSpec(rng: Rng, word: string): ChildSpec {
  return {
    w: Math.max(60, Math.min(240, word.length * rng.int(12, 16))),
    h: rng.int(24, 38),
    build: (bbox) => ({
      kind: "text_writing",
      glyph: null,
      text: word,
      colors: rng.chance(0.35) ? [rng.pick(BRIGHT_INK)] : [],
      gradientDirection: null,
      bbox,
    }),
  };
}

/** A lone letter inside the parent (routes into the parent's OP — function). */
function glyphSpec(rng: Rng, letter: string): ChildSpec {
  const s = rng.int(24, 44);
  return {
    w: s,
    h: s,
    build: (bbox) => ({
      kind: "text_writing",
      glyph: null,
      text: letter,
      colors: rng.chance(0.3) ? [rng.pick(BRIGHT_INK)] : [],
      gradientDirection: null,
      bbox,
    }),
  };
}

/** Push parent + laid-out children; returns the pushed children's indices. */
function pushGroup(rng: Rng, shapes: SceneShape[], parent: SceneShape, specs: readonly ChildSpec[]): number[] {
  parent.nested = true;
  const parentIdx = shapes.push(parent) - 1;
  const boxes = layoutChildren(rng, parent.bbox, specs);
  return specs.map((spec, k) => {
    const child = spec.build(boxes[k]);
    child.nested = true;
    child.parentIndex = parentIdx;
    return shapes.push(child) - 1;
  });
}

/**
 * Add one nested group to the scene. `forceDetail` guarantees both a word AND
 * a color-mark child (detail-routing quota steering, build.ts).
 */
export function pushNestedGroup(rng: Rng, shapes: SceneShape[], opts: { forceDetail?: boolean } = {}): void {
  const forceDetail = opts.forceDetail === true;
  let variant: NestedVariant;
  const r = rng.next();
  if (r < 0.38) variant = "glyph_function";
  else if (r < 0.68) variant = "labeled_card";
  else if (r < 0.88) variant = "filled_shape";
  else variant = "night_sky_rect";
  if (
    variant === "night_sky_rect" &&
    (hasNavbarBox(shapes) || hasBigTopRect(shapes) || hasSkyOrAurora(shapes))
  ) {
    variant = "labeled_card"; // one sky per scene; never fight the navbar
  }

  if (variant === "glyph_function") {
    // The flagship case: box + lone letter + word + interior color → ONE
    // glyph-op command with label and fill routed in.
    const w = rng.int(320, 480);
    const h = rng.int(180, 300);
    const parent: SceneShape = {
      kind: "rect",
      glyph: null,
      text: null,
      ...sampleStyle(rng, { allowGradient: false, colorChance: 0.15 }),
      bbox: {
        x: rng.int(80, ARTBOARD.width - w - 80),
        y: rng.int(110, ARTBOARD.height - h - 140),
        width: w,
        height: h,
      },
    };
    const letter = rng.pick(["b", "b", "i", "f", "v", "?", "n"] as const);
    const specs: ChildSpec[] = [glyphSpec(rng, letter)];
    if (forceDetail || rng.chance(0.75)) {
      const word =
        letter === "b"
          ? rng.pick(BUTTON_LABELS)
          : letter === "f"
            ? rng.pick(FORM_TITLES)
            : rng.pick(SHORT_WORDS);
      specs.push(wordSpec(rng, word));
    }
    if (forceDetail || rng.chance(0.6)) specs.push(markSpec(rng));
    pushGroup(rng, shapes, parent, rng.shuffle(specs));
    return;
  }

  if (variant === "labeled_card") {
    const withInner = rng.chance(0.3); // depth-2: an inner box, maybe with its own word
    const w = rng.int(withInner ? 480 : 400, withInner ? 640 : 560);
    const h = rng.int(withInner ? 380 : 300, withInner ? 500 : 430);
    const parent: SceneShape = {
      kind: "rect",
      glyph: null,
      text: null,
      ...sampleStyle(rng, { gradientChance: 0.08, colorChance: 0.3 }),
      bbox: {
        x: rng.int(60, Math.max(61, ARTBOARD.width - w - 60)),
        y: rng.int(100, Math.max(101, ARTBOARD.height - h - 60)),
        width: w,
        height: h,
      },
    };
    const specs: ChildSpec[] = [wordSpec(rng, rng.pick(rng.chance(0.5) ? HEADINGS : SHORT_WORDS))];
    if (forceDetail || rng.chance(0.5)) specs.push(markSpec(rng));
    let innerSpecIdx = -1;
    if (withInner) {
      innerSpecIdx = specs.length;
      specs.push({
        w: rng.int(180, 250),
        h: rng.int(140, 180),
        build: (bbox) => ({
          kind: "rect",
          glyph: null,
          text: null,
          ...sampleStyle(rng, { allowGradient: false, colorChance: 0.3 }),
          bbox,
        }),
      });
    }
    const childIdxs = pushGroup(rng, shapes, parent, specs);
    if (withInner && rng.chance(0.6)) {
      const innerIdx = childIdxs[innerSpecIdx];
      const inner = shapes[innerIdx];
      if (inner.bbox.width >= 2 * CHILD_INSET + 40 && inner.bbox.height >= 2 * CHILD_INSET + 20) {
        const word = rng.pick(SHORT_WORDS);
        const [gb] = layoutChildren(rng, inner.bbox, [
          { w: Math.max(40, word.length * 13), h: 26, build: (b) => ({ kind: "text_writing", glyph: null, text: word, colors: [], gradientDirection: null, bbox: b }) },
        ]);
        shapes.push({
          kind: "text_writing",
          glyph: null,
          text: word,
          colors: [],
          gradientDirection: null,
          bbox: gb,
          nested: true,
          parentIndex: innerIdx,
        });
      }
    }
    return;
  }

  if (variant === "filled_shape") {
    const kind: ShapeKind = rng.chance(0.5) ? "ellipse" : "smooth_path";
    const w = rng.int(280, 440);
    const h = rng.int(220, 340);
    const parent: SceneShape = {
      kind,
      glyph: null,
      text: null,
      ...sampleStyle(rng, { allowGradient: false, colorChance: 0.12 }),
      bbox: {
        x: rng.int(70, ARTBOARD.width - w - 70),
        y: rng.int(110, ARTBOARD.height - h - 80),
        width: w,
        height: h,
      },
    };
    const specs: ChildSpec[] = [markSpec(rng)];
    if (forceDetail || rng.chance(0.35)) specs.push(wordSpec(rng, rng.pick(SHORT_WORDS)));
    pushGroup(rng, shapes, parent, rng.shuffle(specs));
    return;
  }

  // night_sky_rect: the rect-based sky, sometimes with a claimed star scribble
  // inside (a child detail that routes nothing — the sky owns its dark fill).
  const parent = nightSkyRectShape(rng);
  const specs: ChildSpec[] = [];
  if (rng.chance(0.5)) {
    specs.push({
      w: rng.int(80, 180),
      h: rng.int(60, 120),
      build: (bbox) => ({
        kind: "scribble",
        glyph: null,
        text: null,
        colors: rng.chance(0.6) ? [rng.pick(BRIGHT_INK)] : [],
        gradientDirection: null,
        bbox,
      }),
    });
  }
  pushGroup(rng, shapes, parent, specs);
}

// ---------------------------------------------------------------------------
// Wave 3.1 case constructors — style-descriptor hosts + composite-hint
// scribbles (steerable from build.ts, with organic base rates in the
// archetype builders so eval/test splits carry the cases too).
// ---------------------------------------------------------------------------

export type StyleCaseTarget =
  | "color"
  | "theme"
  /** Wave 3.1b: theme word on a GLYPH component — the fill:"gradient"+colors
   * convention, the hardest-learned slot in the 3.1 sweep. */
  | "theme_glyph"
  | "mixed"
  | "only"
  | "brand"
  | "ink";
export const STYLE_CASE_TARGETS: readonly StyleCaseTarget[] = [
  "color",
  "theme",
  "theme_glyph",
  "mixed",
  "only",
  "brand",
  "ink",
];

/** ≥85% of `a` inside some strictly-larger enclosed shape? (pre-jitter guard
 * so a steered top-level case is not swallowed into childhood — mirrors
 * corrupt.ts's stray guard, on scene shapes.) */
function wouldNestInShapes(bbox: BBox, shapes: readonly SceneShape[]): boolean {
  const area = Math.max(1, bbox.width) * Math.max(1, bbox.height);
  return shapes.some((s) => {
    if (!ENCLOSED_KINDS.has(s.kind)) return false;
    const sb = s.bbox;
    if (Math.max(1, sb.width) * Math.max(1, sb.height) <= area) return false;
    const ix = Math.max(0, Math.min(bbox.x + bbox.width, sb.x + sb.width) - Math.max(bbox.x, sb.x));
    const iy = Math.max(0, Math.min(bbox.y + bbox.height, sb.y + sb.height) - Math.max(bbox.y, sb.y));
    return (ix * iy) / area >= 0.85;
  });
}

/**
 * Push one style-descriptor case (README §1.7 / baselineShapes STYLE
 * DESCRIPTORS). Descriptor words appear BOTH as own-text on the shape and as
 * child detections (containment routing) — 50/50. Steered shapes are
 * essential: corruption may not garble the descriptor word away.
 */
export function pushStyleDescriptorCase(rng: Rng, shapes: SceneShape[], target: StyleCaseTarget): void {
  if (target === "brand") {
    if (!hasNavbarBox(shapes) && !hasBigTopRect(shapes) && rng.chance(0.6)) {
      shapes.push({ ...glyphBox(rng, "n", { text: rng.pick(BRANDISH_NAMES) }), essential: true });
    } else {
      // Title-Case brand-ish text on a button box — the non-nav brand guard.
      const host = glyphBox(rng, "b", { text: rng.pick(BRANDISH_NAMES) });
      shapes.push({ ...host, essential: true });
    }
    return;
  }

  const type: "color" | "theme" =
    target === "color"
      ? "color"
      : target === "theme" || target === "theme_glyph"
        ? "theme"
        : rng.chance(0.5)
          ? "color"
          : "theme";
  const mixed = target === "mixed" ? true : target === "only" ? false : rng.chance(0.5);
  const text = descriptorText(rng, type, mixed);
  const useChild = rng.chance(0.5);
  const inkColors = target === "ink" ? [rng.pick(BRIGHT_INK)] : [];

  // Wave 3.1b host bias: theme_glyph always takes a glyph host; plain theme
  // words favor glyph hosts too (0.7) — the fill:"gradient"+colors convention
  // was the hardest-learned slot in the 3.1 sweep.
  const glyphHost =
    target === "theme_glyph" ? true : type === "theme" ? rng.chance(0.7) : rng.chance(0.55);
  let host: SceneShape;
  if (glyphHost) {
    // Glyph-component host (fill:"gradient" + colors convention for themes).
    // Child-word variants need boxes tall enough for the CHILD_INSET margin,
    // so they use the f/i sizes; own-text variants favor buttons.
    const g = useChild ? rng.pick(["f", "i"] as const) : rng.pick(["b", "b", "f", "i"] as const);
    host = glyphBox(rng, g, { text: useChild ? undefined : text });
    host.colors = inkColors;
    host.gradientDirection = null;
  } else {
    // Base closed-shape host (params.gradient convention for themes).
    const kind: ShapeKind = rng.chance(0.5) ? "rect" : rng.chance(0.5) ? "ellipse" : "smooth_path";
    const w = rng.int(300, 460);
    const h = rng.int(220, 320);
    let bbox: BBox = { x: 100, y: 140, width: w, height: h };
    for (let attempt = 0; attempt < 20; attempt++) {
      bbox = {
        x: rng.int(70, ARTBOARD.width - w - 70),
        y: rng.int(110, ARTBOARD.height - h - 80),
        width: w,
        height: h,
      };
      if (!wouldNestInShapes(bbox, shapes)) break;
    }
    host = {
      kind,
      glyph: null,
      text: useChild ? null : text,
      colors: inkColors,
      gradientDirection: null,
      bbox,
    };
  }
  host.essential = true;

  if (!useChild) {
    shapes.push(host);
    return;
  }
  // Child-word variant: the descriptor word is its OWN detection inside the
  // host — containment routes it into the parent's params (or drops it as a
  // label when ink overrides).
  host.nested = true;
  const parentIdx = shapes.push(host) - 1;
  const spec = wordSpec(rng, text);
  const [bbox] = layoutChildren(rng, host.bbox, [spec]);
  const child = spec.build(bbox);
  child.nested = true;
  child.parentIndex = parentIdx;
  child.essential = true; // the descriptor word must survive corruption
  child.colors = []; // never let child ink race the steered target
  shapes.push(child);
}

/**
 * A composite-hint scribble (§1.7): messy ink whose geometry matches no clean
 * signature, carrying vision's diagram hint. Placement retries against
 * enclosed shapes so the case stays top-level.
 */
export function compositeHintScribble(
  rng: Rng,
  shapes: readonly SceneShape[],
  op?: OpShapesV2Diagram,
): SceneShape {
  const composite = op ?? rng.pick(OPS_SHAPES_V2_DIAGRAMS);
  let bbox: BBox = { x: 80, y: 200, width: 300, height: 280 };
  for (let attempt = 0; attempt < 20; attempt++) {
    const w = rng.int(240, 420);
    const h = rng.int(200, 380);
    bbox = {
      x: rng.int(60, ARTBOARD.width - w - 60),
      y: rng.int(140, ARTBOARD.height - h - 40),
      width: w,
      height: h,
    };
    if (!wouldNestInShapes(bbox, shapes)) break;
  }
  const r = rng.next();
  const colors = r < 0.4 ? [] : r < 0.8 ? [rng.pick(BRIGHT_INK)] : ["#111111"];
  return {
    kind: "scribble",
    glyph: null,
    text: null,
    colors,
    gradientDirection: null,
    bbox,
    composite,
  };
}

/** Button/label text with the wave-3.1b organic descriptor rate (~24%,
 * tripled share vs 3.1's 12% when combined with the raised quotas). */
function buttonText(rng: Rng): string {
  if (rng.chance(0.24)) {
    return descriptorText(rng, rng.chance(0.5) ? "color" : "theme", rng.chance(0.5));
  }
  return rng.pick(BUTTON_LABELS);
}

// ---------------------------------------------------------------------------
// Archetype builders
// ---------------------------------------------------------------------------

function buildLanding(rng: Rng): SceneShape[] {
  const shapes: SceneShape[] = [];
  if (rng.chance(0.85)) {
    // ~25% of named navbars carry a brand-ish (descriptor-containing) name —
    // the BRAND GUARD case ("Ocean Tours" stays a label).
    const brand = rng.chance(0.25) ? rng.pick(BRANDISH_NAMES) : rng.pick(BRAND_NAMES);
    shapes.push(glyphBox(rng, "n", { text: rng.chance(0.45) ? brand : undefined }));
  }
  if (rng.chance(0.45)) shapes.push(rng.chance(0.5) ? nightSkyShape(rng) : auroraShape(rng));
  const heading = textShape(rng, rng.pick(HEADINGS), { x: rng.int(360, 640), y: rng.int(170, 260) });
  shapes.push(heading);
  if (rng.chance(0.5)) shapes.push(sparklesShape(rng, heading.bbox));
  shapes.push(
    glyphBox(rng, "b", {
      centered: rng.chance(0.4),
      text: rng.chance(0.8) ? buttonText(rng) : undefined,
      y: rng.int(330, 430),
    }),
  );
  if (rng.chance(0.55)) shapes.push(waveShape(rng, rng.int(460, 580)));
  if (rng.chance(0.7)) {
    shapes.push(
      rng.chance(0.6) ? glyphBox(rng, rng.pick(["i", "v"] as const), { y: rng.int(560, 660) }) : plainRect(rng, { y: rng.int(560, 660) }),
    );
  }
  if (rng.chance(0.7)) shapes.push(bandRect(rng, "bottom"));
  return shapes;
}

function buildWireframe(rng: Rng): SceneShape[] {
  const shapes: SceneShape[] = [];
  const glyphs = rng.shuffle(["i", "f", "v", "?", "b"] as const).slice(0, rng.int(2, 4));
  for (const g of glyphs) {
    const centered = g === "f" ? rng.chance(0.5) : rng.chance(0.2);
    const text =
      g === "b" && rng.chance(0.7)
        ? buttonText(rng)
        : g === "f" && rng.chance(0.4)
          ? rng.pick(FORM_TITLES)
          : undefined;
    shapes.push(glyphBox(rng, g, { centered, text }));
  }
  shapes.push(plainRect(rng, { nearSquare: rng.chance(0.25) }));
  if (rng.chance(0.5)) shapes.push(plainRect(rng));
  if (rng.chance(0.45)) shapes.push(textShape(rng, rng.pick(HEADINGS)));
  if (rng.chance(0.3)) shapes.push(bandRect(rng, rng.chance(0.6) ? "bottom" : "top"));
  return shapes;
}

const DIAGRAM_COMPOSITES: ReadonlyArray<(rng: Rng) => SceneShape> = [
  (rng) => timelineShape(rng),
  barChartShape,
  pieChartShape,
  vennShape,
  periodicTableShape,
  atomicShape,
];

function buildDiagram(rng: Rng): SceneShape[] {
  const shapes: SceneShape[] = [];
  const nNodes = rng.int(2, 3);
  for (let i = 0; i < nNodes; i++) {
    const r = rng.next();
    if (r < 0.45) shapes.push(plainRect(rng));
    else if (r < 0.65) shapes.push(plainRect(rng, { nearSquare: true }));
    else if (r < 0.85) shapes.push(ellipseShape(rng));
    else shapes.push(ellipseShape(rng, { circle: true }));
  }
  const nConn = rng.int(1, 3);
  for (let i = 0; i < nConn; i++) {
    const kind = rng.chance(0.5) ? "arrow" : "line";
    const orient = rng.pick(["h", "v", "diag", "h"] as const);
    shapes.push(lineShape(rng, kind, orient));
  }
  // Wave 1.5: the diagram archetype now also sketches diagram composites —
  // each emitted as ONE scribble carrying its signature geometry/colors.
  if (rng.chance(0.6)) shapes.push(rng.pick(DIAGRAM_COMPOSITES)(rng));
  // Wave 3.1: messy diagrams that only the vision hint identifies (§1.7).
  // 3.1b: rate raised 0.25 → 0.45 (doubled hint→op command share).
  if (rng.chance(0.45)) shapes.push(compositeHintScribble(rng, shapes));
  if (rng.chance(0.6)) shapes.push(textShape(rng, rng.pick(HEADINGS)));
  return shapes;
}

function buildFreeform(rng: Rng): SceneShape[] {
  const shapes: SceneShape[] = [];
  const nPaths = rng.int(2, 3);
  for (let i = 0; i < nPaths; i++) shapes.push(freeformShape(rng));
  if (rng.chance(0.5)) shapes.push(ellipseShape(rng, { circle: rng.chance(0.4) }));
  if (rng.chance(0.4)) shapes.push(lineShape(rng, "line", "diag"));
  if (rng.chance(0.6)) shapes.push(textShape(rng, rng.pick(HEADINGS)));
  return shapes;
}

function buildDecorated(rng: Rng): SceneShape[] {
  const shapes: SceneShape[] = [];
  const heading = textShape(rng, rng.pick(HEADINGS), { x: rng.int(300, 620), y: rng.int(140, 260) });
  shapes.push(heading);
  if (rng.chance(0.8)) shapes.push(sparklesShape(rng, heading.bbox));
  if (rng.chance(0.6)) shapes.push(rng.chance(0.5) ? nightSkyShape(rng) : auroraShape(rng));
  if (rng.chance(0.7)) shapes.push(waveShape(rng));
  shapes.push(freeformShape(rng));
  if (rng.chance(0.35)) {
    shapes.push(glyphBox(rng, "b", { text: rng.chance(0.7) ? buttonText(rng) : undefined }));
  }
  return shapes;
}

const BUILDERS: Record<SceneArchetype, (rng: Rng) => SceneShape[]> = {
  landing: buildLanding,
  wireframe: buildWireframe,
  diagram: buildDiagram,
  freeform: buildFreeform,
  decorated: buildDecorated,
};

// ---------------------------------------------------------------------------
// Quota extras — place any op / snap-policy trigger plausibly on a scene.
// ---------------------------------------------------------------------------

const hasNavbarBox = (shapes: readonly SceneShape[]) => shapes.some((s) => s.glyph === "n");
// Wave-3 rect-based night sky material: a navbar/top-band placed on the same
// scene could end up ≥92% inside it and lose its command — keep them apart.
const hasBigTopRect = (shapes: readonly SceneShape[]) =>
  shapes.some(
    (s) =>
      s.kind === "rect" &&
      s.glyph === null &&
      s.bbox.y <= POLICY.nightSkyMaxY &&
      s.bbox.height >= 150 &&
      s.bbox.width >= POLICY.nightSkyMinWidth,
  );
// h ≥ 48 excludes timeline composites (h ≤ 22), which share the width band.
const countWaves = (shapes: readonly SceneShape[]) =>
  shapes.filter((s) => s.kind === "scribble" && s.bbox.width >= 1000 && s.bbox.height >= 48 && s.bbox.height <= 150).length;
// Dark-or-multicolor + tall + upper region: matches night_sky/aurora material
// without tripping on the wave-1.5 diagram composites (single bright color, or
// low on the page for venn).
const hasSkyOrAurora = (shapes: readonly SceneShape[]) =>
  shapes.some(
    (s) =>
      s.kind === "scribble" &&
      s.bbox.height >= 180 &&
      s.bbox.y <= 400 &&
      (s.colors.some((c) => luminance(c) < POLICY.darkLuminance) || s.colors.length >= 2),
  );

function findOrAddText(rng: Rng, shapes: SceneShape[]): SceneShape {
  const existing = shapes.find((s) => s.kind === "text_writing");
  if (existing) return existing;
  const t = textShape(rng, rng.pick(HEADINGS));
  shapes.push(t);
  return t;
}

/** Returns the shape to add (caller marks it essential), or null if redundant/impossible. */
export function placeExtraOp(rng: Rng, shapes: SceneShape[], op: OpShapesV2): SceneShape | null {
  switch (op) {
    case "rect":
      return plainRect(rng);
    case "ellipse":
      return ellipseShape(rng);
    case "line":
      return lineShape(rng, "line", "diag");
    case "arrow":
      return lineShape(rng, "arrow", "diag");
    case "text":
      return textShape(rng, rng.pick(HEADINGS));
    case "smooth_path":
      return freeformShape(rng);
    case "image":
      return glyphBox(rng, "i");
    case "form":
      return glyphBox(rng, "f", { text: rng.chance(0.4) ? rng.pick(FORM_TITLES) : undefined });
    case "button":
      return glyphBox(rng, "b", { text: rng.chance(0.8) ? rng.pick(BUTTON_LABELS) : undefined });
    case "navbar":
      return hasNavbarBox(shapes) || hasBigTopRect(shapes)
        ? null
        : glyphBox(rng, "n", { text: rng.chance(0.4) ? rng.pick(BRAND_NAMES) : undefined });
    case "video":
      return glyphBox(rng, "v");
    case "placeholder":
      return glyphBox(rng, "?");
    case "wave_divider":
      return countWaves(shapes) >= 2 ? null : waveShape(rng);
    case "night_sky": {
      // Wave 3: the rect-based form dominates (the fixed vision behavior);
      // the legacy scribble signature stays represented. Never a rect sky on
      // a scene with a navbar box (it would swallow it).
      if (hasSkyOrAurora(shapes) || hasBigTopRect(shapes)) return null;
      const rectForm = !hasNavbarBox(shapes) && rng.chance(0.6);
      return rectForm ? nightSkyRectShape(rng) : nightSkyShape(rng);
    }
    case "sparkles":
      return sparklesShape(rng, findOrAddText(rng, shapes).bbox);
    case "aurora_gradient":
      return hasSkyOrAurora(shapes) ? null : auroraShape(rng);
    // Diagram composites (wave 1.5): one scribble each, signature geometry.
    case "bar_chart":
      return barChartShape(rng);
    case "pie_chart":
      return pieChartShape(rng);
    case "venn_diagram":
      return vennShape(rng);
    case "timeline":
      return timelineShape(rng);
    case "periodic_table":
      return periodicTableShape(rng);
    case "atomic_structure":
      return atomicShape(rng);
  }
}

export function placeExtraSnap(rng: Rng, shapes: SceneShape[], snap: SnapPolicy): SceneShape | null {
  switch (snap) {
    case "none":
      return null; // every scene has plenty
    case "full_width_top":
      if (hasBigTopRect(shapes)) return null; // a rect sky would swallow it
      return hasNavbarBox(shapes) ? bandRect(rng, "top") : glyphBox(rng, "n");
    case "full_width_bottom":
      return bandRect(rng, "bottom");
    case "full_width":
      return countWaves(shapes) >= 2 ? null : waveShape(rng);
    case "straighten_h":
      return lineShape(rng, rng.chance(0.4) ? "arrow" : "line", "h");
    case "straighten_v":
      return lineShape(rng, rng.chance(0.4) ? "arrow" : "line", "v");
    case "square":
      return rng.chance(0.5) ? plainRect(rng, { nearSquare: true }) : ellipseShape(rng, { circle: true });
    case "center_in_region":
      return glyphBox(rng, rng.pick(["b", "f", "?"] as const), { centered: true });
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface GenerateSceneOptions {
  archetype: SceneArchetype;
  /** Ops that MUST survive to the gold output — quota steering (build.ts). */
  extraOps?: readonly OpShapesV2[];
  /** Snap policies that MUST survive to the gold output — quota steering. */
  extraSnaps?: readonly SnapPolicy[];
  /** Wave 3: number of nested groups to add (0 = flat scene). */
  nestedGroups?: number;
  /** Guarantee word + color-mark children in added groups (detail quota). */
  forceDetail?: boolean;
  /** Quota steering: add an essential rect-based night sky if the scene allows. */
  forceNightSkyRect?: boolean;
  /** Wave 3.1 quota steering: style-descriptor cases to add (essential). */
  styleCases?: readonly StyleCaseTarget[];
  /** Wave 3.1 quota steering: add an essential composite-hint scribble
   * (essentials draw high confidence, so the hint→op command is guaranteed). */
  forceCompositeCommand?: boolean;
}

export function generateScene(rng: Rng, opts: GenerateSceneOptions): Scene {
  const shapes = BUILDERS[opts.archetype](rng);
  for (let k = 0; k < (opts.nestedGroups ?? 0); k++) {
    pushNestedGroup(rng, shapes, { forceDetail: opts.forceDetail });
  }
  for (const target of opts.styleCases ?? []) {
    pushStyleDescriptorCase(rng, shapes, target);
  }
  if (opts.forceCompositeCommand) {
    shapes.push({ ...compositeHintScribble(rng, shapes), essential: true });
  }
  if (
    opts.forceNightSkyRect &&
    !hasSkyOrAurora(shapes) &&
    !hasBigTopRect(shapes) &&
    !hasNavbarBox(shapes)
  ) {
    shapes.push({ ...nightSkyRectShape(rng), essential: true });
  }
  for (const op of opts.extraOps ?? []) {
    const extra = placeExtraOp(rng, shapes, op);
    if (extra) shapes.push({ ...extra, essential: true });
  }
  for (const snap of opts.extraSnaps ?? []) {
    const extra = placeExtraSnap(rng, shapes, snap);
    if (extra) shapes.push({ ...extra, essential: true });
  }
  return { artboard: { ...ARTBOARD }, archetype: opts.archetype, shapes };
}
