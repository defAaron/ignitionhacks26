/**
 * Assemble (input, output) training pairs from gold scenes + corrupted shape
 * detections — WAVE 3.1 (containment + the composite hint + style-descriptor,
 * common-label, and diagram-variation densification). Enforces the coverage
 * quotas and exposes the row validator the CLI hard-fails on.
 *
 * Row format follows FreeSolo's JSONL rules: top-level keys are input /
 * output / metadata ONLY, and input/output are strings.
 *
 * BUILDER INPUT (the wave-3.1 runtime contract — training inputs match
 * byte-for-byte, shapeBuilderInputV31Schema / README §1.7):
 *   {"artboard":{width,height},
 *    "detections":[{id,kind,glyph,text,colors,gradient_direction,confidence,
 *                   bbox,parent,composite}]}
 * `parent` is emitted after bbox, `composite` LAST — the serialized key order
 * IS the contract (shared/schemas/README.md §§1.6-1.7). `composite` is
 * present on every detection (null when vision reported none), mirroring the
 * promotion-time `composite: n.composite` serving line. `parent` is never
 * hand-assigned: the builder runs `assignParents` (the exact normalizer
 * mirror) over the FINAL corrupted, sliced, shuffled detections, so the
 * minted links are what the runtime containment pass would produce on the
 * same bytes.
 *
 * OUTPUT: shapesOutputV3Schema — exactly ONE command per TOP-LEVEL detection
 * (parent === null), in input order. Children emit NOTHING; their words /
 * color marks / glyph letters route into the parent's command params
 * (scenes.ts goldForDetectionV3). A command answering a child detection is a
 * validator violation ("child-spawned command").
 */

import { z } from "zod";

import {
  OPS_SHAPES_V2_DIAGRAMS,
  OPS_SHAPES_V3,
  SHAPE_KINDS,
  SNAP_POLICIES_V1,
  shapeBuilderDetectionV3Schema,
  shapesOutputV3Schema,
  type OpShapesV3,
  type ShapeCommand,
  type SnapPolicy,
} from "../../types/schemas";
import { Rng, hashSeed } from "./prng";
import {
  ARTBOARD,
  COMMON_LABELS,
  SCENE_ARCHETYPES,
  assignParents,
  generateScene,
  goldForDetectionV3,
  type GoldV3,
  type SceneArchetype,
  type StyleCaseTarget,
} from "./scenes";
import { DEFAULT_NOISE, corruptScene, type NoiseModel } from "./corrupt";

// ---------------------------------------------------------------------------
// Wave-3.1 builder-input zod (README §1.7) — the v3 detection plus the
// OPTIONAL-nullable `composite` hint. Local until promotion (then it moves to
// types/schemas.ts alongside the toBuilderDetection serving change). Minted
// rows always CARRY the key (null when absent), mirroring the normalizer's
// `composite: ?? null` default — optionality is read-side grace for v3 rows.
// ---------------------------------------------------------------------------

export const shapeBuilderDetectionV31Schema = shapeBuilderDetectionV3Schema
  .extend({
    /** Vision's diagram-cluster hint (advisory; scribble-only semantics). */
    composite: z.enum(OPS_SHAPES_V2_DIAGRAMS).nullable().optional(),
  })
  .strict();

export const shapeBuilderInputV31Schema = z
  .object({
    artboard: z.object({ width: z.number(), height: z.number() }).strict(),
    detections: z.array(shapeBuilderDetectionV31Schema),
  })
  .strict();

// ---------------------------------------------------------------------------
// Dataset types
// ---------------------------------------------------------------------------

export type Split = "train" | "eval" | "test";
export const SPLITS: readonly Split[] = ["train", "eval", "test"];

export interface DatasetRow {
  input: string;
  output: string;
  metadata: Record<string, unknown>;
}

interface TrainTotal {
  train: number;
  total: number;
}

