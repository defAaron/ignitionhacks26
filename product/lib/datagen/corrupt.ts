/**
 * Derive the noisy INPUT (shape detections) from a gold scene — step 2 of the
 * answer-first pipeline, shapes-first edition. For every scene shape we
 * synthesize the detection the vision layer would plausibly have produced:
 * jittered bbox, kind confusions (a sloppy rect reads as smooth_path, a line
 * grows an imagined arrowhead…), glyph misreads (i↔l, dropped glyph), garbled
 * handwriting, color noise, dropped gradient direction, tiered confidence.
 * We also inject stray scribble detections and low-confidence demotions —
 * both resolve to gold `wait` through the policy in scenes.ts.
 *
 * IMPORTANT: corruption happens BEFORE gold assignment. The gold output is
 * policy(detection) (scenes.ts), so noise here changes the label consistently
 * — a rect that reads as smooth_path IS a smooth_path to the builder.
 */

import { OPS_SHAPES_V2_DIAGRAMS } from "../../types/schemas";
import type { Rng } from "./prng";
import type { Scene, SceneDetection, SceneShape } from "./scenes";
import { GLYPH_OPS } from "./scenes";

// ---------------------------------------------------------------------------
// Noise model
// ---------------------------------------------------------------------------

export interface ConfRange {
  min: number;
  max: number;
}

/**
 * All the knobs that shape input noise.
 *
 * ⚠ PLACEHOLDER DEFAULTS — every number in DEFAULT_NOISE is a sane guess to be
 * REPLACED BY CALIBRATION NUMBERS measured from real labeled sketches
 * (labeler calibration split): bbox jitter from vision-bbox vs. guide-box
 * error, kind-confusion and glyph-misread rates from the bake-off confusion
 * matrix, confidence tiers from the observed score distribution.
 */
export interface NoiseModel {
  /** Uniform jitter amplitude (px); sampled per detection, applied per edge. */
  bboxJitterPx: ConfRange;
  /** Jitter cap for quota-essential shapes (must not cross policy thresholds). */
  essentialJitterCapPx: number;
  /**
   * Jitter cap for nested-group members (wave 3): child insets (CHILD_INSET)
   * are sized so containment survives worst-case drift under this cap.
   */
  nestedJitterCapPx: number;
  /** P(kind misread) for OPEN strokes: line↔arrow (imagined/missed head). */
  kindConfusionRate: number;
  /**
   * P(kind misread) for CLOSED shapes: rect→smooth_path, ellipse→smooth_path.
   * Wave 3.1: HALVED from the wave-3 rate (0.07 → 0.035) — the runtime now
   * runs a deterministic kind-correction pass (README §2.5) that promotes
   * closed ink misreported as line/scribble/smooth_path back to its enclosed
   * kind, so enclosed shapes rarely reach the builder mis-kinded. Open-stroke
   * line↔arrow confusion is untouched (correction never reads arrowheads).
   */
  closedKindConfusionRate: number;
  /**
   * P(a spurious composite hint lands on a NON-scribble detection) — wave 3.1
   * discipline material: composite is only meaningful on kind "scribble"
   * (README §1.7), so gold ignores these entirely.
   */
  spuriousCompositeRate: number;
  /** P(an injected stray scribble carries a composite hint). See corruptScene. */
  strayCompositeRate: number;
  /** P(a recognized glyph is misread — usually to a letter outside the book, e.g. i→l). */
  glyphMisreadRate: number;
  /** P(the glyph goes unnoticed entirely → plain rect). */
  glyphDropRate: number;
  /** P(handwriting survives but garbled: dropped/swapped/duplicated/cased chars). */
  textGarbleRate: number;
  /** P(one observed color is missed when the shape carries ≥2). Non-scribble only. */
  colorDropRate: number;
  /** P(a color is reported slightly off — small per-channel hex shift). Non-scribble only. */
  colorShiftRate: number;
  /** P(gradient_direction goes unreported despite multicolor shading). */
  gradientDropRate: number;
  /** Confidence ranges per tier; `wait` is the stray/demoted range (< policy threshold). */
  confidence: {
    high: ConfRange;
    medium: ConfRange;
    low: ConfRange;
    wait: ConfRange;
  };
  /** Tier draw weights for kept shapes (remainder → low). Essentials draw high. */
  tierWeights: { high: number; medium: number };
  /** Stray scribble detections injected when a wait is planned. */
  strayCount: { min: number; max: number };
  /** P(a planned-wait example also demotes one real shape to wait-tier confidence). */
  demoteRate: number;
}

