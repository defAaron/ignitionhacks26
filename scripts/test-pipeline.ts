/**
 * Pipeline smoke test — run with: npx tsx scripts/test-pipeline.ts [--live all|legacy|shapes|none]
 *
 * 1. OFFLINE (no network): the legacy three-gate validator AND the shapes
 *    validator (schema -> coverage -> semantic) against hand-written valid
 *    outputs and deliberately-broken outputs — each must fail the right gate.
 *    Non-zero exit if any offline assertion fails.
 * 2. LIVE (needs GEMINI_API_KEY): synthetic BuilderInput with 3 detections ->
 *    baseline builder -> validate() -> print commands + gate results; a
 *    shapes-mode smoke (3 shape detections incl. a glyph box and a gradient
 *    rect -> baseline shapes builder -> validateShapes); and the vision client
 *    with a procedurally rasterized ink PNG (navbar + button + image sketch)
 *    — the vision half is reported but never fails the run.
 *    --live selects which live halves run (default all); --live none skips
 *    the network even when a key is present.
 *
 * Loads .env manually (no dotenv dependency). If GEMINI_API_KEY is missing,
 * the live half prints a skip message and the script exits 0.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

import { validate, validateShapes, type ShapeValidationCtx, type ValidationCtx } from "../lib/validate";
import { BaselineBuilder } from "../lib/models/baseline";
import { BaselineShapesBuilder } from "../lib/models/baselineShapes";
import type { BuilderInput, ShapeBuilderInput } from "../lib/models/types";
import { analyzeInk, type StrokeManifestEntry } from "../lib/vision/client";

// ---------------------------------------------------------------------------
// .env loader (manual parse, no dotenv)
// ---------------------------------------------------------------------------

function loadDotEnv(): void {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Offline gate tests
// ---------------------------------------------------------------------------

let failures = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function runOfflineGateTests(): void {
  console.log("== Offline gate tests (no network) ==");

  const ctx: ValidationCtx = {
    canvas: { width: 1440, height: 900 },
    detections: [{ id: "det_1" }, { id: "det_2" }, { id: "det_3" }],
    existingTree: [],
  };

  const validOutput = {
    schema_version: "1.0",
    components: [
      { op: "button", id: "c1", from: "det_1", layer: "content", x: 610, y: 396, width: 205, height: 56, label: "Login" },
      { op: "navbar", id: "c2", from: "det_2", layer: "content", x: 0, y: 0, width: 1440, height: 64 },
      { op: "wave_divider", id: "c3", from: "det_3", layer: "background", x: 0, y: 520, width: 1440, height: 110, params: { amplitude: 24, layers: 2, seed: 7 } },
    ],
  };

  const r0 = validate(validOutput, ctx, 1);
  check(
    "valid output clears all three gates",
    r0.ok,
    r0.ok ? undefined : `${r0.gate}: ${r0.issues.map((i) => i.code).join(", ")}`
  );

  // Broken 1 — bad op (v2-only op under the wave-1 contract) -> schema gate.
  const badOp = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  badOp.components[0].op = "carousel";
  const r1 = validate(badOp, ctx, 1);
  check(
    'bad op ("carousel" in wave 1) fails the SCHEMA gate',
    !r1.ok && r1.gate === "schema",
    r1.ok ? "unexpectedly valid" : `failed gate "${r1.gate}"`
  );

  // Broken 2 — `from` referencing a nonexistent detection -> geometric gate.
  const badFrom = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  badFrom.components[0].from = "det_9";
  const r2 = validate(badFrom, ctx, 1);
  check(
    'missing from (references "det_9") fails the GEOMETRIC gate',
    !r2.ok && r2.gate === "geometric" && r2.issues.some((i) => i.code === "unknown_from"),
    r2.ok ? "unexpectedly valid" : `failed gate "${r2.gate}" (${r2.issues.map((i) => i.code).join(", ")})`
  );

  // Broken 3 — out-of-bounds bbox -> geometric gate.
  const oob = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  oob.components[0].x = 1400; // 1400 + 205 = 1605 > 1440 + tolerance
  const r3 = validate(oob, ctx, 1);
  check(
    "out-of-bounds bbox fails the GEOMETRIC gate",
    !r3.ok && r3.gate === "geometric" && r3.issues.some((i) => i.code === "out_of_bounds"),
    r3.ok ? "unexpectedly valid" : `failed gate "${r3.gate}" (${r3.issues.map((i) => i.code).join(", ")})`
  );

  // Broken 4 — schema/geometry fine, but button height 150 -> domain gate.
  const badDomain = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  badDomain.components[0].height = 150;
  const r4 = validate(badDomain, ctx, 1);
  check(
    "button height 150 fails the DOMAIN gate",
    !r4.ok && r4.gate === "domain" && r4.issues.some((i) => i.code === "button_height"),
    r4.ok ? "unexpectedly valid" : `failed gate "${r4.gate}" (${r4.issues.map((i) => i.code).join(", ")})`
  );
}

// ---------------------------------------------------------------------------
// Offline shapes-gate tests (shapes-first pivot; no network)
// ---------------------------------------------------------------------------

function runOfflineShapesGateTests(): void {
  console.log("\n== Offline shapes gate tests (no network) ==");

  const ctx: ShapeValidationCtx = {
    artboard: { width: 1440, height: 900 },
    detections: [
      { id: "det_1", kind: "rect", glyph: "i" }, // glyph box -> image/placeholder/wait only
      { id: "det_2", kind: "rect", glyph: null }, // plain (gradient) rect
      { id: "det_3", kind: "line", glyph: null },
    ],
  };

  const validOutput = {
    schema_version: "shapes-1.0",
    components: [
      { op: "image", from: "det_1" },
      {
        op: "rect",
        from: "det_2",
        params: { gradient: { colors: ["#ff6b6b", "#4ecdc4"], direction: "down" } },
        snap: "square",
      },
      { op: "line", from: "det_3", snap: "straighten_h" },
    ],
  };

  const r0 = validateShapes(validOutput, ctx);
  check(
    "valid shapes output clears schema, coverage, and semantic gates",
    r0.ok,
    r0.ok ? undefined : `${r0.gate}: ${r0.issues.map((i) => i.code).join(", ")}`
  );

  // Broken 1 — op outside the shapes-v1 enum -> schema gate.
  const badOp = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  badOp.components[1].op = "blob"; // removed op (smooth_path + gradient covers it)
  const r1 = validateShapes(badOp, ctx);
  check(
    'bad op ("blob", removed from shapes-v1) fails the SCHEMA gate',
    !r1.ok && r1.gate === "schema",
    r1.ok ? "unexpectedly valid" : `failed gate "${r1.gate}"`
  );

  // Broken 2 — wrong op for the glyph: box+i may only become image/placeholder/wait.
  const wrongGlyphOp = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  wrongGlyphOp.components[0].op = "button";
  const r2 = validateShapes(wrongGlyphOp, ctx);
  check(
    'wrong op for glyph (box+i answered as "button") fails the SEMANTIC gate',
    !r2.ok && r2.gate === "semantic" && r2.issues.some((i) => i.code === "op_illegal_for_detection"),
    r2.ok ? "unexpectedly valid" : `failed gate "${r2.gate}" (${r2.issues.map((i) => i.code).join(", ")})`
  );

  // Broken 3 — duplicate `from` (det_1 answered twice, det_3 unanswered) -> coverage gate.
  const dupFrom = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  dupFrom.components[2] = { op: "placeholder", from: "det_1" };
  const r3 = validateShapes(dupFrom, ctx);
  check(
    "duplicate from (det_1 answered twice) fails the COVERAGE gate",
    !r3.ok &&
      r3.gate === "coverage" &&
      r3.issues.some((i) => i.code === "duplicate_from") &&
      r3.issues.some((i) => i.code === "missed_detection"),
    r3.ok ? "unexpectedly valid" : `failed gate "${r3.gate}" (${r3.issues.map((i) => i.code).join(", ")})`
  );

  // Broken 4 — hallucinated `from` -> coverage gate.
  const badFrom = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  badFrom.components[0].from = "det_9";
  const r4 = validateShapes(badFrom, ctx);
  check(
    'unknown from (references "det_9") fails the COVERAGE gate',
    !r4.ok && r4.gate === "coverage" && r4.issues.some((i) => i.code === "unknown_from"),
    r4.ok ? "unexpectedly valid" : `failed gate "${r4.gate}" (${r4.issues.map((i) => i.code).join(", ")})`
  );

  // Broken 5 — snap policy insane for the op (a line cannot be squared) -> semantic gate.
  const badSnap = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  badSnap.components[2].snap = "square";
  const r5 = validateShapes(badSnap, ctx);
  check(
    'bad snap ("square" on a line) fails the SEMANTIC gate',
    !r5.ok && r5.gate === "semantic" && r5.issues.some((i) => i.code === "bad_snap_for_op"),
    r5.ok ? "unexpectedly valid" : `failed gate "${r5.gate}" (${r5.issues.map((i) => i.code).join(", ")})`
  );

  // Broken 6 — params type violation (fill must be a CSS string) -> semantic gate.
  const badParam = structuredClone(validOutput) as { components: Array<Record<string, unknown>> };
  badParam.components[1].params = { fill: 42 };
  const r6 = validateShapes(badParam, ctx);
  check(
    "bad param type (numeric fill) fails the SEMANTIC gate",
    !r6.ok && r6.gate === "semantic" && r6.issues.some((i) => i.code === "bad_param_type"),
    r6.ok ? "unexpectedly valid" : `failed gate "${r6.gate}" (${r6.issues.map((i) => i.code).join(", ")})`
  );
}

// ---------------------------------------------------------------------------
// Minimal PNG rasterizer (RGB, no deps — node:zlib does the compression)
// ---------------------------------------------------------------------------

type Point = [number, number];

class Raster {
  readonly data: Uint8Array;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8Array(width * height * 3).fill(255);
  }
  set(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.data[i] = 0;
    this.data[i + 1] = 0;
    this.data[i + 2] = 0;
  }
  line(x0: number, y0: number, x1: number, y1: number): void {
    // Bresenham with a 2px brush.
    let [cx, cy] = [Math.round(x0), Math.round(y0)];
    const [ex, ey] = [Math.round(x1), Math.round(y1)];
    const dx = Math.abs(ex - cx), sx = cx < ex ? 1 : -1;
    const dy = -Math.abs(ey - cy), sy = cy < ey ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let ox = 0; ox < 2; ox++) for (let oy = 0; oy < 2; oy++) this.set(cx + ox, cy + oy);
      if (cx === ex && cy === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; cx += sx; }
      if (e2 <= dx) { err += dx; cy += sy; }
    }
  }
  polyline(points: Point[]): void {
    for (let i = 0; i + 1 < points.length; i++) {
      this.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
    }
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(raster: Raster): Buffer {
  const { width, height, data } = raster;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  // 10..12: compression, filter, interlace = 0
  const scanlines = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    scanlines[rowStart] = 0; // filter: none
    Buffer.from(data.buffer, y * width * 3, width * 3).copy(scanlines, rowStart + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
}

function strokeManifestEntry(id: string, points: Point[]): StrokeManifestEntry {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  let length = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    length += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return {
    id,
    bbox: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
    point_count: Math.max(8, Math.round(length / 3)),
  };
}

// ---------------------------------------------------------------------------
// Live tests
// ---------------------------------------------------------------------------

async function runLiveBuilderTest(): Promise<void> {
  console.log("\n== Live baseline-builder test (Gemini) ==");

  const input: BuilderInput = {
    artboard: { width: 1440, height: 900 },
    tree_summary: [],
    detections: [
      {
        id: "det_1",
        type: "button",
        confidence: 0.86,
        alternates: [{ type: "card", confidence: 0.09 }],
        label_text: "Login",
        bbox: { x: 610, y: 395, width: 205, height: 60 },
      },
      {
        id: "det_2",
        type: "navbar",
        confidence: 0.91,
        label_text: null,
        bbox: { x: 12, y: 6, width: 1408, height: 70 },
      },
      {
        id: "det_3",
        type: "wave_divider",
        confidence: 0.78,
        label_text: null,
        bbox: { x: 4, y: 540, width: 1420, height: 96 },
      },
    ],
  };

  const builder = new BaselineBuilder();
  const output = await builder.buildComponents(input);
  console.log("Builder commands:");
  console.log(JSON.stringify(output, null, 2));

  const ctx: ValidationCtx = {
    canvas: input.artboard,
    detections: input.detections,
    existingTree: input.tree_summary,
  };
  const result = validate(output, ctx, 1);
  if (result.ok) {
    console.log("validate(): OK — cleared schema, geometric, and domain gates");
  } else {
    console.log(`validate(): REJECTED at the ${result.gate} gate:`);
    for (const issue of result.issues) console.log(`  - [${issue.code}] ${issue.message}`);
  }
  check("live builder output is schema-gate valid (typed ComponentsOutputV1)", true);
  check("live builder output clears validate()", result.ok, result.ok ? undefined : `rejected at ${result.gate}`);
}

async function runLiveShapesBuilderTest(): Promise<void> {
  console.log("\n== Live baseline SHAPES-builder test (Gemini, shapes-v1) ==");

  const input: ShapeBuilderInput = {
    artboard: { width: 1440, height: 900 },
    detections: [
      {
        // Glyph box: rect + "b" + the word "Login" -> button with params.label.
        id: "det_1",
        kind: "rect",
        glyph: "b",
        text: "Login",
        colors: ["#1a1a2e"],
        gradient_direction: null,
        confidence: 0.91,
        bbox: { x: 610, y: 400, width: 200, height: 56 },
        parent: null,
      },
      {
        // Gradient rect: two ink colors shading downward -> params.gradient.
        id: "det_2",
        kind: "rect",
        glyph: null,
        text: null,
        colors: ["#ff6b6b", "#4ecdc4"],
        gradient_direction: "down",
        confidence: 0.84,
        bbox: { x: 120, y: 150, width: 400, height: 260 },
        parent: null,
      },
      {
        // Near-horizontal line -> line + straighten_h.
        id: "det_3",
        kind: "line",
        glyph: null,
        text: null,
        colors: [],
        gradient_direction: null,
        confidence: 0.77,
        bbox: { x: 100, y: 520, width: 640, height: 12 },
        parent: null,
      },
    ],
  };

  const builder = new BaselineShapesBuilder();
  const output = await builder.buildShapes(input);
  console.log("Shapes builder commands:");
  console.log(JSON.stringify(output, null, 2));

  const ctx: ShapeValidationCtx = {
    artboard: input.artboard,
    detections: input.detections,
  };
  const result = validateShapes(output, ctx);
  if (result.ok) {
    console.log("validateShapes(): OK — cleared schema, coverage, and semantic gates");
  } else {
    console.log(`validateShapes(): REJECTED at the ${result.gate} gate:`);
    for (const issue of result.issues) console.log(`  - [${issue.code}] ${issue.message}`);
  }
  check("live shapes output is schema-gate valid (typed ShapesOutput)", true);
  check("live shapes output clears validateShapes()", result.ok, result.ok ? undefined : `rejected at ${result.gate}`);
}

async function runLiveVisionTest(): Promise<void> {
  console.log("\n== Live vision test (Gemini, synthetic ink PNG) ==");

  const raster = new Raster(1024, 768);
  const strokes: Array<{ id: string; points: Point[] }> = [
    // navbar: thin full-width bar at top, logo box left, link stubs right
    { id: "s1", points: rect(60, 20, 964, 80) },
    { id: "s2", points: rect(76, 32, 136, 68) },
    { id: "s3", points: [[800, 50], [840, 50]] },
    { id: "s4", points: [[856, 50], [896, 50]] },
    { id: "s5", points: [[912, 50], [952, 50]] },
    // button: small rect with a centered word-scribble
    { id: "s6", points: rect(140, 240, 340, 300) },
    { id: "s7", points: [[180, 272], [200, 266], [220, 274], [240, 266], [260, 274], [280, 266], [300, 272]] },
    // image: rectangle with corner-to-corner X
    { id: "s8", points: rect(560, 220, 860, 440) },
    { id: "s9", points: [[560, 220], [860, 440]] },
    { id: "s10", points: [[860, 220], [560, 440]] },
  ];
  for (const s of strokes) raster.polyline(s.points);

  const png = encodePng(raster);
  if (process.env.DEBUG_PNG_PATH) {
    fs.writeFileSync(process.env.DEBUG_PNG_PATH, png);
    console.log(`(debug PNG written to ${process.env.DEBUG_PNG_PATH})`);
  }

  const detections = await analyzeInk({
    pngBase64: png.toString("base64"),
    strokeManifest: strokes.map((s) => strokeManifestEntry(s.id, s.points)),
    canvas: { width: 1024, height: 768 },
  });
  console.log("Vision detections:");
  console.log(JSON.stringify(detections, null, 2));
}

// ---------------------------------------------------------------------------

/** --live all|legacy|shapes|none — which live (network) halves to run. */
function liveMode(): "all" | "legacy" | "shapes" | "none" {
  const i = process.argv.indexOf("--live");
  const v = i >= 0 ? process.argv[i + 1] : "all";
  if (v === "legacy" || v === "shapes" || v === "none" || v === "all") return v;
  console.warn(`Unknown --live "${v}", using "all"`);
  return "all";
}

async function main(): Promise<void> {
  loadDotEnv();
  runOfflineGateTests();
  runOfflineShapesGateTests();

  const live = liveMode();
  if (live === "none") {
    console.log("\n--live none — skipping live Gemini tests.");
    process.exit(failures > 0 ? 1 : 0);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.log("\nGEMINI_API_KEY not set — skipping live Gemini tests.");
    process.exit(failures > 0 ? 1 : 0);
  }

  if (live === "all" || live === "legacy") {
    try {
      await runLiveBuilderTest();
    } catch (e) {
      failures++;
      console.error("Live builder test threw:", e);
    }
  }

  if (live === "all" || live === "shapes") {
    try {
      await runLiveShapesBuilderTest();
    } catch (e) {
      failures++;
      console.error("Live shapes builder test threw:", e);
    }
  }

  // Informative only — vision quality is bake-off territory, not a gate.
  if (live === "all" || live === "legacy") {
    try {
      await runLiveVisionTest();
    } catch (e) {
      console.error("Live vision test threw (informative, not counted as failure):", e);
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