export interface CoverageReport {
  n: number;
  seed: number;
  splitSizes: Record<Split, number>;
  /** Op-command counts, per op, in train and overall. */
  opCounts: Record<string, TrainTotal>;
  /** Single quota for ALL 22 ops (wave 3: ≥10 in train at n=800). */
  minPerOpTrain: number;
  /** Snap-policy counts on op commands ("none" = omitted-or-explicit). */
  snapCounts: Record<string, TrainTotal>;
  minPerSnapTrain: number;
  waitExamples: number;
  waitCommands: number;
  waitReasons: Record<string, number>;
  /** Examples whose gold carries ≥1 fill or gradient param. */
  colorParamExamples: number;
  fillCommands: number;
  gradientCommands: number;
  detections: number;
  kindCounts: Record<string, number>;
  archetypes: Record<string, number>;
  // -- Wave 3 ---------------------------------------------------------------
  /** Examples containing ≥1 parent link. */
  nestedExamples: number;
  childDetections: number;
  /** Detection counts by nesting depth (0 = top-level). */
  depthCounts: { d0: number; d1: number; d2plus: number };
  /** EXAMPLE counts with ≥1 command carrying the routed detail. */
  detailRouting: {
    labelRouted: TrainTotal;
    fillRouted: TrainTotal; // fill OR gradient routed from a child color mark
    gradientRouted: TrainTotal;
    both: TrainTotal; // one command with label AND fill/gradient routed
  };
  minDetailRoutingTrain: number;
  minBothRoutingTrain: number;
  /** night_sky COMMANDS whose source detection kind is rect (the known gap). */
  nightSkyFromRect: TrainTotal;
  minNightSkyFromRectTrain: number;
  // -- Wave 3.1 -------------------------------------------------------------
  /** EXAMPLE counts per style-descriptor outcome (≥1 matching command). */
  styleDescriptor: {
    /** Applied color-word fill (e.g. "purple" → params.fill "#7c3aed"). */
    colorWord: TrainTotal;
    /** Applied theme-word gradient (base gradient or glyph fill:"gradient"). */
    themeWord: TrainTotal;
    /** Wave 3.1b: applied theme word on a GLYPH-COMPONENT command — the
     * fill:"gradient"+colors convention (hardest-learned slot). */
    themeOnGlyph: TrainTotal;
    /** Applied style AND a non-descriptor label landed ("Login rainbow"). */
    mixed: TrainTotal;
    /** Applied style, NO label (descriptor-only text). */
    descriptorOnly: TrainTotal;
    /** Brand guard: descriptor-containing text kept wholly as a label. */
    brandGuard: TrainTotal;
    /** Descriptor suppressed because observed ink colors styled the command. */
    inkOverride: TrainTotal;
    /** Descriptor word arrived as a CHILD detection (containment routing). */
    childSourced: TrainTotal;
  };
  minStyleWordTrain: number; // colorWord & themeWord floor
  minThemeGlyphTrain: number; // themeOnGlyph floor (wave 3.1b)
  minStyleMixTrain: number; // mixed floor
  minStyleOnlyTrain: number; // descriptorOnly floor (wave 3.1b, raised)
  minStyleGuardTrain: number; // brandGuard & inkOverride floor
  /** Composite-hint bookkeeping (README §1.7). */
  composite: {
    /** Input detections carrying a non-null composite (incl. children). */
    hintDetections: number;
    /** EXAMPLES with ≥1 hint→op diagram command. */
    commandExamples: TrainTotal;
    /** EXAMPLES with ≥1 hinted detection that still golds wait (discipline). */
    waitExamples: TrainTotal;
    /** Hints on non-scribble detections — ignored by gold (glyph discipline). */
    ignoredNonScribble: number;
  };
  minCompositeCommandTrain: number;
  minCompositeWaitTrain: number;
  /** EXAMPLES with ≥1 gold label from the 16 common words; command count too. */
  commonLabelExamples: TrainTotal;
  commonLabelCommands: number;
  minCommonLabelTrain: number;
}

export interface BuildResult {
  rows: DatasetRow[];
  splits: Split[];
  report: CoverageReport;
}

// ---------------------------------------------------------------------------
// Seed-stable split assignment (80/10/10)
// ---------------------------------------------------------------------------