export const DEFAULT_NOISE: NoiseModel = {
  bboxJitterPx: { min: 3, max: 25 },
  essentialJitterCapPx: 10,
  nestedJitterCapPx: 8,
  kindConfusionRate: 0.07,
  closedKindConfusionRate: 0.035, // wave 3.1: halved (runtime kind-correction)
  // Wave 3.1b: hint→op command share doubled — the discipline material scales
  // proportionally (spurious non-scribble hints 0.02 → 0.04, hinted strays
  // 0.2 → 0.3; the hinted-wait quota in build.ts doubles alongside).
  spuriousCompositeRate: 0.04,
  strayCompositeRate: 0.3,
  glyphMisreadRate: 0.06,
  glyphDropRate: 0.04,
  textGarbleRate: 0.08,
  colorDropRate: 0.1,
  colorShiftRate: 0.1,
  gradientDropRate: 0.12,
  confidence: {
    high: { min: 0.7, max: 0.97 },
    medium: { min: 0.52, max: 0.7 },
    low: { min: 0.36, max: 0.5 },
    wait: { min: 0.08, max: 0.3 },
  },
  tierWeights: { high: 0.66, medium: 0.26 },
  strayCount: { min: 1, max: 2 },
  demoteRate: 0.45,
};

// ---------------------------------------------------------------------------
// Confusion tables
// ---------------------------------------------------------------------------

/** Geometric kind confusions a vision model plausibly makes (vocabulary.md §4). */
const KIND_CONFUSIONS: Partial<Record<SceneDetection["kind"], SceneDetection["kind"]>> = {
  rect: "smooth_path", // sloppy box reads as freeform
  ellipse: "smooth_path",
  line: "arrow", // imagined head
  arrow: "line", // missed head
};

/** Misread targets per glyph — mostly letters OUTSIDE the book (→ placeholder gold). */
const GLYPH_MISREADS: Record<string, readonly string[]> = {
  i: ["l", "j", "1"],
  f: ["t", "r"],
  b: ["h", "d", "6"],
  n: ["m", "h"],
  v: ["u", "y"],
  "?": ["7", "2"],
};

