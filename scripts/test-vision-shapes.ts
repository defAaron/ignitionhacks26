/**
 * Live smoke test for the shapes-first vision layer — run with:
 *   npx tsx scripts/test-vision-shapes.ts
 *
 * Builds 3 synthetic ink PNGs (same dependency-free rasterizer + PNG encoder
 * technique as scripts/test-pipeline.ts, extended with per-stroke color):
 *
 *   (a) a wobbly rectangle drawn in red strokes
 *       -> expect kind=rect, colors≈red, glyph=null
 *   (b) a box with a lone "i" inside
 *       -> expect box rect (glyph=null) + text_writing cluster with glyph="i"
 *   (c) a freeform closed doodle in two colors
 *       -> expect kind=smooth_path, both colors reported
 *
 * Runs analyzeInkShapes live against Gemini (needs GEMINI_API_KEY in .env —
 * parsed manually, no dotenv) and prints the validated detections. Free-tier
 * rate limit is 15 req/min, so a 5s delay separates the calls.
 *
 * Set DEBUG_PNG_DIR to also write the three PNGs there for eyeballing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

import { analyzeInkShapes, type StrokeManifestEntry } from "../lib/vision/client";

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
// Minimal PNG rasterizer (RGB, no deps — node:zlib does the compression).
// Same approach as scripts/test-pipeline.ts, plus per-stroke color.
// ---------------------------------------------------------------------------

type Point = [number, number];
type RGB = [number, number, number];

const BLACK: RGB = [0, 0, 0];

class Raster {
  readonly data: Uint8Array;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8Array(width * height * 3).fill(255);
  }
  set(x: number, y: number, [r, g, b]: RGB): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
  }
  line(x0: number, y0: number, x1: number, y1: number, color: RGB): void {
    // Bresenham with a 2px brush.
    let [cx, cy] = [Math.round(x0), Math.round(y0)];
    const [ex, ey] = [Math.round(x1), Math.round(y1)];
    const dx = Math.abs(ex - cx), sx = cx < ex ? 1 : -1;
    const dy = -Math.abs(ey - cy), sy = cy < ey ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let ox = 0; ox < 2; ox++) for (let oy = 0; oy < 2; oy++) this.set(cx + ox, cy + oy, color);
      if (cx === ex && cy === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; cx += sx; }
      if (e2 <= dx) { err += dx; cy += sy; }
    }
  }
  polyline(points: Point[], color: RGB): void {
    for (let i = 0; i + 1 < points.length; i++) {
      this.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], color);
    }
  }
  disc(cx: number, cy: number, radius: number, color: RGB): void {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) this.set(Math.round(cx + x), Math.round(cy + y), color);
      }
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

// ---------------------------------------------------------------------------
// Stroke helpers
// ---------------------------------------------------------------------------

interface TestStroke {
  id: string;
  points: Point[];
  color: RGB;
  /** Extra dot marks drawn as filled discs (for the "i" tittle). */
  discs?: Array<{ x: number; y: number; r: number }>;
}

function strokeManifestEntry(s: TestStroke): StrokeManifestEntry {
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  for (const d of s.discs ?? []) {
    xs.push(d.x - d.r, d.x + d.r);
    ys.push(d.y - d.r, d.y + d.r);
  }
  let length = 0;
  for (let i = 0; i + 1 < s.points.length; i++) {
    length += Math.hypot(s.points[i + 1][0] - s.points[i][0], s.points[i + 1][1] - s.points[i][1]);
  }
  return {
    id: s.id,
    bbox: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
    point_count: Math.max(8, Math.round(length / 3)),
  };
}

/** A hand-drawn-looking edge: straight segment + sinusoidal wobble. */
function wobblyEdge(x0: number, y0: number, x1: number, y1: number, amp: number, waves: number): Point[] {
  const points: Point[] = [];
  const steps = 24;
  const [dx, dy] = [x1 - x0, y1 - y0];
  const len = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / len, dx / len]; // unit normal
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = Math.sin(t * Math.PI * waves) * amp * Math.sin(t * Math.PI); // pinned endpoints
    points.push([x0 + dx * t + nx * w, y0 + dy * t + ny * w]);
  }
  return points;
}

// ---------------------------------------------------------------------------
// The three cases
// ---------------------------------------------------------------------------

const CANVAS = { width: 1024, height: 768 };

