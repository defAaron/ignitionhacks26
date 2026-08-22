/* baio eval harness — runs a BuilderClient-compatible endpoint against the
   held-out FreeSolo splits and prints the metric table from ai-pipeline.md §5.

   Usage:
     npx tsx scripts/eval-harness.ts --model baseline --split eval [--n 50]
     npx tsx scripts/eval-harness.ts --model freesolo --split test --concurrency 8
     npx tsx scripts/eval-harness.ts --contract legacy --model baseline --split eval

   --contract shapes  → shapes-v1 contract (default; shapes-first pivot).
                        Dataset rows are {input: ShapeBuilderInput JSON,
                        output: ShapesOutput JSON}, read from
                        freesolo/dataset/shapes/{split}.jsonl (or --dataset).
                        AUTO-UPGRADES to shapes-v3 scoring when every input
                        detection in the dataset carries a `parent` key.
   --contract shapes-v3 → wave-3 containment contract (shapes-v3.json;
                        shared/schemas/README.md §1.6). Dataset rows are
                        {input: ShapeBuilderInputV3 JSON (detections carry
                        `parent`), output: ShapesOutput JSON}, read from
                        freesolo/dataset/shapes-v3/{split}.jsonl (or
                        --dataset). Adds the wave-3 metrics (defined at
                        scoreShapesRow): detail-routing accuracy,
                        containment-respected rate, child-spawned-command
                        rate, night_sky-from-rect accuracy; the re-check row
                        becomes the full wave-3 validator (schema + coverage
                        + semantic). --model baseline routes to
                        BaselineShapesV3Builder.
                        Wave-3.1 additions (auto-active on the v3 path;
                        harmless zeros/"n/a" when a dataset has no such
                        cases — defined at scoreV3GoldSlices): style-word
                        routing accuracy (+ descriptor-wrongly-labeled
                        count), composite→op accuracy, and
                        composite-abstention accuracy. The current datagen
                        emits no style_descriptor metadata flag (verified
                        2026-07-19: metadata keys are example_index, seed,
                        archetype, wait_planned, wait_count,
                        color_param_commands, nested_groups,
                        child_detections, max_depth, noise), so descriptor
                        cases are DETECTED from the row itself with a local
                        descriptor word list mirroring the baselineShapes
                        "STYLE DESCRIPTORS" rule.
   --contract legacy  → pre-pivot components-v1 contract, byte-for-byte the
                        old metric path so the flash-1784430057 run's eval
                        stays reproducible. Reads freesolo/dataset/{split}.jsonl.
   --dataset <path>   → explicit dataset path override (any contract).
   --self-test        → offline (no network, no dataset): run the wave-3 and
                        wave-3.1 scoring/validator assertions against mock
                        builders and exit non-zero on any failure.
   --concurrency N    → promise-pool of N workers over the dataset rows
                        (default 1 = serial, throttle-safe for the Gemini free
                        tier; use 8 for freesolo-endpoint runs). Each row is
                        scored into an independent per-row record and the
                        records are aggregated in row order after the pool
                        drains — completion order cannot change the numbers.
                        Latency is still measured per call.

   --model baseline  → Gemini prompted baseline (needs GEMINI_API_KEY):
                       lib/models/baseline (legacy) / baselineShapes (shapes)
   --model freesolo  → lib/models/freesolo (OpenAI-compatible deployed adapter;
                       needs FREESOLO_BASE_URL + FREESOLO_MODEL + FREESOLO_API_KEY,
                       from `flash deployments --json` — see freesolo/TRAINING.md)

   The RAW client is used, not the getBuilder()/getShapeBuilder() fallback
   chain — silent fallback (freesolo→baseline→all-wait) would contaminate the
   A/B comparison. A builder throw counts against the model it was pointed at.

   All clients schema-gate their own output (they throw BuilderError on
   transport, truncation, parse, or schema failure), so "builder success rate"
   here subsumes the PRD's parse rate; the zod re-check row is belt-and-braces.

   Shapes-mode metric notes: the contract has NO coordinates, so there is no
   bbox IoU row — geometry is a pure function of ink. In its place: snap
   accuracy (exact match vs gold, absent counted as "none") and params
   accuracy (fill/gradient/text, loose match).

   Output: markdown table on stdout + appended to freesolo/eval-results.md.
   Reads .env manually (no dotenv dep). No new dependencies. */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaselineBuilder,
  BaselineShapesBuilder,
  FreesoloBuilder,
  type BuilderClient,
  type BuilderInput,
  type ShapeBuilderClient,
  type ShapeBuilderInput,
} from "../lib/models";
import { BaselineShapesV3Builder } from "../lib/models/baselineShapes";
import { validateShapes, type ShapeValidationCtx } from "../lib/validate/shapes";
import {
  componentsOutputV1Schema,
  shapesOutputSchema,
  type ComponentsOutputV1,
  type ShapesOutput,
} from "../types/schemas";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// .env (manual parse; already-set process.env wins over file values)
// ---------------------------------------------------------------------------
function loadDotEnv(): void {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const val = m[2].replace(/^(["'])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ---------------------------------------------------------------------------
// Scoring helpers (mirror freesolo/environment.py)
// ---------------------------------------------------------------------------
type Box = { x: number; y: number; width: number; height: number };

function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function asObj(v: unknown): Record<string, unknown> | null {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

const pct = (num: number, den: number): string =>
  den > 0 ? `${((100 * num) / den).toFixed(1)}%` : "n/a";

// Retry with backoff on rate limits (free-tier Gemini: 15 req/min). Rate-limit
// waits are excluded from the latency measurement.
async function callWithBackoff<T>(
  fn: () => Promise<T>
): Promise<{ result: T; rateLimitWaitMs: number } | { error: string; rateLimitWaitMs: number }> {
  let rateLimitWaitMs = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return { result: await fn(), rateLimitWaitMs };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const is429 = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
      if (is429 && attempt < 4) {
        const m = msg.match(/retry in ([\d.]+)s/i);
        const waitMs = m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : 25_000;
        rateLimitWaitMs += waitMs;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return { error: msg, rateLimitWaitMs };
    }
  }
  return { error: "retry budget exhausted", rateLimitWaitMs };
}

/**
 * Simple promise pool: N workers pull the next unclaimed index until the item
 * list is exhausted. Results land at their item's index, so downstream
 * aggregation always sees row order regardless of completion order. N=1
 * degenerates to the plain serial loop.
 */
async function promisePool<T, R>(
  items: readonly T[],
  n: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

interface DatasetRow {
  input: unknown;
  output: unknown;
}

function readRows(datasetPath: string, maxN: number): DatasetRow[] {
  return readFileSync(datasetPath, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as DatasetRow)
    .slice(0, maxN === Infinity ? undefined : maxN);
}

function report(header: string, table: string): void {
  console.log(header + table);
  const resultsPath = path.join(ROOT, "freesolo", "eval-results.md");
  if (!existsSync(resultsPath)) appendFileSync(resultsPath, "# baio eval results\n");
  appendFileSync(resultsPath, header + table + "\n");
  console.log(`\nAppended to ${resultsPath}`);
}

interface EvalMeta {
  modelKind: string;
  modelId: string;
  split: string;
  concurrency: number;
}

// ---------------------------------------------------------------------------
// LEGACY contract eval (components-v1) — metric math kept byte-for-byte so the
// flash-1784430057 run's numbers stay reproducible. Every accumulator is a sum
// of independent per-row contributions, so scoring rows into records and
// summing after the pool drains is exactly the old serial arithmetic.
// ---------------------------------------------------------------------------

/** One dataset row's contribution to every legacy accumulator. */
interface LegacyRowStats {
  builderOk: number;
  builderErrors: number;
  zodOk: number;
  opHits: number;
  opTotal: number;
  labelHits: number;
  labelTotal: number;
  iouSum: number;
  iouN: number;
  hallucCmds: number;
  totalCmds: number;
  missedDets: number;
  totalDets: number;
  waitTP: number;
  waitFP: number;
  waitFN: number;
  /** Per-call latency (rate-limit waits excluded); null for skipped rows. */
  latency: number | null;
}

function emptyLegacyStats(): LegacyRowStats {
  return {
    builderOk: 0, builderErrors: 0, zodOk: 0,
    opHits: 0, opTotal: 0, labelHits: 0, labelTotal: 0, iouSum: 0, iouN: 0,
    hallucCmds: 0, totalCmds: 0, missedDets: 0, totalDets: 0,
    waitTP: 0, waitFP: 0, waitFN: 0,
    latency: null,
  };
}

async function scoreLegacyRow(
  client: BuilderClient,
  row: DatasetRow,
  i: number
): Promise<LegacyRowStats> {
  const s = emptyLegacyStats();

  // Rule zero: dataset `input` is the serialized BuilderInput, byte-for-byte
  // the runtime format. Deserialize it back for the client.
  const inputObj = asObj(row.input);
  const gold = asObj(row.output);
  if (!inputObj || !gold) {
    console.error(`  [${i}] bad dataset row (input/output not JSON) — skipped`);
    return s;
  }
  const detIds = ((inputObj.detections as { id?: string }[] | undefined) ?? [])
    .map((d) => d.id)
    .filter((id): id is string => typeof id === "string");
  s.totalDets += detIds.length;
  const goldCmds = (gold.components as Record<string, unknown>[] | undefined) ?? [];

  const t0 = performance.now();
  const call = await callWithBackoff(() =>
    client.buildComponents(inputObj as unknown as BuilderInput)
  );
  s.latency = performance.now() - t0 - call.rateLimitWaitMs;

  let doc: ComponentsOutputV1 | null = null;
  if ("result" in call) {
    doc = call.result;
    s.builderOk++;
  } else {
    s.builderErrors++;
    console.error(`  [${i}] builder failed: ${call.error.slice(0, 200)}`);
  }

  if (!doc) {
    // Failed call: every gold detection is missed; gold waits are false negatives.
    s.missedDets += detIds.length;
    for (const g of goldCmds) if (g.op === "wait") s.waitFN++;
    s.opTotal += goldCmds.filter((g) => g.op !== "wait").length;
    return s;
  }
  if (componentsOutputV1Schema.safeParse(doc).success) s.zodOk++;

  const cmds = doc.components as unknown as Record<string, unknown>[];
  s.totalCmds += cmds.length;
  const respByFrom = new Map<string, Record<string, unknown>>();
  for (const c of cmds) {
    const from = c?.from as string | undefined;
    if (!from || !detIds.includes(from) || respByFrom.has(from)) s.hallucCmds++;
    else respByFrom.set(from, c);
  }
  for (const id of detIds) if (!respByFrom.has(id)) s.missedDets++;

  for (const g of goldCmds) {
    const from = g.from as string;
    const r = respByFrom.get(from);
    const rIsWait = r?.op === "wait";
    if (g.op === "wait") {
      if (rIsWait) s.waitTP++;
      else s.waitFN++;
      continue;
    }
    if (rIsWait) s.waitFP++;
    s.opTotal++;
    if (r && !rIsWait) {
      if (r.op === g.op) s.opHits++;
      s.iouSum += iou(r as unknown as Box, g as unknown as Box);
      s.iouN++;
    }
    if (typeof g.label === "string") {
      s.labelTotal++;
      if (typeof r?.label === "string" && r.label.trim().toLowerCase() === g.label.trim().toLowerCase()) s.labelHits++;
    }
  }
  return s;
}

async function runLegacyEval(
  client: BuilderClient,
  rows: DatasetRow[],
  meta: EvalMeta
): Promise<void> {
  const perRow = await promisePool(rows, meta.concurrency, (row, i) =>
    scoreLegacyRow(client, row, i)
  );

  // Aggregate in row order from the per-row records.
  const t = emptyLegacyStats();
  const latencies: number[] = [];
  for (const s of perRow) {
    t.builderOk += s.builderOk; t.builderErrors += s.builderErrors; t.zodOk += s.zodOk;
    t.opHits += s.opHits; t.opTotal += s.opTotal;
    t.labelHits += s.labelHits; t.labelTotal += s.labelTotal;
    t.iouSum += s.iouSum; t.iouN += s.iouN;
    t.hallucCmds += s.hallucCmds; t.totalCmds += s.totalCmds;
    t.missedDets += s.missedDets; t.totalDets += s.totalDets;
    t.waitTP += s.waitTP; t.waitFP += s.waitFP; t.waitFN += s.waitFN;
    if (s.latency !== null) latencies.push(s.latency);
  }

  const n = rows.length;
  const waitP = t.waitTP + t.waitFP > 0 ? t.waitTP / (t.waitTP + t.waitFP) : 0;
  const waitR = t.waitTP + t.waitFN > 0 ? t.waitTP / (t.waitTP + t.waitFN) : 0;
  const waitF1 = waitP + waitR > 0 ? (2 * waitP * waitR) / (waitP + waitR) : 0;
  const sortedLat = [...latencies].sort((a, b) => a - b);

  const table = [
    `| Metric | Value |`,
    `|---|---|`,
    `| Examples (split=${meta.split}) | ${n} |`,
    `| Builder success rate (parse+schema gate inside client) | ${pct(t.builderOk, n)} |`,
    `| Builder errors (transport/truncation/parse/schema) | ${t.builderErrors} |`,
    `| Schema-valid rate (zod re-check, components-v1) | ${pct(t.zodOk, n)} |`,
    `| Per-detection op accuracy | ${pct(t.opHits, t.opTotal)} |`,
    `| Label accuracy | ${pct(t.labelHits, t.labelTotal)} |`,
    `| Mean bbox IoU | ${t.iouN > 0 ? (t.iouSum / t.iouN).toFixed(3) : "n/a"} |`,
    `| Hallucinated-command rate | ${pct(t.hallucCmds, t.totalCmds)} |`,
    `| Missed-detection rate | ${pct(t.missedDets, t.totalDets)} |`,
    `| Abstention precision / recall / F1 | ${waitP.toFixed(3)} / ${waitR.toFixed(3)} / ${waitF1.toFixed(3)} |`,
    `| Latency p50 / p95 (ms) | ${percentile(sortedLat, 50).toFixed(0)} / ${percentile(sortedLat, 95).toFixed(0)} |`,
  ].join("\n");

  const header = `\n## ${new Date().toISOString()} — contract=legacy model=${meta.modelKind} (${meta.modelId}) split=${meta.split} n=${n} concurrency=${meta.concurrency}\n\n`;
  report(header, table);
}

// ---------------------------------------------------------------------------
// SHAPES contract eval (shapes-v1)
// ---------------------------------------------------------------------------

/** Loose string match: trimmed, case-insensitive. */
function looseStr(a: unknown, b: unknown): boolean {
  return (
    typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase()
  );
}

/** Loose gradient match: same direction, same color set (case-insensitive). */
function looseGradient(a: unknown, b: unknown): boolean {
  const ga = a as { colors?: unknown; direction?: unknown } | null;
  const gb = b as { colors?: unknown; direction?: unknown } | null;
  if (!ga || !gb || typeof ga !== "object" || typeof gb !== "object") return false;
  if (!looseStr(ga.direction, gb.direction)) return false;
  if (!Array.isArray(ga.colors) || !Array.isArray(gb.colors)) return false;
  const norm = (arr: unknown[]): string[] =>
    arr.map((c) => String(c).trim().toLowerCase()).sort();
  const ca = norm(ga.colors), cb = norm(gb.colors);
  return ca.length === cb.length && ca.every((c, i) => c === cb[i]);
}

/** Loose color-list match: same color set, trimmed/case-insensitive (the
 * glyph-component gradient convention: params.fill="gradient" + params.colors). */
function looseColorList(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const norm = (arr: unknown[]): string[] =>
    arr.map((c) => String(c).trim().toLowerCase()).sort();
  const ca = norm(a), cb = norm(b);
  return ca.length === cb.length && ca.every((c, i) => c === cb[i]);
}

// ---------------------------------------------------------------------------
// Wave-3.1 style descriptors — local list mirroring the baselineShapes
// "STYLE DESCRIPTORS" rule (lib/models/baselineShapes.ts): theme/gradient
// words verbatim from the rule; color words are the common color names the
// rule exemplifies with "purple"/"red"/"teal". A written word from this list
// is a STYLING instruction (fill/gradient), never a label — unless gold ruled
// it part of a label ("Ocean Tours"), which the scorer excludes by checking
// the gold label's tokens.
// ---------------------------------------------------------------------------
const DESCRIPTOR_THEME_WORDS = [
  "rainbow", "sunset", "ocean", "fire", "neon",
  "pastel", "gold", "aurora", "dark", "midnight",
] as const;
const DESCRIPTOR_COLOR_WORDS = [
  "red", "orange", "yellow", "green", "blue", "purple", "violet", "pink",
  "teal", "cyan", "magenta", "indigo", "navy", "crimson", "maroon", "olive",
  "lime", "mint", "coral", "lavender", "turquoise", "black", "white",
  "gray", "grey", "brown", "silver",
] as const;
const DESCRIPTOR_WORDS: ReadonlySet<string> = new Set<string>([
  ...DESCRIPTOR_THEME_WORDS,
  ...DESCRIPTOR_COLOR_WORDS,
]);

/** Lowercased word tokens of a written text ("Login rainbow" → ["login","rainbow"]). */
function wordTokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

/** Composite-less big-scribble threshold: bbox area ≥ this fraction of the
 * artboard is "diagram-sized" (≈226×113 on a 1280×800 artboard) — small
 * sparkle/ambiguous scribbles stay out of the composite-abstention slice. */
const BIG_SCRIBBLE_AREA_FRACTION = 0.025;

/** One dataset row's contribution to every shapes accumulator. The v3-only
 * fields stay 0 under wave-1/2 scoring and are only reported for v3 runs. */
interface ShapesRowStats {
  builderOk: number;
  builderErrors: number;
  /** Waves 1/2: zod re-check passes. V3: full wave-3 validator passes
   * (schema + coverage + semantic, validateShapes wave 3). */
  zodOk: number;
  opHits: number;
  opTotal: number;
  snapHits: number;
  snapTotal: number;
  paramHits: number;
  paramTotal: number;
  hallucCmds: number;
  totalCmds: number;
  missedDets: number;
  totalDets: number;
  waitTP: number;
  waitFP: number;
  waitFN: number;
  // -- wave-3 (containment) metrics -----------------------------------------
  /** Commands whose `from` is a CHILD detection (parent !== null) — the
   * failure mode wave 3 kills. Counted separately from hallucinations. */
  childSpawnedCmds: number;
  /** Rows with a parsed builder doc (denominator for containment rate). */
  containmentRowsTotal: number;
  /** Rows (with a parsed doc) containing ZERO child-spawned commands. */
  containmentRespectedRows: number;
  /** Detail-routing slots: one per gold-command label/fill/gradient value
   * that is SOURCED FROM A CHILD detection (label ↔ a child's text matches
   * it; fill ↔ a child's colors include it; gradient ↔ a child's colors
   * cover its color list). Hit iff the model's matching command carries the
   * same value, loose compare — counted per slot, like params accuracy. */
  detailHits: number;
  detailTotal: number;
  /** Slice: gold night_sky commands whose source detection kind is "rect";
   * hit iff the model's matching command op is night_sky. */
  nightSkyRectHits: number;
  nightSkyRectTotal: number;
  // -- wave-3.1 metrics (harmless zeros on datasets with no such cases) ------
  /** STYLE-WORD ROUTING slots: gold non-wait commands whose params carry
   * fill/gradient styling AND some written text on the source detection (own
   * or child) contains a DESCRIPTOR word (local list, minus tokens gold kept
   * in the label). Hit iff the model's command carries the same styling
   * (loose, per key: fill/gradient/colors) AND put no descriptor word in its
   * label. */
  styleRouteHits: number;
  styleRouteTotal: number;
  /** Of the style-word slots: model emitted a descriptor word in params.label
   * (the exact failure the descriptor rule forbids). */
  styleDescriptorLabeled: number;
  /** COMPOSITE→OP slots: gold non-wait commands whose source detection
   * carries composite: X and whose gold op IS X (the trained mapping;
   * hint-wrong adversarial rows are excluded so following a bad hint is
   * never rewarded). Hit iff the model's command op === X. */
  compositeOpHits: number;
  compositeOpTotal: number;
  /** COMPOSITE-ABSTENTION slots (only when the row's detections carry the
   * composite key, i.e. a v3.1 dataset): gold wait commands whose source
   * detection is a composite-less big scribble (kind=scribble, composite
   * null, bbox ≥ BIG_SCRIBBLE_AREA_FRACTION of the artboard). Hit iff the
   * model also waited. */
  compositeAbstainHits: number;
  compositeAbstainTotal: number;
  /** Per-call latency (rate-limit waits excluded); null for skipped rows. */
  latency: number | null;
}

function emptyShapesStats(): ShapesRowStats {
  return {
    builderOk: 0, builderErrors: 0, zodOk: 0,
    opHits: 0, opTotal: 0, snapHits: 0, snapTotal: 0, paramHits: 0, paramTotal: 0,
    hallucCmds: 0, totalCmds: 0, missedDets: 0, totalDets: 0,
    waitTP: 0, waitFP: 0, waitFN: 0,
    childSpawnedCmds: 0, containmentRowsTotal: 0, containmentRespectedRows: 0,
    detailHits: 0, detailTotal: 0, nightSkyRectHits: 0, nightSkyRectTotal: 0,
    styleRouteHits: 0, styleRouteTotal: 0, styleDescriptorLabeled: 0,
    compositeOpHits: 0, compositeOpTotal: 0,
    compositeAbstainHits: 0, compositeAbstainTotal: 0,
    latency: null,
  };
}

/** Loosely-typed view of one input detection (v3 rows carry `parent`;
 * v3.1 rows also carry `composite` — vision's diagram hint). */
interface RowDet {
  id?: string;
  kind?: string;
  glyph?: string | null;
  text?: string | null;
  colors?: unknown;
  parent?: string | null;
  composite?: string | null;
  bbox?: Box;
}

async function scoreShapesRow(
  client: ShapeBuilderClient,
  row: DatasetRow,
  i: number,
  v3 = false
): Promise<ShapesRowStats> {
  const s = emptyShapesStats();

  // Rule zero: dataset `input` is the serialized ShapeBuilderInput (V3 when
  // v3), byte-for-byte the runtime format. Deserialize it back for the client.
  const inputObj = asObj(row.input);
  const gold = asObj(row.output);
  if (!inputObj || !gold) {
    console.error(`  [${i}] bad dataset row (input/output not JSON) — skipped`);
    return s;
  }
  const dets = (inputObj.detections as RowDet[] | undefined) ?? [];
  const detIds = dets.map((d) => d.id).filter((id): id is string => typeof id === "string");
  // Wave 3: only TOP-LEVEL detections (parent null/absent) may be answered;
  // children are details. Waves 1/2: every detection is answerable.
  const childIds = v3
    ? new Set(
        dets
          .filter((d) => (d.parent ?? null) !== null)
          .map((d) => d.id)
          .filter((id): id is string => typeof id === "string")
      )
    : new Set<string>();
  const answerableIds = detIds.filter((id) => !childIds.has(id));
  const answerableSet = new Set(answerableIds);
  s.totalDets += answerableIds.length;
  const goldCmds = (gold.components as Record<string, unknown>[] | undefined) ?? [];

  // v3 lookup tables: immediate children per parent id, detection per id,
  // plus the wave-3.1 row facts (artboard area for the big-scribble
  // threshold; whether this row's detections carry the `composite` key —
  // the v3.1 dataset signature that arms the composite-abstention slice).
  const childrenByParent = new Map<string, RowDet[]>();
  const detById = new Map<string, RowDet>();
  const artboard = inputObj.artboard as { width?: number; height?: number } | undefined;
  const artboardArea =
    (typeof artboard?.width === "number" ? artboard.width : 1280) *
    (typeof artboard?.height === "number" ? artboard.height : 800);
  const hasCompositeKey = v3 && dets.some((d) => d !== null && typeof d === "object" && "composite" in d);
  if (v3) {
    for (const d of dets) {
      if (typeof d.id === "string") detById.set(d.id, d);
      const p = d.parent ?? null;
      if (typeof p === "string") {
        const list = childrenByParent.get(p) ?? [];
        list.push(d);
        childrenByParent.set(p, list);
      }
    }
  }

  const t0 = performance.now();
  const call = await callWithBackoff(() =>
    client.buildShapes(inputObj as unknown as ShapeBuilderInput)
  );
  s.latency = performance.now() - t0 - call.rateLimitWaitMs;

  let doc: ShapesOutput | null = null;
  if ("result" in call) {
    doc = call.result;
    s.builderOk++;
  } else {
    s.builderErrors++;
    console.error(`  [${i}] builder failed: ${call.error.slice(0, 200)}`);
  }

  if (!doc) {
    // Failed call: every answerable gold detection is missed; gold waits are
    // false negatives. (Detail/night-sky slices also count their misses.)
    s.missedDets += answerableIds.length;
    for (const g of goldCmds) if (g.op === "wait") s.waitFN++;
    s.opTotal += goldCmds.filter((g) => g.op !== "wait").length;
    if (v3)
      scoreV3GoldSlices(s, goldCmds, childrenByParent, detById, new Map(), artboardArea, hasCompositeKey);
    return s;
  }
  if (v3) {
    // Full wave-3 validator (schema + coverage incl. child_spawned_command +
    // semantic incl. child-glyph legality) as the belt-and-braces re-check.
    const ctx = {
      artboard: inputObj.artboard,
      detections: dets,
    } as unknown as ShapeValidationCtx;
    if (validateShapes(doc, ctx, 3).ok) s.zodOk++;
  } else if (shapesOutputSchema.safeParse(doc).success) s.zodOk++;

  const cmds = doc.components as unknown as Record<string, unknown>[];
  s.totalCmds += cmds.length;
  const respByFrom = new Map<string, Record<string, unknown>>();
  for (const c of cmds) {
    const from = c?.from as string | undefined;
    if (v3 && from !== undefined && childIds.has(from)) {
      // Wave-3 failure mode: a command answering a CHILD detection. Counted
      // on its own (not as a hallucination — the id is real ink).
      s.childSpawnedCmds++;
      continue;
    }
    if (!from || !answerableSet.has(from) || respByFrom.has(from)) s.hallucCmds++;
    else respByFrom.set(from, c);
  }
  for (const id of answerableIds) if (!respByFrom.has(id)) s.missedDets++;
  if (v3) {
    s.containmentRowsTotal++;
    if (s.childSpawnedCmds === 0) s.containmentRespectedRows++;
  }

  for (const g of goldCmds) {
    const from = g.from as string;
    const r = respByFrom.get(from);
    const rIsWait = r?.op === "wait";
    if (g.op === "wait") {
      if (rIsWait) s.waitTP++;
      else s.waitFN++;
      continue;
    }
    if (rIsWait) s.waitFP++;
    s.opTotal++;
    if (r && !rIsWait) {
      if (r.op === g.op) s.opHits++;

      // Snap accuracy: exact match vs gold, absent counted as "none".
      s.snapTotal++;
      if (((r.snap as string | undefined) ?? "none") === ((g.snap as string | undefined) ?? "none")) {
        s.snapHits++;
      }

      // Params accuracy (loose): every fill/gradient/text key present in
      // the gold params is one slot; hit iff the response matches loosely.
      const gp = (g.params ?? {}) as Record<string, unknown>;
      const rp = (r.params ?? {}) as Record<string, unknown>;
      if ("fill" in gp) {
        s.paramTotal++;
        if (looseStr(rp.fill, gp.fill)) s.paramHits++;
      }
      if ("text" in gp) {
        s.paramTotal++;
        if (looseStr(rp.text, gp.text)) s.paramHits++;
      }
      if ("gradient" in gp) {
        s.paramTotal++;
        if (looseGradient(rp.gradient, gp.gradient)) s.paramHits++;
      }
    }
  }
  if (v3)
    scoreV3GoldSlices(s, goldCmds, childrenByParent, detById, respByFrom, artboardArea, hasCompositeKey);
  return s;
}

/**
 * Wave-3 + wave-3.1 slice scoring over the GOLD commands (runs whether or not
 * the builder call succeeded — a missing/wait response scores the slot 0):
 *
 * - DETAIL-ROUTING ACCURACY: for each gold non-wait command, each of its
 *   label/fill/gradient params whose value is attributable to a CHILD of the
 *   source detection is one slot (label: some child's `text` loosely equals
 *   it; fill: some child's `colors` loosely contains it; gradient: some
 *   child's `colors` loosely covers all its colors). Hit iff the model's
 *   matching command carries the same value under the loose compare.
 * - NIGHT_SKY-FROM-RECT: gold night_sky where the source detection kind is
 *   "rect"; hit iff the model's matching command op is night_sky.
 *
 * Wave-3.1 slices (harmless zeros when a dataset has no such cases):
 *
 * - STYLE-WORD ROUTING ACCURACY: one slot per gold non-wait command whose
 *   params carry fill/gradient styling AND whose source detection's written
 *   text (own `text` or a child's) contains a DESCRIPTOR word from the local
 *   list (mirrors baselineShapes "STYLE DESCRIPTORS"); tokens gold kept in
 *   its own label are excluded ("Ocean Tours" is a label, not a descriptor
 *   case). Hit iff the model's command carries the same styling — loose,
 *   per key exactly like params accuracy (fill: looseStr; gradient:
 *   looseGradient; colors: looseColorList) — AND emitted NO descriptor word
 *   in params.label. styleDescriptorLabeled separately counts slots where a
 *   descriptor word DID land in the model's label. Non-descriptor label
 *   slots are already covered by detail-routing.
 * - COMPOSITE→OP ACCURACY: one slot per gold non-wait command whose source
 *   detection carries composite: X and whose gold op is X (the trained
 *   mapping; hint-wrong rows where gold disagrees with the hint are
 *   excluded so following a bad hint is never rewarded). Hit iff the
 *   model's command op === X.
 * - COMPOSITE-ABSTENTION ACCURACY (armed only when the row's detections
 *   carry the `composite` key — the v3.1 input signature): one slot per
 *   gold WAIT command whose source detection is a composite-less big
 *   scribble (kind "scribble", composite null, bbox area ≥
 *   BIG_SCRIBBLE_AREA_FRACTION of the artboard). Hit iff the model also
 *   waited — never a guessed diagram.
 */
function scoreV3GoldSlices(
  s: ShapesRowStats,
  goldCmds: ReadonlyArray<Record<string, unknown>>,
  childrenByParent: ReadonlyMap<string, RowDet[]>,
  detById: ReadonlyMap<string, RowDet>,
  respByFrom: ReadonlyMap<string, Record<string, unknown>>,
  artboardArea: number,
  hasCompositeKey: boolean
): void {
  const childColors = (c: RowDet): unknown[] => (Array.isArray(c.colors) ? c.colors : []);
  for (const g of goldCmds) {
    const from = g.from as string;
    const det = detById.get(from);
    const r = respByFrom.get(from);
    const rIsWait = r?.op === "wait";

    if (g.op === "wait") {
      // Wave-3.1 composite-abstention slice: composite-less big scribble.
      if (
        hasCompositeKey &&
        det?.kind === "scribble" &&
        (det.composite ?? null) === null &&
        det.bbox &&
        det.bbox.width * det.bbox.height >= BIG_SCRIBBLE_AREA_FRACTION * artboardArea
      ) {
        s.compositeAbstainTotal++;
        if (rIsWait) s.compositeAbstainHits++;
      }
      continue;
    }
    const rp = (r && !rIsWait ? ((r.params ?? {}) as Record<string, unknown>) : {}) as Record<string, unknown>;
    const gp = (g.params ?? {}) as Record<string, unknown>;
    const children = childrenByParent.get(from) ?? [];

    if (g.op === "night_sky" && det?.kind === "rect") {
      s.nightSkyRectTotal++;
      if (r && !rIsWait && r.op === "night_sky") s.nightSkyRectHits++;
    }

    // Wave-3.1 composite→op slice: gold op equals the detection's hint.
    if (typeof det?.composite === "string" && g.op === det.composite) {
      s.compositeOpTotal++;
      if (r && !rIsWait && r.op === det.composite) s.compositeOpHits++;
    }

    // Wave-3.1 style-word routing slice: descriptor word + gold styling.
    if ("fill" in gp || "gradient" in gp) {
      const goldLabelTokens = new Set(typeof gp.label === "string" ? wordTokens(gp.label) : []);
      const descTokens = new Set<string>();
      const texts: string[] = [];
      if (typeof det?.text === "string") texts.push(det.text);
      for (const c of children) if (typeof c.text === "string") texts.push(c.text);
      for (const t of texts)
        for (const w of wordTokens(t))
          if (DESCRIPTOR_WORDS.has(w) && !goldLabelTokens.has(w)) descTokens.add(w);
      if (descTokens.size > 0) {
        s.styleRouteTotal++;
        const labelHasDescriptor =
          typeof rp.label === "string" && wordTokens(rp.label).some((w) => descTokens.has(w));
        if (labelHasDescriptor) s.styleDescriptorLabeled++;
        const stylingOk =
          (!("fill" in gp) || looseStr(rp.fill, gp.fill)) &&
          (!("gradient" in gp) || looseGradient(rp.gradient, gp.gradient)) &&
          (!("colors" in gp) || looseColorList(rp.colors, gp.colors));
        if (r && !rIsWait && stylingOk && !labelHasDescriptor) s.styleRouteHits++;
      }
    }

    if (
      typeof gp.label === "string" &&
      children.some((c) => typeof c.text === "string" && looseStr(c.text, gp.label))
    ) {
      s.detailTotal++;
      if (looseStr(rp.label, gp.label)) s.detailHits++;
    }
    if (
      typeof gp.fill === "string" &&
      children.some((c) => childColors(c).some((col) => looseStr(col, gp.fill)))
    ) {
      s.detailTotal++;
      if (looseStr(rp.fill, gp.fill)) s.detailHits++;
    }
    const gg = gp.gradient as { colors?: unknown } | null | undefined;
    if (
      gg && typeof gg === "object" && Array.isArray(gg.colors) && gg.colors.length > 0 &&
      children.some((c) => (gg.colors as unknown[]).every((gc) => childColors(c).some((cc) => looseStr(cc, gc))))
    ) {
      s.detailTotal++;
      if (looseGradient(rp.gradient, gp.gradient)) s.detailHits++;
    }
  }
}

async function runShapesEval(
  client: ShapeBuilderClient,
  rows: DatasetRow[],
  meta: EvalMeta,
  v3 = false
): Promise<void> {
  // No bbox IoU: the shapes contract carries no coordinates — geometry is a
  // pure function of ink, so only op/snap/params/wait choices are scored.
  const perRow = await promisePool(rows, meta.concurrency, (row, i) =>
    scoreShapesRow(client, row, i, v3)
  );

  // Aggregate in row order from the per-row records.
  const t = emptyShapesStats();
  const latencies: number[] = [];
  for (const s of perRow) {
    t.builderOk += s.builderOk; t.builderErrors += s.builderErrors; t.zodOk += s.zodOk;
    t.opHits += s.opHits; t.opTotal += s.opTotal;
    t.snapHits += s.snapHits; t.snapTotal += s.snapTotal;
    t.paramHits += s.paramHits; t.paramTotal += s.paramTotal;
    t.hallucCmds += s.hallucCmds; t.totalCmds += s.totalCmds;
    t.missedDets += s.missedDets; t.totalDets += s.totalDets;
    t.waitTP += s.waitTP; t.waitFP += s.waitFP; t.waitFN += s.waitFN;
    t.childSpawnedCmds += s.childSpawnedCmds;
    t.containmentRowsTotal += s.containmentRowsTotal;
    t.containmentRespectedRows += s.containmentRespectedRows;
    t.detailHits += s.detailHits; t.detailTotal += s.detailTotal;
    t.nightSkyRectHits += s.nightSkyRectHits; t.nightSkyRectTotal += s.nightSkyRectTotal;
    t.styleRouteHits += s.styleRouteHits; t.styleRouteTotal += s.styleRouteTotal;
    t.styleDescriptorLabeled += s.styleDescriptorLabeled;
    t.compositeOpHits += s.compositeOpHits; t.compositeOpTotal += s.compositeOpTotal;
    t.compositeAbstainHits += s.compositeAbstainHits; t.compositeAbstainTotal += s.compositeAbstainTotal;
    if (s.latency !== null) latencies.push(s.latency);
  }

  const n = rows.length;
  const waitP = t.waitTP + t.waitFP > 0 ? t.waitTP / (t.waitTP + t.waitFP) : 0;
  const waitR = t.waitTP + t.waitFN > 0 ? t.waitTP / (t.waitTP + t.waitFN) : 0;
  const waitF1 = waitP + waitR > 0 ? (2 * waitP * waitR) / (waitP + waitR) : 0;
  const sortedLat = [...latencies].sort((a, b) => a - b);

  const table = [
    `| Metric | Value |`,
    `|---|---|`,
    `| Examples (split=${meta.split}) | ${n} |`,
    `| Parse/schema-valid rate (client gate) | ${pct(t.builderOk, n)} |`,
    `| Builder errors (transport/truncation/parse/schema) | ${t.builderErrors} |`,
    v3
      ? `| Wave-3 validator pass rate (schema+coverage+semantic, shapes-v3) | ${pct(t.zodOk, n)} |`
      : `| Schema-valid rate (zod re-check, shapes-v1) | ${pct(t.zodOk, n)} |`,
    `| Per-detection op accuracy | ${pct(t.opHits, t.opTotal)} |`,
    `| Snap accuracy (exact, absent=none) | ${pct(t.snapHits, t.snapTotal)} |`,
    `| Params accuracy (fill/gradient/text, loose) | ${pct(t.paramHits, t.paramTotal)} |`,
    ...(v3
      ? [
          `| Detail-routing accuracy (child-sourced label/fill/gradient, loose, per slot) | ${pct(t.detailHits, t.detailTotal)} |`,
          `| Containment-respected rate (rows with zero child-spawned commands) | ${pct(t.containmentRespectedRows, t.containmentRowsTotal)} |`,
          `| Child-spawned-command rate (commands answering a child detection) | ${pct(t.childSpawnedCmds, t.totalCmds)} |`,
          `| night_sky-from-rect accuracy (gold night_sky where source kind=rect) | ${pct(t.nightSkyRectHits, t.nightSkyRectTotal)} |`,
          `| Style-word routing accuracy (descriptor → fill/gradient params, not label; v3.1) | ${pct(t.styleRouteHits, t.styleRouteTotal)} |`,
          `| Descriptor-wrongly-labeled (descriptor word emitted in label) | ${t.styleDescriptorLabeled} |`,
          `| Composite→op accuracy (gold op = detection composite hint; v3.1) | ${pct(t.compositeOpHits, t.compositeOpTotal)} |`,
          `| Composite-abstention accuracy (composite-less big scribbles → wait; v3.1) | ${pct(t.compositeAbstainHits, t.compositeAbstainTotal)} |`,
        ]
      : []),
    `| Hallucinated-command rate | ${pct(t.hallucCmds, t.totalCmds)} |`,
    `| Missed-detection rate${v3 ? " (top-level detections)" : ""} | ${pct(t.missedDets, t.totalDets)} |`,
    `| Abstention precision / recall / F1 | ${waitP.toFixed(3)} / ${waitR.toFixed(3)} / ${waitF1.toFixed(3)} |`,
    `| Latency p50 / p95 (ms) | ${percentile(sortedLat, 50).toFixed(0)} / ${percentile(sortedLat, 95).toFixed(0)} |`,
  ].join("\n");

  const header = `\n## ${new Date().toISOString()} — contract=${v3 ? "shapes-v3" : "shapes"} model=${meta.modelKind} (${meta.modelId}) split=${meta.split} n=${n} concurrency=${meta.concurrency}\n\n`;
  report(header, table);
}

// ---------------------------------------------------------------------------
// --self-test — offline wave-3 scoring/validator assertions (no network, no
// dataset): mock builders drive scoreShapesRow(v3) and validateShapes(wave 3).
// ---------------------------------------------------------------------------

async function selfTest(): Promise<void> {
  let failures = 0;
  const check = (name: string, cond: boolean, detail = ""): void => {
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? ` — ${detail}` : ""}`);
    if (!cond) failures++;
  };
  const mock = (out: unknown): ShapeBuilderClient => ({
    buildShapes: async () => out as ShapesOutput,
  });

  // Fixture: button box (glyph b) with two children — a word ("Login") and an
  // interior shading scribble (#7c3aed) — plus a top-level night-sky rect.
  const bbox = { x: 100, y: 100, width: 200, height: 80 };
  const input = {
    artboard: { width: 1280, height: 800 },
    detections: [
      { id: "det_1", kind: "rect", glyph: "b", text: null, colors: [], gradient_direction: null, confidence: 0.92, bbox, parent: null },
      { id: "det_2", kind: "text_writing", glyph: null, text: "Login", colors: [], gradient_direction: null, confidence: 0.9, bbox: { x: 140, y: 120, width: 80, height: 30 }, parent: "det_1" },
      { id: "det_3", kind: "scribble", glyph: null, text: null, colors: ["#7c3aed"], gradient_direction: null, confidence: 0.85, bbox: { x: 110, y: 110, width: 170, height: 60 }, parent: "det_1" },
      { id: "det_4", kind: "rect", glyph: null, text: null, colors: ["#0b1026", "#ffffff"], gradient_direction: null, confidence: 0.9, bbox: { x: 0, y: 0, width: 1280, height: 200 }, parent: null },
    ],
  };
  const gold = {
    schema_version: "shapes-1.0",
    components: [
      { op: "button", from: "det_1", params: { label: "Login", fill: "#7c3aed" } },
      { op: "night_sky", from: "det_4", params: { fill: "#0b1026" } },
    ],
  };
  const row: DatasetRow = { input: JSON.stringify(input), output: JSON.stringify(gold) };
  const ctx = { artboard: input.artboard, detections: input.detections } as unknown as ShapeValidationCtx;

  console.log("self-test: wave-3 scoring (scoreShapesRow v3)");

  // A — perfect answer: everything routes, containment respected, 100% slices.
  const a = await scoreShapesRow(mock(gold), row, 0, true);
  check("perfect: builder ok + wave-3 validator pass", a.builderOk === 1 && a.zodOk === 1);
  check("perfect: op accuracy 2/2", a.opHits === 2 && a.opTotal === 2, `${a.opHits}/${a.opTotal}`);
  check("perfect: detail routing 2/2 (label from child word, fill from child shading)", a.detailHits === 2 && a.detailTotal === 2, `${a.detailHits}/${a.detailTotal}`);
  check("perfect: containment respected (zero child-spawned)", a.childSpawnedCmds === 0 && a.containmentRespectedRows === 1 && a.containmentRowsTotal === 1);
  check("perfect: night_sky-from-rect 1/1", a.nightSkyRectHits === 1 && a.nightSkyRectTotal === 1);
  check("perfect: no halluc/missed (top-level only)", a.hallucCmds === 0 && a.missedDets === 0 && a.totalDets === 2);
  check(
    "perfect: v3.1 metrics harmless zeros on a non-3.1 fixture",
    a.styleRouteTotal === 0 && a.styleDescriptorLabeled === 0 &&
      a.compositeOpTotal === 0 && a.compositeAbstainTotal === 0
  );

  // B — model answers a CHILD detection: child_spawned_command.
  const bad = {
    schema_version: "shapes-1.0",
    components: [
      ...gold.components,
      { op: "text", from: "det_2", params: { text: "Login" } },
    ],
  };
  const b = await scoreShapesRow(mock(bad), row, 1, true);
  check("child answer: counted as child-spawned (not hallucination)", b.childSpawnedCmds === 1 && b.hallucCmds === 0);
  check("child answer: containment NOT respected", b.containmentRespectedRows === 0 && b.containmentRowsTotal === 1);
  check("child answer: wave-3 validator rejects", b.zodOk === 0);
  const vb = validateShapes(bad, ctx, 3);
  check(
    "validateShapes wave 3: coverage gate flags child_spawned_command",
    !vb.ok && vb.gate === "coverage" && vb.issues.some((i) => i.code === "child_spawned_command"),
    vb.ok ? "unexpectedly valid" : `gate=${vb.gate} codes=${vb.issues.map((i) => i.code).join(",")}`
  );

  // C — wrong label value: that detail slot scores 0, the fill slot still hits.
  const wrongLabel = {
    schema_version: "shapes-1.0",
    components: [
      { op: "button", from: "det_1", params: { label: "Signup", fill: "#7c3aed" } },
      { op: "night_sky", from: "det_4", params: { fill: "#0b1026" } },
    ],
  };
  const c = await scoreShapesRow(mock(wrongLabel), row, 2, true);
  check("wrong label: detail routing 1/2 (label slot 0, fill slot 1)", c.detailHits === 1 && c.detailTotal === 2, `${c.detailHits}/${c.detailTotal}`);
  check("wrong label: op accuracy unaffected 2/2", c.opHits === 2 && c.opTotal === 2);

  // D — child-glyph legality: parent rect with NO own glyph, child glyph "b"
  // → button is legal for the parent; without the child glyph it is not.
  const glyphCtx = {
    artboard: { width: 1280, height: 800 },
    detections: [
      { id: "det_1", kind: "rect", glyph: null, parent: null },
      { id: "det_2", kind: "text_writing", glyph: "b", parent: "det_1" },
    ],
  } as unknown as ShapeValidationCtx;
  const buttonOut = { schema_version: "shapes-1.0", components: [{ op: "button", from: "det_1" }] };
  const vd = validateShapes(buttonOut, glyphCtx, 3);
  check("child glyph 'b' legalizes parent button", vd.ok, vd.ok ? "" : JSON.stringify((vd as { issues: unknown }).issues));
  const noGlyphCtx = {
    artboard: { width: 1280, height: 800 },
    detections: [{ id: "det_1", kind: "rect", glyph: null, parent: null }],
  } as unknown as ShapeValidationCtx;
  const vn = validateShapes(buttonOut, noGlyphCtx, 3);
  check(
    "no glyph anywhere: button illegal for plain rect (semantic gate)",
    !vn.ok && vn.gate === "semantic" && vn.issues.some((i) => i.code === "op_illegal_for_detection")
  );

  // -------------------------------------------------------------------------
  // Wave-3.1 fixture: detections carry `composite` (the v3.1 input signature).
  // det_1: button box whose written text is the descriptor "rainbow" alone ->
  //        gold styles it (glyph gradient convention) with NO label.
  // det_2: scribble with composite "bar_chart" -> gold op bar_chart.
  // det_3: composite-less BIG scribble (400x260 on 1280x800 ≈ 10% ≥ 2.5%) ->
  //        gold waits; a guessed diagram must score 0.
  // -------------------------------------------------------------------------
  console.log("\nself-test: wave-3.1 scoring (style-word routing + composite)");
  const RAINBOW = ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"];
  const input31 = {
    artboard: { width: 1280, height: 800 },
    detections: [
      { id: "det_1", kind: "rect", glyph: "b", text: "rainbow", colors: [], gradient_direction: null, confidence: 0.9, bbox: { x: 100, y: 100, width: 200, height: 80 }, parent: null, composite: null },
      { id: "det_2", kind: "scribble", glyph: null, text: null, colors: [], gradient_direction: null, confidence: 0.88, bbox: { x: 500, y: 250, width: 360, height: 240 }, parent: null, composite: "bar_chart" },
      { id: "det_3", kind: "scribble", glyph: null, text: null, colors: [], gradient_direction: null, confidence: 0.85, bbox: { x: 150, y: 480, width: 400, height: 260 }, parent: null, composite: null },
    ],
  };
  const gold31 = {
    schema_version: "shapes-1.0",
    components: [
      { op: "button", from: "det_1", params: { fill: "gradient", colors: RAINBOW } },
      { op: "bar_chart", from: "det_2" },
      { op: "wait", from: "det_3", reason: "ambiguous" },
    ],
  };
  const row31: DatasetRow = { input: JSON.stringify(input31), output: JSON.stringify(gold31) };

  // E — perfect answer: descriptor routed to gradient params, composite hint
  // followed, composite-less big scribble waited.
  const e = await scoreShapesRow(mock(gold31), row31, 4, true);
  check("descriptor routed to gradient (no label): style-word routing 1/1", e.styleRouteHits === 1 && e.styleRouteTotal === 1, `${e.styleRouteHits}/${e.styleRouteTotal}`);
  check("descriptor routed: none wrongly labeled", e.styleDescriptorLabeled === 0);
  check("composite bar_chart -> bar_chart: composite→op 1/1", e.compositeOpHits === 1 && e.compositeOpTotal === 1, `${e.compositeOpHits}/${e.compositeOpTotal}`);
  check("composite-less big scribble waited: composite-abstention 1/1", e.compositeAbstainHits === 1 && e.compositeAbstainTotal === 1, `${e.compositeAbstainHits}/${e.compositeAbstainTotal}`);
  check("v3.1 fixture: existing metrics intact (op 2/2, waitTP 1, containment ok)", e.opHits === 2 && e.opTotal === 2 && e.waitTP === 1 && e.childSpawnedCmds === 0);

  // F — misroutes: descriptor word emitted as the LABEL (no styling), and the
  // composite-less scribble answered with a guessed diagram instead of wait.
  const bad31 = {
    schema_version: "shapes-1.0",
    components: [
      { op: "button", from: "det_1", params: { label: "Rainbow" } },
      { op: "bar_chart", from: "det_2" },
      { op: "bar_chart", from: "det_3" },
    ],
  };
  const f = await scoreShapesRow(mock(bad31), row31, 5, true);
  check("descriptor put in label: style-word routing 0/1", f.styleRouteHits === 0 && f.styleRouteTotal === 1, `${f.styleRouteHits}/${f.styleRouteTotal}`);
  check("descriptor put in label: descriptor-wrongly-labeled counted (1)", f.styleDescriptorLabeled === 1, String(f.styleDescriptorLabeled));
  check("composite hint still followed: composite→op 1/1", f.compositeOpHits === 1 && f.compositeOpTotal === 1);
  check("guessed diagram on composite-less scribble: composite-abstention 0/1", f.compositeAbstainHits === 0 && f.compositeAbstainTotal === 1, `${f.compositeAbstainHits}/${f.compositeAbstainTotal}`);

  console.log(failures === 0 ? "\nself-test: ALL PASS" : `\nself-test: ${failures} FAILURE(S)`);
  if (failures > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
/** True when every input detection of the first row carries a `parent` key —
 * the shapes-v3 dataset signature (parent is REQUIRED-nullable in v3). */
function rowsAreV3(rows: DatasetRow[]): boolean {
  const first = rows[0];
  if (!first) return false;
  const input = asObj(first.input);
  const dets = input?.detections;
  return (
    Array.isArray(dets) &&
    dets.length > 0 &&
    dets.every((d) => d !== null && typeof d === "object" && "parent" in (d as object))
  );
}

async function main(): Promise<void> {
  loadDotEnv();
  if (process.argv.includes("--self-test")) {
    await selfTest();
    return;
  }
  const contract = arg("contract", "shapes");
  const modelKind = arg("model", "baseline");
  const split = arg("split", "eval");
  const maxN = Number(arg("n", "0")) || Infinity;
  const concurrency = Math.max(1, Math.floor(Number(arg("concurrency", "1")) || 1));
  if (contract !== "shapes" && contract !== "shapes-v3" && contract !== "legacy")
    throw new Error("--contract must be shapes|shapes-v3|legacy");
  if (modelKind !== "baseline" && modelKind !== "freesolo") throw new Error("--model must be baseline|freesolo");
  if (split !== "eval" && split !== "test") throw new Error("--split must be eval|test");

  const defaultDataset =
    contract === "shapes-v3"
      ? path.join(ROOT, "freesolo", "dataset", "shapes-v3", `${split}.jsonl`)
      : contract === "shapes"
        ? path.join(ROOT, "freesolo", "dataset", "shapes", `${split}.jsonl`)
        : path.join(ROOT, "freesolo", "dataset", `${split}.jsonl`);
  const datasetPath = arg("dataset") ? path.resolve(arg("dataset")!) : defaultDataset;
  if (!existsSync(datasetPath)) {
    console.log(`No dataset at ${datasetPath} — generate the ${contract} dataset first (see freesolo/TRAINING.md), then re-run.`);
    return; // clean exit 0
  }

  const modelId =
    modelKind === "baseline"
      ? process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite"
      : process.env.FREESOLO_MODEL ?? "<FREESOLO_MODEL unset>";
  const rows = readRows(datasetPath, maxN);
  const meta: EvalMeta = { modelKind, modelId, split, concurrency };

  if (contract === "legacy") {
    const client: BuilderClient =
      modelKind === "baseline" ? new BaselineBuilder() : new FreesoloBuilder("legacy");
    await runLegacyEval(client, rows, meta);
  } else {
    // shapes-v3 by flag, or by auto-detection (every input detection carries
    // `parent` — the v3 dataset signature). The FreeSolo client serializes
    // whatever input object it's given, so v3 inputs flow through unchanged;
    // the baseline routes to the v3 (containment-prompted) class.
    const v3 = contract === "shapes-v3" || rowsAreV3(rows);
    if (v3 && contract === "shapes") {
      console.log("Detected shapes-v3 dataset (detections carry `parent`) — using wave-3 scoring.");
    }
    const client: ShapeBuilderClient =
      modelKind === "baseline"
        ? v3
          ? new BaselineShapesV3Builder()
          : new BaselineShapesBuilder()
        : new FreesoloBuilder("shapes");
    await runShapesEval(client, rows, meta, v3);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