const RECOGNIZED_GLYPHS = Object.keys(GLYPH_OPS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const round2 = (v: number) => Math.round(v * 100) / 100;

function sampleTier(rng: Rng, noise: NoiseModel): ConfRange {
  const r = rng.next();
  if (r < noise.tierWeights.high) return noise.confidence.high;
  if (r < noise.tierWeights.high + noise.tierWeights.medium) return noise.confidence.medium;
  return noise.confidence.low;
}

const conf = (rng: Rng, range: ConfRange) => round2(rng.float(range.min, range.max));

export function garble(rng: Rng, s: string): string {
  let out = s;
  const nOps = rng.int(1, 2);
  for (let i = 0; i < nOps; i++) {
    const kind = rng.pick(["drop", "swap", "dup", "case"] as const);
    if (kind === "drop" && out.length > 2) {
      const at = rng.int(0, out.length - 1);
      out = out.slice(0, at) + out.slice(at + 1);
    } else if (kind === "swap" && out.length > 2) {
      const at = rng.int(0, out.length - 2);
      out = out.slice(0, at) + out[at + 1] + out[at] + out.slice(at + 2);
    } else if (kind === "dup") {
      const at = rng.int(0, out.length - 1);
      out = out.slice(0, at + 1) + out[at] + out.slice(at + 1);
    } else {
      out = rng.chance(0.5) ? out.toLowerCase() : out.toUpperCase();
    }
  }
  return out === s ? s.toLowerCase() : out;
}

/** Small per-channel shift of a #rrggbb color (vision reading ink slightly off). */
function shiftColor(rng: Rng, color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const ch = (i: number) => {
    const v = parseInt(m[1].slice(i * 2, i * 2 + 2), 16);
    return Math.max(0, Math.min(255, v + rng.int(-10, 10)));
  };
  return `#${[ch(0), ch(1), ch(2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface CorruptOptions {
  /**
   * When true this example must contain ≥1 gold `wait`: stray scribbles are
   * always injected, and one real shape may be demoted to wait-tier
   * confidence. When false the example contains zero waits (build.ts owns the
   * ~25% quota via this flag).
   */
  wantWait: boolean;
  /**
   * Wave 3.1 quota steering: force the first injected stray to carry a
   * composite hint AT wait-tier confidence — the "hint present but ink too
   * doubtful → still wait" abstention case (§1.7: confidence outranks the
   * hint). Only meaningful when wantWait is true.
   */
  forceCompositeStray?: boolean;
}

/** Scene order preserved here; build.ts shuffles detection order. */
export function corruptScene(
  scene: Scene,
  rng: Rng,
  noise: NoiseModel,
  opts: CorruptOptions,
): SceneDetection[] {
  // Pick at most one real shape to demote to wait-tier confidence (never a
  // quota-essential — its op must survive to the gold side; never a nested
  // CHILD — children emit no commands, so demoting one mints no wait).
  let demoteIdx = -1;
  if (opts.wantWait && rng.chance(noise.demoteRate)) {
    const eligible = scene.shapes
      .map((_, i) => i)
      .filter((i) => !scene.shapes[i].essential && scene.shapes[i].parentIndex === undefined);
    if (eligible.length > 1) demoteIdx = rng.pick(eligible);
  }

  const detections = scene.shapes.map((shape, i) =>
    corruptShape(shape, rng, noise, { demoted: i === demoteIdx }),
  );

  if (opts.wantWait) {
    const nStray = rng.int(noise.strayCount.min, noise.strayCount.max);
    // Strays must stay TOP-LEVEL (a stray swallowed by a big shape becomes a
    // child and emits no wait) — placement retries against the already-built
    // corrupted detections until it is safely below the containment band.
    //
    // Wave 3.1 composite discipline: the FIRST stray guards the example's
    // ≥1-wait guarantee, so when it carries a hint its confidence is forced
    // into the wait band (hint + doubtful ink → wait). Later strays may carry
    // a hint at free confidence — a confident hinted stray golds the diagram
    // op (the hint→op path), an unhinted one stays the classic ambiguous wait.
    for (let k = 0; k < nStray; k++) {
      const hinted =
        k === 0
          ? opts.forceCompositeStray === true || rng.chance(noise.strayCompositeRate)
          : rng.chance(noise.strayCompositeRate);
      detections.push(
        strayScribble(rng, noise, detections, {
          composite: hinted ? rng.pick(OPS_SHAPES_V2_DIAGRAMS) : null,
          forceLowConf: k === 0 && hinted,
        }),
      );
    }
  }

  return detections;
}

function corruptShape(
  shape: SceneShape,
  rng: Rng,
  noise: NoiseModel,
  opts: { demoted: boolean },
): SceneDetection {
  const essential = shape.essential === true;
  const amp = essential
    ? Math.min(noise.essentialJitterCapPx, noise.bboxJitterPx.max)
    : shape.nested === true
      ? Math.min(noise.nestedJitterCapPx, noise.bboxJitterPx.max)
      : rng.float(noise.bboxJitterPx.min, noise.bboxJitterPx.max);
  const j = () => Math.round(rng.float(-amp, amp));
  const bbox = {
    x: Math.max(0, shape.bbox.x + j()),
    y: Math.max(0, shape.bbox.y + j()),
    width: Math.max(12, shape.bbox.width + j()),
    height: Math.max(8, shape.bbox.height + j()),
  };

  // Kind confusion — never for essentials, glyph boxes (the letter implies the
  // box was read), or scribbles (their signatures are the decorative gold).
  // Wave 3.1: closed shapes (rect/ellipse) confuse at the HALVED rate — the
  // runtime kind-correction pass catches most closed-ink misreads before the
  // builder sees them; open strokes (line↔arrow) keep the wave-3 rate.
  let kind = shape.kind;
  if (!essential && shape.glyph === null && KIND_CONFUSIONS[kind]) {
    const rate =
      kind === "rect" || kind === "ellipse" ? noise.closedKindConfusionRate : noise.kindConfusionRate;
    if (rng.chance(rate)) kind = KIND_CONFUSIONS[kind]!;
  }

  // Glyph noise: dropped (unnoticed) or misread (mostly to out-of-book letters,
  // sometimes to another recognized glyph — the gold op follows what was read).
  let glyph = shape.glyph;
  if (glyph !== null && !essential) {
    if (rng.chance(noise.glyphDropRate)) {
      glyph = null;
    } else if (rng.chance(noise.glyphMisreadRate)) {
      glyph = rng.chance(0.3)
        ? rng.pick(RECOGNIZED_GLYPHS.filter((g) => g !== glyph))
        : rng.pick(GLYPH_MISREADS[glyph] ?? ["x"]);
    }
  }

  // Wave 3.1: essentials are exempt from garbling too — a garbled descriptor
  // word ("ranbow") is no longer a descriptor, which would flip the steered
  // shape's gold (essential contract: corruption never changes the policy
  // outcome). Non-essential text garbles as before.
  let text = shape.text;
  if (text !== null && !essential && rng.chance(noise.textGarbleRate)) text = garble(rng, text);

  // Color noise (non-scribble only — decorative signatures key on colors).
  let colors = [...shape.colors];
  if (shape.kind !== "scribble" && !essential) {
    if (colors.length >= 2 && rng.chance(noise.colorDropRate)) colors = colors.slice(0, -1);
    if (colors.length >= 1 && rng.chance(noise.colorShiftRate)) {
      colors[0] = shiftColor(rng, colors[0]);
    }
  }

  let gradient_direction = shape.gradientDirection;
  if (gradient_direction !== null && !essential && rng.chance(noise.gradientDropRate)) {
    gradient_direction = null; // multicolor fill falls back to params.fill
  }

  const tier = opts.demoted ? noise.confidence.wait : essential ? noise.confidence.high : sampleTier(rng, noise);

  // Wave 3.1 composite (§1.7): authored hints (only ever on scribble shapes)
  // pass through; a SPURIOUS hint occasionally lands on a non-scribble
  // detection — gold ignores it there (glyph discipline), which is exactly
  // the ignore-behavior the data must teach. Scribbles never get a spurious
  // hint (it would flip their gold).
  let composite = shape.composite ?? null;
  if (composite === null && kind !== "scribble" && rng.chance(noise.spuriousCompositeRate)) {
    composite = rng.pick(OPS_SHAPES_V2_DIAGRAMS);
  }

  return { kind, glyph, text, colors, gradient_direction, confidence: conf(rng, tier), bbox, composite };
}

/**
 * Stray ink: a scribble matching NO decorative and NO diagram signature.
 * Half arrive below the confidence floor → wait("low_confidence"); half are
 * confident-but-shapeless → wait("ambiguous"). All variants stay colorless or
 * dark — the bar/pie/atomic diagram signatures require exactly one BRIGHT
 * color, so these can never resolve to a diagram op. Three shapes:
 *
 *  - blot: the original mid-size square-ish blob (260–380px).
 *  - grid: a bar_chart/rect-grid look-alike — bar-band bbox but colorless/dark
 *    ink, the "is that a bar chart or just a grid of boxes?" ambiguity.
 *  - rings: an atomic_structure/concentric-rings look-alike — atomic-band
 *    near-square bbox, colorless/dark. Both resolve to gold `wait`.
 */
const ENCLOSED_STRAY_GUARD_KINDS = new Set<SceneDetection["kind"]>(["rect", "ellipse", "smooth_path"]);

/** Fraction of `a`'s area inside `b` (would the containment pass adopt it?). */
function containedFrac(a: SceneDetection["bbox"], b: SceneDetection["bbox"]): number {
  const aw = Math.max(1, a.width);
  const ah = Math.max(1, a.height);
  const ix = Math.max(0, Math.min(a.x + aw, b.x + Math.max(1, b.width)) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + ah, b.y + Math.max(1, b.height)) - Math.max(a.y, b.y));
  return (ix * iy) / (aw * ah);
}

function wouldNest(bbox: SceneDetection["bbox"], placed: readonly SceneDetection[]): boolean {
  const area = Math.max(1, bbox.width) * Math.max(1, bbox.height);
  return placed.some(
    (d) =>
      ENCLOSED_STRAY_GUARD_KINDS.has(d.kind) &&
      Math.max(1, d.bbox.width) * Math.max(1, d.bbox.height) > area &&
      // 0.85 leaves margin under the normalizer's 0.92 band (strays are
      // minted post-jitter, so this is the final geometry).
      containedFrac(bbox, d.bbox) >= 0.85,
  );
}

function strayScribble(
  rng: Rng,
  noise: NoiseModel,
  placed: readonly SceneDetection[],
  opts: { composite?: SceneDetection["composite"]; forceLowConf?: boolean } = {},
): SceneDetection {
  const lowConf = opts.forceLowConf === true || rng.chance(0.5);
  const variant = rng.pick(["blot", "grid", "rings"] as const);
  let bbox = { x: 60, y: 180, width: 300, height: 300 };
  for (let attempt = 0; attempt < 30; attempt++) {
    if (variant === "grid") {
      const w = rng.int(330, 500);
      bbox = { x: rng.int(60, 900), y: rng.int(180, 560), width: w, height: Math.round(w / rng.float(1.5, 2.0)) };
    } else if (variant === "rings") {
      const s = rng.int(235, 285);
      bbox = { x: rng.int(60, 1000), y: rng.int(180, 560), width: s, height: s };
    } else {
      bbox = { x: rng.int(60, 1000), y: rng.int(180, 620), width: rng.int(260, 380), height: rng.int(260, 380) };
    }
    if (!wouldNest(bbox, placed)) break;
  }
  return {
    kind: "scribble",
    glyph: null,
    text: null,
    colors: rng.chance(0.3) ? ["#111111"] : [],
    gradient_direction: null,
    confidence: conf(rng, lowConf ? noise.confidence.wait : noise.confidence.low),
    bbox,
    composite: opts.composite ?? null,
  };
}