const RED: RGB = [212, 52, 52];       // #d43434
const ORANGE: RGB = [232, 130, 30];   // #e8821e
const BLUE: RGB = [40, 100, 210];     // #2864d2

interface TestCase {
  name: string;
  expectation: string;
  strokes: TestStroke[];
}

function caseWobblyRedRect(): TestCase {
  // Four wobbly sides, all red — should group into one kind=rect detection.
  return {
    name: "a: wobbly rectangle, red strokes",
    expectation: "kind=rect, glyph=null, colors ~ red",
    strokes: [
      { id: "s1", points: wobblyEdge(220, 180, 760, 190, 7, 3), color: RED },
      { id: "s2", points: wobblyEdge(760, 190, 750, 520, 7, 2), color: RED },
      { id: "s3", points: wobblyEdge(750, 520, 215, 515, 7, 3), color: RED },
      { id: "s4", points: wobblyEdge(215, 515, 220, 180, 7, 2), color: RED },
    ],
  };
}

function caseBoxWithLoneI(): TestCase {
  // A box with a lone letter "i" centered inside: stem stroke + tittle disc.
  const cx = 512;
  return {
    name: "b: box with a lone \"i\" inside",
    expectation: 'box rect (glyph=null) + text_writing cluster with glyph="i", text=null',
    strokes: [
      {
        id: "s1",
        points: [[362, 260], [662, 264], [658, 500], [360, 496], [362, 260]],
        color: BLACK,
      },
      { id: "s2", points: [[cx, 350], [cx + 2, 410]], color: BLACK },
      { id: "s3", points: [[cx, 332], [cx + 1, 333]], color: BLACK, discs: [{ x: cx, y: 332, r: 4 }] },
    ],
  };
}

function caseTwoColorDoodle(): TestCase {
  // Closed irregular blob outline: r(t) = R + A sin(3t) + B sin(5t), split
  // into an orange half and a blue half.
  const cx = 500, cy = 400;
  const r = (t: number) => 150 + 32 * Math.sin(3 * t) + 16 * Math.sin(5 * t + 1);
  const arc = (from: number, to: number): Point[] => {
    const points: Point[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = from + ((to - from) * i) / steps;
      points.push([cx + r(t) * Math.cos(t), cy + r(t) * Math.sin(t)]);
    }
    return points;
  };
  return {
    name: "c: freeform closed doodle, two colors",
    expectation: "kind=smooth_path, colors ~ orange + blue",
    strokes: [
      { id: "s1", points: arc(0, Math.PI), color: ORANGE },
      { id: "s2", points: arc(Math.PI, 2 * Math.PI), color: BLUE },
    ],
  };
}

// ---------------------------------------------------------------------------

function renderCase(tc: TestCase): { png: Buffer; manifest: StrokeManifestEntry[] } {
  const raster = new Raster(CANVAS.width, CANVAS.height);
  for (const s of tc.strokes) {
    raster.polyline(s.points, s.color);
    for (const d of s.discs ?? []) raster.disc(d.x, d.y, d.r, s.color);
  }
  return { png: encodePng(raster), manifest: tc.strokes.map(strokeManifestEntry) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  loadDotEnv();
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not set (and not found in .env) — cannot run the live test.");
    process.exit(1);
  }
  console.log(`Model: ${process.env.GEMINI_MODEL || "gemini-flash-lite-latest"}`);

  const cases = [caseWobblyRedRect(), caseBoxWithLoneI(), caseTwoColorDoodle()];
  let failures = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    if (i > 0) {
      console.log("\n(waiting 5s — free-tier rate limit)");
      await sleep(5000);
    }
    console.log(`\n== Case ${tc.name} ==`);
    console.log(`   expecting: ${tc.expectation}`);

    const { png, manifest } = renderCase(tc);
    if (process.env.DEBUG_PNG_DIR) {
      const file = path.join(process.env.DEBUG_PNG_DIR, `vision-shapes-${i + 1}.png`);
      fs.writeFileSync(file, png);
      console.log(`   (debug PNG written to ${file})`);
    }

    try {
      const result = await analyzeInkShapes({
        pngBase64: png.toString("base64"),
        strokeManifest: manifest,
        canvas: CANVAS,
      });
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      failures++;
      console.error("   FAILED:", e);
    }
  }

  console.log(`\n${failures === 0 ? "ALL CALLS COMPLETED" : `${failures} CALL(S) FAILED`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