export function assignSplits(n: number, seed: number): Split[] {
  const nEval = Math.max(1, Math.round(n * 0.1));
  const nTest = Math.max(1, Math.round(n * 0.1));
  if (n < 5) throw new Error("need n >= 5 for a meaningful split");
  const labels: Split[] = [];
  for (let i = 0; i < n - nEval - nTest; i++) labels.push("train");
  for (let i = 0; i < nEval; i++) labels.push("eval");
  for (let i = 0; i < nTest; i++) labels.push("test");
  return new Rng(hashSeed(seed, 0x511175)).shuffle(labels);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface BuildOptions {
  n: number;
  seed: number;
  noise?: NoiseModel;
}

const STEERABLE_SNAPS = SNAP_POLICIES_V1.filter((s) => s !== "none");

/** Glyph-component ops — for the theme-on-glyph (fill:"gradient") counter. */
const GLYPH_OPS_SET: ReadonlySet<string> = new Set([
  "image", "form", "button", "navbar", "video", "placeholder",
]);

/** Style-case rotation for held-out (eval/test) coverage. Wave 3.1b: the
 * hardest slots (theme-on-glyph, descriptor-only) appear twice per cycle. */
const STYLE_CASE_CYCLE: readonly StyleCaseTarget[] = [
  "theme_glyph",
  "only",
  "color",
  "theme",
  "mixed",
  "brand",
  "theme_glyph",
  "ink",
  "only",
  "color",
];

export function buildDataset(opts: BuildOptions): BuildResult {
  const { n, seed } = opts;
  const noise = opts.noise ?? DEFAULT_NOISE;
  const splits = assignSplits(n, seed);
  const trainSize = splits.filter((s) => s === "train").length;
  // Wave-3 quotas at n=800 (train≈640): every one of the 22 ops ≥10, every
  // snap policy ≥10, night_sky-from-rect ≥15, detail routing ≥80 per bucket.
  // Scaled down for small smoke runs.
  const big = trainSize >= 500;
  const minPerOpTrain = big ? 10 : Math.max(2, Math.floor(trainSize / 30));
  const minPerSnapTrain = big ? 10 : Math.max(1, Math.floor(trainSize / 32));
  const minNightSkyFromRectTrain = big ? 15 : Math.max(1, Math.floor(trainSize / 32));
  const minDetailRoutingTrain = big ? 80 : Math.max(2, Math.floor(trainSize / 8));
  const minBothRoutingTrain = big ? 80 : Math.max(1, Math.floor(trainSize / 12));
  // Wave-3.1b quotas (train, n=800) — TRIPLED style share vs 3.1 (the sweep
  // learned style-word routing only partially): style words ≥90 each,
  // theme-on-glyph ≥45 (the fill:"gradient"+colors convention — hardest
  // slot), mixed ≥45, descriptor-only ≥60 (also underlearned), brand-guard /
  // ink-override ≥30. Composite hint→op DOUBLED vs 3.1's realized share
  // (55 train examples → ≥110) with ≥45 hinted-but-wait (abstention
  // discipline kept proportional). Common labels ≥120.
  const minStyleWordTrain = big ? 90 : Math.max(2, Math.floor(trainSize / 8));
  const minThemeGlyphTrain = big ? 45 : Math.max(1, Math.floor(trainSize / 16));
  const minStyleMixTrain = big ? 45 : Math.max(1, Math.floor(trainSize / 15));
  const minStyleOnlyTrain = big ? 60 : Math.max(1, Math.floor(trainSize / 11));
  const minStyleGuardTrain = big ? 30 : Math.max(1, Math.floor(trainSize / 22));
  const minCompositeCommandTrain = big ? 110 : Math.max(1, Math.floor(trainSize / 6));
  const minCompositeWaitTrain = big ? 45 : Math.max(1, Math.floor(trainSize / 16));
  const minCommonLabelTrain = big ? 120 : Math.max(2, Math.floor(trainSize / 6));
  const commonLabelSet: ReadonlySet<string> = new Set(COMMON_LABELS);

  const trainOpCounts: Record<string, number> = {};
  for (const op of OPS_SHAPES_V3) trainOpCounts[op] = 0;
  const trainSnapCounts: Record<string, number> = {};
  for (const s of SNAP_POLICIES_V1) trainSnapCounts[s] = 0;

  const rows: DatasetRow[] = [];
  const report: CoverageReport = {
    n,
    seed,
    splitSizes: { train: 0, eval: 0, test: 0 },
    opCounts: Object.fromEntries(OPS_SHAPES_V3.map((op) => [op, { train: 0, total: 0 }])),
    minPerOpTrain,
    snapCounts: Object.fromEntries(SNAP_POLICIES_V1.map((s) => [s, { train: 0, total: 0 }])),
    minPerSnapTrain,
    waitExamples: 0,
    waitCommands: 0,
    waitReasons: {},
    colorParamExamples: 0,
    fillCommands: 0,
    gradientCommands: 0,
    detections: 0,
    kindCounts: Object.fromEntries(SHAPE_KINDS.map((k) => [k, 0])),
    archetypes: Object.fromEntries(SCENE_ARCHETYPES.map((a) => [a, 0])),
    nestedExamples: 0,
    childDetections: 0,
    depthCounts: { d0: 0, d1: 0, d2plus: 0 },
    detailRouting: {
      labelRouted: { train: 0, total: 0 },
      fillRouted: { train: 0, total: 0 },
      gradientRouted: { train: 0, total: 0 },
      both: { train: 0, total: 0 },
    },
    minDetailRoutingTrain,
    minBothRoutingTrain,
    nightSkyFromRect: { train: 0, total: 0 },
    minNightSkyFromRectTrain,
    styleDescriptor: {
      colorWord: { train: 0, total: 0 },
      themeWord: { train: 0, total: 0 },
      themeOnGlyph: { train: 0, total: 0 },
      mixed: { train: 0, total: 0 },
      descriptorOnly: { train: 0, total: 0 },
      brandGuard: { train: 0, total: 0 },
      inkOverride: { train: 0, total: 0 },
      childSourced: { train: 0, total: 0 },
    },
    minStyleWordTrain,
    minThemeGlyphTrain,
    minStyleMixTrain,
    minStyleOnlyTrain,
    minStyleGuardTrain,
    composite: {
      hintDetections: 0,
      commandExamples: { train: 0, total: 0 },
      waitExamples: { train: 0, total: 0 },
      ignoredNonScribble: 0,
    },
    minCompositeCommandTrain,
    minCompositeWaitTrain,
    commonLabelExamples: { train: 0, total: 0 },
    commonLabelCommands: 0,
    minCommonLabelTrain,
  };

  for (let i = 0; i < n; i++) {
    const split = splits[i];
    const rng = new Rng(hashSeed(seed, i + 1));
    const archetype: SceneArchetype = SCENE_ARCHETYPES[i % SCENE_ARCHETYPES.length];
    const wantWait = i % 4 === 0; // ~25% of examples contain ≥1 wait

    // Quota steering: pull the most-starved ops / snap policies into this
    // train example (essential shapes — corruption cannot flip their gold).
    let extraOps: OpShapesV3[] = [];
    let extraSnaps: SnapPolicy[] = [];
    if (split === "train") {
      extraOps = [...OPS_SHAPES_V3]
        .filter((op) => trainOpCounts[op] < minPerOpTrain)
        .sort((a, b) => trainOpCounts[a] - trainOpCounts[b])
        .slice(0, 2);
      extraSnaps = STEERABLE_SNAPS.filter((s) => trainSnapCounts[s] < minPerSnapTrain)
        .sort((a, b) => trainSnapCounts[a] - trainSnapCounts[b])
        .slice(0, 2);
    }

    // Wave-3 mix: ~50% of examples carry nested groups (odd indices), with
    // detail-routing / night-sky-from-rect steering as a quota backstop.
    const detailStarved =
      split === "train" &&
      (report.detailRouting.labelRouted.train < minDetailRoutingTrain ||
        report.detailRouting.fillRouted.train < minDetailRoutingTrain ||
        report.detailRouting.both.train < minBothRoutingTrain);
    const wantNested = i % 2 === 1 || detailStarved;
    const nestedGroups = wantNested ? (rng.chance(0.4) ? 2 : 1) : 0;
    const forceNightSkyRect =
      split === "train" && report.nightSkyFromRect.train < minNightSkyFromRectTrain;

    // Wave-3.1 steering: pull the two most-starved style-descriptor buckets
    // into this train example; composite quotas steer their own flags.
    let styleCases: StyleCaseTarget[] = [];
    let forceCompositeCommand = false;
    let forceCompositeStray = false;
    if (split === "train") {
      const sd = report.styleDescriptor;
      const starved: Array<[StyleCaseTarget, number, number]> = [
        ["color", sd.colorWord.train, minStyleWordTrain],
        ["theme", sd.themeWord.train, minStyleWordTrain],
        ["theme_glyph", sd.themeOnGlyph.train, minThemeGlyphTrain],
        ["mixed", sd.mixed.train, minStyleMixTrain],
        ["only", sd.descriptorOnly.train, minStyleOnlyTrain],
        ["brand", sd.brandGuard.train, minStyleGuardTrain],
        ["ink", sd.inkOverride.train, minStyleGuardTrain],
      ];
      styleCases = starved
        .filter(([, have, min]) => have < min)
        .sort((a, b) => a[1] / a[2] - b[1] / b[2])
        .slice(0, 2)
        .map(([t]) => t);
      forceCompositeCommand = report.composite.commandExamples.train < minCompositeCommandTrain;
      forceCompositeStray = wantWait && report.composite.waitExamples.train < minCompositeWaitTrain;
    } else {
      // Held-out coverage (wave 3.1b): quota steering is train-only, and the
      // 3.1 splits left the metrics as 3-sample noise. Cycle one style case
      // into every 2nd eval/test example and force a composite-hint command
      // into every 4th, so each 80-example split carries ≥20 style slots and
      // ≥10 composite command slots (with margin for the sparsity slice).
      if (i % 2 === 1) {
        styleCases = [STYLE_CASE_CYCLE[Math.floor(i / 2) % STYLE_CASE_CYCLE.length]];
      }
      if (i % 4 === 0) forceCompositeCommand = true;
    }

    const scene = generateScene(rng, {
      archetype,
      extraOps,
      extraSnaps,
      nestedGroups,
      forceDetail: detailStarved,
      forceNightSkyRect,
      styleCases,
      forceCompositeCommand,
    });
    let detections = corruptScene(scene, rng, noise, { wantWait, forceCompositeStray });
    const strayStart = scene.shapes.length; // strays are appended after the scene shapes

    // Containment over the corrupted geometry (the normalizer mirror).
    let parents = assignParents(detections);
    const rootOf = (k: number): number => {
      let r = k;
      while (parents[r] !== null) r = parents[r]!;
      return r;
    };

    // Sparsity mix: real users often draw 1-2 things before Autocomplete —
    // ~35% of examples are cut down to 1-2 GROUPS (a top-level detection plus
    // all its descendants) so command count is learned from the input, not
    // memorized. Group-aware slicing never orphans a child; wantWait examples
    // always keep ≥1 stray group so the wait survives.
    if (rng.next() < 0.35 && detections.length > 2) {
      const rootSet = new Set<number>();
      detections.forEach((_, k) => rootSet.add(rootOf(k)));
      const roots = [...rootSet];
      const nKeep = rng.next() < 0.5 ? 1 : 2;
      const kept = rng.shuffle(roots).slice(0, Math.min(nKeep, roots.length));
      if (wantWait && !kept.some((r) => r >= strayStart)) {
        const strayRoots = roots.filter((r) => r >= strayStart);
        if (strayRoots.length > 0) kept[0] = rng.pick(strayRoots);
      }
      const keptSet = new Set(kept);
      detections = detections.filter((_, k) => keptSet.has(rootOf(k)));
    }

    // Final input order is shuffled (children may precede their parent), then
    // parents are re-derived on exactly the bytes the model will see.
    detections = rng.shuffle(detections);
    parents = assignParents(detections);

    // Id-copying robustness: runtime ids are sequential det_1..N (normalizer),
    // so sequential dominates — but 20% of examples use non-sequential ids
    // (incl. prefix collisions like det_1/det_10) so the model learns to COPY
    // the input's ids rather than recite det_1, det_2, ...
    const sequentialIds = rng.next() < 0.8;
    const idPool = sequentialIds
      ? detections.map((_, k) => `det_${k + 1}`)
      : rng
          .shuffle(Array.from({ length: detections.length * 3 }, (_, j) => j + 1))
          .slice(0, detections.length)
          .map((v) => `det_${v}`);
    const parentIds = parents.map((p) => (p === null ? null : idPool[p]));

    // Gold: exactly one command per TOP-LEVEL detection, in input order.
    // Key order matches the contract examples: op, from, params?, snap?.
    const commands: ShapeCommand[] = [];
    const perCommand: Array<{ detIndex: number; gold: GoldV3 }> = [];
    detections.forEach((det, k) => {
      const gold = goldForDetectionV3(detections, parents, k, scene.artboard, rng);
      if (gold === null) return; // child — emits nothing
      const from = idPool[k];
      if (gold.command.op === "wait") {
        commands.push({ op: "wait", from, reason: gold.command.reason });
      } else {
        const cmd: ShapeCommand = { op: gold.command.op, from };
        if (gold.command.params !== undefined) cmd.params = gold.command.params;
        if (gold.command.snap !== undefined) cmd.snap = gold.command.snap;
        commands.push(cmd);
      }
      perCommand.push({ detIndex: k, gold });
    });

    // Byte-for-byte the wave-3.1 builder input (README §1.7): `parent` after
    // bbox, `composite` LAST — present on EVERY detection, null when absent
    // (mirrors the promotion-time `composite: n.composite` serialization).
    const input = JSON.stringify({
      artboard: { width: ARTBOARD.width, height: ARTBOARD.height },
      detections: detections.map((d, k) => ({
        id: idPool[k],
        kind: d.kind,
        glyph: d.glyph,
        text: d.text,
        colors: d.colors,
        gradient_direction: d.gradient_direction,
        confidence: d.confidence,
        bbox: d.bbox,
        parent: parentIds[k],
        composite: d.composite,
      })),
    });
    const output = JSON.stringify({ schema_version: "shapes-1.0", components: commands });

    // Bookkeeping.
    const depthOf = (k: number): number => {
      let d = 0;
      let r = k;
      while (parents[r] !== null) {
        r = parents[r]!;
        d++;
      }
      return d;
    };
    let waitCount = 0;
    let colorParams = 0;
    let exLabelRouted = false;
    let exFillRouted = false;
    let exGradientRouted = false;
    let exBoth = false;
    let exStyleColor = false;
    let exStyleTheme = false;
    let exThemeGlyph = false;
    let exStyleMixed = false;
    let exStyleOnly = false;
    let exBrandGuard = false;
    let exInkOverride = false;
    let exStyleChild = false;
    let exCompositeCmd = false;
    let exCompositeWait = false;
    let exCommonLabel = false;
    perCommand.forEach(({ detIndex, gold }, ci) => {
      const { routed } = gold;
      const cmd = commands[ci];
      // Wave 3.1 flags that apply to wait commands too (composite discipline).
      if (gold.compositeOutcome === "command") exCompositeCmd = true;
      if (gold.compositeOutcome === "wait") exCompositeWait = true;
      if (cmd.op === "wait") {
        waitCount++;
        report.waitCommands++;
        report.waitReasons[cmd.reason] = (report.waitReasons[cmd.reason] ?? 0) + 1;
        return;
      }
      // Wave 3.1: style descriptors, brand guard, common labels.
      const sd = gold.styleDescriptor;
      if (sd !== null) {
        if (sd.applied && sd.type === "color") exStyleColor = true;
        if (sd.applied && sd.type === "theme") exStyleTheme = true;
        if (sd.applied && sd.type === "theme" && GLYPH_OPS_SET.has(cmd.op)) exThemeGlyph = true;
        if (sd.applied && sd.mixed) exStyleMixed = true;
        if (sd.applied && !sd.mixed) exStyleOnly = true;
        if (sd.inkOverride) exInkOverride = true;
        if (sd.source === "child" && (sd.applied || sd.inkOverride)) exStyleChild = true;
      }
      if (gold.brandGuard) exBrandGuard = true;
      if (typeof cmd.params?.label === "string" && commonLabelSet.has(cmd.params.label)) {
        exCommonLabel = true;
        report.commonLabelCommands++;
      }
      report.opCounts[cmd.op].total++;
      const snap = cmd.snap ?? "none";
      report.snapCounts[snap].total++;
      if (split === "train") {
        report.opCounts[cmd.op].train++;
        trainOpCounts[cmd.op]++;
        report.snapCounts[snap].train++;
        trainSnapCounts[snap]++;
      }
      if (cmd.params?.fill !== undefined) {
        report.fillCommands++;
        colorParams++;
      }
      if (cmd.params?.gradient !== undefined) {
        report.gradientCommands++;
        colorParams++;
      }
      if (routed.label) exLabelRouted = true;
      if (routed.fill || routed.gradient) exFillRouted = true;
      if (routed.gradient) exGradientRouted = true;
      if (routed.label && (routed.fill || routed.gradient)) exBoth = true;
      if (cmd.op === "night_sky" && detections[detIndex].kind === "rect") {
        report.nightSkyFromRect.total++;
        if (split === "train") report.nightSkyFromRect.train++;
      }
    });

    const childCount = parents.filter((p) => p !== null).length;
    let maxDepth = 0;
    detections.forEach((_, k) => {
      const d = depthOf(k);
      maxDepth = Math.max(maxDepth, d);
      if (d === 0) report.depthCounts.d0++;
      else if (d === 1) report.depthCounts.d1++;
      else report.depthCounts.d2plus++;
    });

    rows.push({
      input,
      output,
      metadata: {
        example_index: i,
        seed: hashSeed(seed, i + 1),
        archetype,
        wait_planned: wantWait,
        wait_count: waitCount,
        color_param_commands: colorParams,
        nested_groups: nestedGroups,
        child_detections: childCount,
        max_depth: maxDepth,
        composite_hints: detections.filter((d) => d.composite !== null).length,
        style_descriptor_commands: perCommand.filter((p) => p.gold.styleDescriptor !== null).length,
        noise: {
          bbox_jitter_px: [noise.bboxJitterPx.min, noise.bboxJitterPx.max],
          kind_confusion_rate: noise.kindConfusionRate,
          // Wave 3.1: closed-shape confusion halved (runtime kind-correction).
          closed_kind_confusion_rate: noise.closedKindConfusionRate,
          spurious_composite_rate: noise.spuriousCompositeRate,
          glyph_misread_rate: noise.glyphMisreadRate,
          text_garble_rate: noise.textGarbleRate,
        },
      },
    });

    report.splitSizes[split]++;
    report.archetypes[archetype] = (report.archetypes[archetype] ?? 0) + 1;
    report.detections += detections.length;
    for (const d of detections) report.kindCounts[d.kind]++;
    if (waitCount > 0) report.waitExamples++;
    if (colorParams > 0) report.colorParamExamples++;
    if (childCount > 0) report.nestedExamples++;
    report.childDetections += childCount;
    const bump = (c: TrainTotal, on: boolean) => {
      if (!on) return;
      c.total++;
      if (split === "train") c.train++;
    };
    bump(report.detailRouting.labelRouted, exLabelRouted);
    bump(report.detailRouting.fillRouted, exFillRouted);
    bump(report.detailRouting.gradientRouted, exGradientRouted);
    bump(report.detailRouting.both, exBoth);
    // Wave 3.1.
    bump(report.styleDescriptor.colorWord, exStyleColor);
    bump(report.styleDescriptor.themeWord, exStyleTheme);
    bump(report.styleDescriptor.themeOnGlyph, exThemeGlyph);
    bump(report.styleDescriptor.mixed, exStyleMixed);
    bump(report.styleDescriptor.descriptorOnly, exStyleOnly);
    bump(report.styleDescriptor.brandGuard, exBrandGuard);
    bump(report.styleDescriptor.inkOverride, exInkOverride);
    bump(report.styleDescriptor.childSourced, exStyleChild);
    bump(report.composite.commandExamples, exCompositeCmd);
    bump(report.composite.waitExamples, exCompositeWait);
    bump(report.commonLabelExamples, exCommonLabel);
    for (const d of detections) {
      if (d.composite !== null) {
        report.composite.hintDetections++;
        if (d.kind !== "scribble") report.composite.ignoredNonScribble++;
      }
    }
  }

  // Hard quota checks — steering should make these unreachable; if one fires,
  // the generator has a coverage bug.
  const starvedOps = OPS_SHAPES_V3.filter((op) => trainOpCounts[op] < minPerOpTrain);
  if (starvedOps.length > 0) {
    throw new Error(
      `op quota unmet in train split (< ${minPerOpTrain}): ` +
        starvedOps.map((op) => `${op}=${trainOpCounts[op]}`).join(", "),
    );
  }
  const starvedSnaps = SNAP_POLICIES_V1.filter((s) => trainSnapCounts[s] < minPerSnapTrain);
  if (starvedSnaps.length > 0) {
    throw new Error(
      `snap quota unmet in train split (< ${minPerSnapTrain}): ` +
        starvedSnaps.map((s) => `${s}=${trainSnapCounts[s]}`).join(", "),
    );
  }
  if (report.colorParamExamples / n < 0.3) {
    throw new Error(
      `color/gradient quota unmet: ${report.colorParamExamples}/${n} examples carry color params (< 30%)`,
    );
  }
  const waitFrac = report.waitExamples / n;
  if (waitFrac < 0.2 || waitFrac > 0.32) {
    throw new Error(`wait quota off target (~25%): ${report.waitExamples}/${n} examples`);
  }
  const dr = report.detailRouting;
  if (dr.labelRouted.train < minDetailRoutingTrain || dr.fillRouted.train < minDetailRoutingTrain) {
    throw new Error(
      `detail-routing quota unmet in train (< ${minDetailRoutingTrain}): ` +
        `label=${dr.labelRouted.train}, fill=${dr.fillRouted.train}`,
    );
  }
  if (dr.both.train < minBothRoutingTrain) {
    throw new Error(`both-routed quota unmet in train (< ${minBothRoutingTrain}): both=${dr.both.train}`);
  }
  if (report.nightSkyFromRect.train < minNightSkyFromRectTrain) {
    throw new Error(
      `night_sky-from-rect quota unmet in train (< ${minNightSkyFromRectTrain}): ${report.nightSkyFromRect.train}`,
    );
  }
  // -- Wave 3.1 quotas --------------------------------------------------------
  const sd = report.styleDescriptor;
  const sdChecks: Array<[string, number, number]> = [
    ["color-word", sd.colorWord.train, minStyleWordTrain],
    ["theme-word", sd.themeWord.train, minStyleWordTrain],
    ["theme-on-glyph", sd.themeOnGlyph.train, minThemeGlyphTrain],
    ["mixed", sd.mixed.train, minStyleMixTrain],
    ["descriptor-only", sd.descriptorOnly.train, minStyleOnlyTrain],
    ["brand-guard", sd.brandGuard.train, minStyleGuardTrain],
    ["ink-override", sd.inkOverride.train, minStyleGuardTrain],
  ];
  const sdStarved = sdChecks.filter(([, have, min]) => have < min);
  if (sdStarved.length > 0) {
    throw new Error(
      "style-descriptor quota unmet in train: " +
        sdStarved.map(([name, have, min]) => `${name}=${have}<${min}`).join(", "),
    );
  }
  if (report.composite.commandExamples.train < minCompositeCommandTrain) {
    throw new Error(
      `composite hint→op quota unmet in train (< ${minCompositeCommandTrain}): ${report.composite.commandExamples.train}`,
    );
  }
  if (report.composite.waitExamples.train < minCompositeWaitTrain) {
    throw new Error(
      `composite-abstention quota unmet in train (< ${minCompositeWaitTrain}): ${report.composite.waitExamples.train}`,
    );
  }
  if (report.commonLabelExamples.train < minCommonLabelTrain) {
    throw new Error(
      `common-label quota unmet in train (< ${minCommonLabelTrain}): ${report.commonLabelExamples.train}`,
    );
  }

  return { rows, splits, report };
}

// ---------------------------------------------------------------------------
// Row validation — the CLI hard-fails the run if any row returns errors.
// ---------------------------------------------------------------------------

export function validateRow(row: DatasetRow): string[] {
  const errs: string[] = [];

  const topKeys = Object.keys(row).filter((k) => !["input", "output", "metadata"].includes(k));
  if (topKeys.length > 0) errs.push(`stray top-level keys (FreeSolo drops them): ${topKeys.join(", ")}`);
  if (typeof row.input !== "string") errs.push("input is not a string");
  if (typeof row.output !== "string") errs.push("output is not a string");
  if (errs.length > 0) return errs;

  let inputRaw: unknown;
  let outputRaw: unknown;
  try {
    inputRaw = JSON.parse(row.input);
  } catch {
    return ["input is not valid JSON"];
  }
  try {
    outputRaw = JSON.parse(row.output);
  } catch {
    return ["output is not valid JSON"];
  }

  const input = shapeBuilderInputV31Schema.safeParse(inputRaw);
  if (!input.success) {
    errs.push(`input schema: ${input.error.issues[0]?.path.join(".")} ${input.error.issues[0]?.message}`);
  }
  const output = shapesOutputV3Schema.safeParse(outputRaw);
  if (!output.success) {
    errs.push(`output schema: ${output.error.issues[0]?.path.join(".")} ${output.error.issues[0]?.message}`);
  }
  if (!input.success || !output.success) return errs;

  const dets = input.data.detections;
  const ids = dets.map((d) => d.id);
  if (new Set(ids).size !== ids.length) errs.push("duplicate detection ids");
  const idSet = new Set(ids);

  // Parent references must exist and never self-reference.
  for (const d of dets) {
    if (d.parent !== null && (!idSet.has(d.parent) || d.parent === d.id)) {
      errs.push(`detection ${d.id} has invalid parent ${JSON.stringify(d.parent)}`);
    }
  }

  // Geometric parity: every minted parent link must be EXACTLY what the
  // normalizer's §1.6 pass produces from the serialized kinds/bboxes
  // (≥92% containment, strictly-larger enclosed-kind parent, deepest wins).
  const expected = assignParents(dets.map((d) => ({ kind: d.kind, bbox: d.bbox })));
  for (let k = 0; k < dets.length; k++) {
    const want = expected[k] === null ? null : ids[expected[k]!];
    if (dets[k].parent !== want) {
      errs.push(
        `parent parity violated for ${ids[k]}: minted ${JSON.stringify(dets[k].parent)}, ` +
          `geometry rules say ${JSON.stringify(want)}`,
      );
      break;
    }
  }

  // Coverage: exactly one command per TOP-LEVEL detection, same order; ZERO
  // child-spawned commands.
  const topIds = dets.filter((d) => d.parent === null).map((d) => d.id);
  const childIds = new Set(dets.filter((d) => d.parent !== null).map((d) => d.id));
  const fromIds = output.data.components.map((c) => c.from);
  for (const f of fromIds) {
    if (childIds.has(f)) errs.push(`child-spawned command (from ${f})`);
  }
  if (topIds.length !== fromIds.length) {
    errs.push(`coverage violated: ${topIds.length} top-level detections vs ${fromIds.length} commands`);
  } else {
    for (let k = 0; k < topIds.length; k++) {
      if (topIds[k] !== fromIds[k]) {
        errs.push(`coverage mismatch at index ${k}: top-level ${topIds[k]} vs command from ${fromIds[k]}`);
        break;
      }
    }
  }

  // No-coordinates principle: belt-and-braces against schema drift.
  for (const cmd of output.data.components) {
    if (cmd.op === "wait") continue;
    for (const key of ["x", "y", "width", "height", "bbox"]) {
      if (key in cmd || (cmd.params !== undefined && key in cmd.params)) {
        errs.push(`geometry leaked into output (${key} on op ${cmd.op})`);
      }
    }
  }

  return errs;
}
