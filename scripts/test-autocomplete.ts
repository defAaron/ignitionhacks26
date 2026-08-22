/**
 * Offline-first smoke test for the autocomplete pipeline — run with:
 *   npx tsx scripts/test-autocomplete.ts
 *
 * Exercises lib/interpretation/pipeline.ts (runAutocomplete) directly — the
 * route (app/api/autocomplete/route.ts) is a thin wrapper, so no HTTP needed:
 *
 *   1. snap math unit tests — all 8 policies (lib/interpretation/snap.ts)
 *   2. rdp + chaikin sanity (lib/interpretation/rdp.ts)
 *   3. normalizer unit tests — glyph merge, stroke-existence drop, stroke-id
 *      conflict resolution, advisory-bbox override (normalize.ts)
 *   4. forced-op pipeline fully offline with an injected stub builder
 *      (contract check: the builder must receive EXACTLY ShapeBuilderInput)
 *   5. validation-failure degrade (ok:false, never a throw)
 *   6. stubbed-vision full path (glyph merge happens inside the pipeline)
 *   7. LIVE end-to-end (only if GEMINI_API_KEY is present in env/.env):
 *      synthetic wobbly-rect PNG -> real vision -> real builder chain
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

import type { ShapeDetectionSet, ShapesOutput, Stroke } from "../types/schemas";
import { chaikinSmooth, rdpSimplify, type Pt } from "../lib/interpretation/rdp";
import {
  computeGeometry,
  normalizeDetections,
  type DetectionGeometry,
} from "../lib/interpretation/normalize";
import { applySnap } from "../lib/interpretation/snap";
import { runAutocomplete, type AutocompleteBody } from "../lib/interpretation/pipeline";
import type { ShapeBuilderClient, ShapeBuilderInput } from "../lib/models";

// ---------------------------------------------------------------------------
// Tiny harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

const approx = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
// Stroke helpers
// ---------------------------------------------------------------------------

function mkStroke(id: string, points: Array<[number, number]>, color = "#000000"): Stroke {
  return { id, points: points.map(([x, y]) => ({ x, y })), color, width: 3 };
}

/** A hand-drawn-looking edge: straight segment + sinusoidal wobble. */
function wobblyEdge(x0: number, y0: number, x1: number, y1: number, amp: number, waves: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const steps = 24;
  const [dx, dy] = [x1 - x0, y1 - y0];
  const len = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / len, dx / len];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = Math.sin(t * Math.PI * waves) * amp * Math.sin(t * Math.PI);
    pts.push([x0 + dx * t + nx * w, y0 + dy * t + ny * w]);
  }
  return pts;
}

const CANVAS = { width: 1024, height: 768 };

function wobblyRectStrokes(): Stroke[] {
  return [
    mkStroke("s1", wobblyEdge(220, 180, 760, 190, 7, 3), "#d43434"),
    mkStroke("s2", wobblyEdge(760, 190, 750, 520, 7, 2), "#d43434"),
    mkStroke("s3", wobblyEdge(750, 520, 215, 515, 7, 3), "#d43434"),
    mkStroke("s4", wobblyEdge(215, 515, 220, 180, 7, 2), "#d43434"),
  ];
}

// ---------------------------------------------------------------------------
// 1. Snap math — all 8 policies
// ---------------------------------------------------------------------------

function testSnap(): void {
  console.log("\n== snap math (8 policies) ==");
  const geom: DetectionGeometry = {
    bbox: { x: 100, y: 200, width: 200, height: 100 },
    centroid: { x: 200, y: 250 },
    endpoints: [
      { x: 100, y: 240 },
      { x: 300, y: 260 },
    ],
    path: [
      { x: 100, y: 240 },
      { x: 200, y: 210 },
      { x: 300, y: 260 },
    ],
  };

  const none = applySnap("none", geom, CANVAS);
  check("none is identity", JSON.stringify(none) === JSON.stringify(geom));
  none.bbox.x = -1;
  check("none returns a copy (no aliasing)", geom.bbox.x === 100);

  const fwt = applySnap("full_width_top", geom, CANVAS);
  check(
    "full_width_top: x=0, width=artboard, y=0, height kept",
    fwt.bbox.x === 0 && fwt.bbox.y === 0 && fwt.bbox.width === CANVAS.width && fwt.bbox.height === 100
  );
  check(
    "full_width_top: path remapped with bbox (left edge -> 0, right -> width)",
    approx(fwt.path![0].x, 0) && approx(fwt.path![2].x, CANVAS.width)
  );

  const fwb = applySnap("full_width_bottom", geom, CANVAS);
  check(
    "full_width_bottom: pinned to bottom edge, full width",
    fwb.bbox.x === 0 && fwb.bbox.y === CANVAS.height - 100 && fwb.bbox.width === CANVAS.width && fwb.bbox.height === 100
  );

  const fw = applySnap("full_width", geom, CANVAS);
  check(
    "full_width: stretches x only, keeps y/height",
    fw.bbox.x === 0 && fw.bbox.width === CANVAS.width && fw.bbox.y === 200 && fw.bbox.height === 100
  );
  check("full_width: y coordinates untouched", approx(fw.path![1].y, 210));

  const sh = applySnap("straighten_h", geom, CANVAS);
  check(
    "straighten_h: endpoints leveled to mean y (250)",
    approx(sh.endpoints![0].y, 250) && approx(sh.endpoints![1].y, 250) && sh.endpoints![0].x === 100 && sh.endpoints![1].x === 300
  );
  check("straighten_h: bbox collapses to zero height", sh.bbox.height === 0 && sh.bbox.width === 200);
  check("straighten_h: path is the two endpoints", sh.path!.length === 2 && approx(sh.path![0].y, 250));

  const sv = applySnap("straighten_v", geom, CANVAS);
  check(
    "straighten_v: endpoints leveled to mean x (200)",
    approx(sv.endpoints![0].x, 200) && approx(sv.endpoints![1].x, 200) && sv.endpoints![0].y === 240 && sv.endpoints![1].y === 260
  );

  const sq = applySnap("square", geom, CANVAS);
  check(
    "square: side = mean(w,h) = 150, centered on centroid",
    sq.bbox.width === 150 && sq.bbox.height === 150 && approx(sq.bbox.x, 125) && approx(sq.bbox.y, 175)
  );

  const cir = applySnap("center_in_region", geom, CANVAS);
  check(
    "center_in_region: size kept, centered in artboard",
    cir.bbox.width === 200 && cir.bbox.height === 100 && approx(cir.bbox.x, (CANVAS.width - 200) / 2) && approx(cir.bbox.y, (CANVAS.height - 100) / 2)
  );
}

// ---------------------------------------------------------------------------
// 2. RDP + Chaikin sanity
// ---------------------------------------------------------------------------

function testRdp(): void {
  console.log("\n== rdp + chaikin ==");
  // A noisy near-straight line must collapse to its two endpoints.
  const noisy: Pt[] = [];
  for (let i = 0; i <= 50; i++) noisy.push({ x: i * 10, y: Math.sin(i) * 1.2 });
  const simple = rdpSimplify(noisy, 2);
  check("rdp collapses a near-straight noisy line", simple.length <= 4, simple.length);
  check("rdp keeps endpoints", simple[0].x === 0 && simple[simple.length - 1].x === 500);

  // A right angle must keep its corner.
  const corner: Pt[] = [
    ...Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 })),
    ...Array.from({ length: 10 }, (_, i) => ({ x: 100, y: (i + 1) * 10 })),
  ];
  const simpleCorner = rdpSimplify(corner, 2);
  check(
    "rdp keeps the corner of a right angle",
    simpleCorner.some((p) => p.x === 100 && p.y === 0),
    simpleCorner
  );

  const smooth = chaikinSmooth(simpleCorner, 2);
  check("chaikin adds points and keeps endpoints", smooth.length > simpleCorner.length && smooth[0].x === 0 && smooth[smooth.length - 1].y === 100);
}

// ---------------------------------------------------------------------------
// 3. Normalizer — glyph merge + conflict rules
// ---------------------------------------------------------------------------

const emptyDet = { text: null, colors: [] as string[], gradient_direction: null };

function testNormalize(): void {
  console.log("\n== normalizeDetections ==");

  // --- THE GLYPH MERGE: box rect + lone-letter text_writing inside it -------
  const boxStroke = mkStroke("s1", [
    [100, 100], [300, 102], [298, 250], [98, 248], [100, 100],
  ]);
  const letterStroke = mkStroke("s2", [
    [195, 160], [196, 200], [205, 180], [210, 200],
  ]);
  const visionOut: ShapeDetectionSet = {
    detections: [
      {
        stroke_ids: ["s1"], kind: "rect", glyph: null, ...emptyDet,
        confidence: 0.9,
        bbox: { x: 0, y: 0, width: 5, height: 5 }, // garbage advisory bbox
      },
      {
        stroke_ids: ["s2"], kind: "text_writing", glyph: "b", ...emptyDet,
        confidence: 0.7,
        bbox: { x: 190, y: 155, width: 25, height: 50 },
      },
    ],
  };
  const merged = normalizeDetections(visionOut, [boxStroke, letterStroke], CANVAS);
  check("glyph merge: two detections collapse to one", merged.length === 1, merged.length);
  const m = merged[0];
  check("glyph merge: kind=rect, glyph carried over", m.kind === "rect" && m.glyph === "b");
  check("glyph merge: stroke_ids are the union", JSON.stringify([...m.stroke_ids].sort()) === JSON.stringify(["s1", "s2"]));
  check("glyph merge: confidence is the min of the two", approx(m.confidence, 0.7));
  check("glyph merge: id minted as det_1", m.id === "det_1");
  check(
    "advisory vision bbox overwritten with real stroke bounds",
    m.bbox.x === 98 && m.bbox.y === 100 && m.bbox.width === 202 && m.bbox.height === 150,
    m.bbox
  );

  // Letter OUTSIDE any rect must NOT merge.
  const farLetter = mkStroke("s3", [[800, 600], [802, 640]]);
  const noMerge = normalizeDetections(
    {
      detections: [
        visionOut.detections[0],
        { stroke_ids: ["s3"], kind: "text_writing", glyph: "b", ...emptyDet, confidence: 0.7, bbox: { x: 800, y: 600, width: 4, height: 40 } },
      ],
    },
    [boxStroke, farLetter],
    CANVAS
  );
  check("no merge when the letter is outside the rect", noMerge.length === 2 && noMerge[1].kind === "text_writing");

  // --- existence filter ------------------------------------------------------
  const ghosts = normalizeDetections(
    {
      detections: [
        { stroke_ids: ["nope"], kind: "rect", glyph: null, ...emptyDet, confidence: 0.9, bbox: { x: 0, y: 0, width: 1, height: 1 } },
        { stroke_ids: ["s1", "nope2"], kind: "rect", glyph: null, ...emptyDet, confidence: 0.8, bbox: { x: 0, y: 0, width: 1, height: 1 } },
      ],
    },
    [boxStroke],
    CANVAS
  );
  check("detection with only unknown strokes is dropped", ghosts.length === 1);
  check("unknown stroke ids are stripped from survivors", JSON.stringify(ghosts[0].stroke_ids) === JSON.stringify(["s1"]));

  // --- stroke-id conflict: higher confidence keeps it -----------------------
  const sA = mkStroke("a", [[0, 0], [50, 0]]);
  const sB = mkStroke("b", [[0, 20], [50, 20]]);
  const conflict = normalizeDetections(
    {
      detections: [
        { stroke_ids: ["a", "b"], kind: "line", glyph: null, ...emptyDet, confidence: 0.4, bbox: { x: 0, y: 0, width: 1, height: 1 } },
        { stroke_ids: ["a"], kind: "line", glyph: null, ...emptyDet, confidence: 0.9, bbox: { x: 0, y: 0, width: 1, height: 1 } },
      ],
    },
    [sA, sB],
    CANVAS
  );
  check("conflict: higher confidence keeps the contested stroke", conflict.length === 2 && JSON.stringify(conflict[1].stroke_ids) === JSON.stringify(["a"]));
  check("conflict: loser drops the stroke id, keeps the rest", JSON.stringify(conflict[0].stroke_ids) === JSON.stringify(["b"]));

  const emptied = normalizeDetections(
    {
      detections: [
        { stroke_ids: ["a"], kind: "line", glyph: null, ...emptyDet, confidence: 0.4, bbox: { x: 0, y: 0, width: 1, height: 1 } },
        { stroke_ids: ["a"], kind: "arrow", glyph: null, ...emptyDet, confidence: 0.9, bbox: { x: 0, y: 0, width: 1, height: 1 } },
      ],
    },
    [sA],
    CANVAS
  );
  check("conflict: loser emptied of strokes is dropped", emptied.length === 1 && emptied[0].kind === "arrow");

  // --- low confidence is KEPT (no floor drop in the normalizer) -------------
  const lowConf = normalizeDetections(
    { detections: [{ stroke_ids: ["s1"], kind: "rect", glyph: null, ...emptyDet, confidence: 0.1, bbox: { x: 0, y: 0, width: 1, height: 1 } }] },
    [boxStroke],
    CANVAS
  );
  check("low-confidence detections are kept (builder decides waits)", lowConf.length === 1);

  // --- geometry: endpoints + path kinds --------------------------------------
  const lineGeom = computeGeometry("line", [mkStroke("l", wobblyEdge(10, 100, 400, 110, 3, 2))]);
  check("line geometry has endpoints (first/last ink point)", !!lineGeom.endpoints && lineGeom.endpoints[0].x === 10 && lineGeom.endpoints[1].x === 400);
  check("line geometry has an RDP path", !!lineGeom.path && lineGeom.path.length >= 2 && lineGeom.path.length < 25);
  const rectGeom = computeGeometry("rect", [boxStroke]);
  check("rect geometry has no path/endpoints", rectGeom.path === undefined && rectGeom.endpoints === undefined);
}

// ---------------------------------------------------------------------------
// 4/5/6. Pipeline (offline, injected deps)
// ---------------------------------------------------------------------------

/** Stub builder: records the exact input, answers each detection per `plan`. */
function stubBuilder(
  plan: (input: ShapeBuilderInput) => ShapesOutput
): { builder: ShapeBuilderClient; inputs: ShapeBuilderInput[] } {
  const inputs: ShapeBuilderInput[] = [];
  return {
    inputs,
    builder: {
      async buildShapes(input: ShapeBuilderInput): Promise<ShapesOutput> {
        inputs.push(input);
        return plan(input);
      },
    },
  };
}

async function testForcedOpOffline(): Promise<void> {
  console.log("\n== pipeline: forced-op path (offline, stub builder) ==");

  const { builder, inputs } = stubBuilder((input) => ({
    schema_version: "shapes-1.0",
    components: [
      { op: "button", from: input.detections[0].id, params: { label: "Go" }, snap: "center_in_region" },
    ],
  }));

  const body: AutocompleteBody = {
    png_base64: "",
    canvas: CANVAS,
    strokes: wobblyRectStrokes(),
    forced_op: "button",
  };
  const res = await runAutocomplete(body, { builder });

  check("forced-op: ok response", res.ok === true, res);
  if (!res.ok) return;
  check("forced-op: one result, command op = button", res.results.length === 1 && res.results[0].command.op === "button");
  check("forced-op: tier high (confidence 1.0)", res.results[0].tier === "high");
  check("forced-op: detection is rect + glyph b, all strokes claimed",
    res.results[0].detection.kind === "rect" &&
    res.results[0].detection.glyph === "b" &&
    res.results[0].detection.stroke_ids.length === 4
  );
  const g = res.results[0].geometry;
  check(
    "forced-op: center_in_region snap applied (bbox centered in canvas)",
    approx(g.bbox.x, (CANVAS.width - g.bbox.width) / 2, 0.001) && approx(g.bbox.y, (CANVAS.height - g.bbox.height) / 2, 0.001),
    g.bbox
  );

  // Builder contract: EXACTLY ShapeBuilderInput — no geometry/stroke leakage.
  const detKeys = Object.keys(inputs[0].detections[0]).sort();
  check(
    "builder receives exactly the ShapeBuilderDetection fields (no geometry, no stroke_ids)",
    // `parent` joined the contract in wave 3 (containment); visionKind/kindScores must NOT leak.
    JSON.stringify(detKeys) === JSON.stringify(["bbox", "colors", "composite", "confidence", "glyph", "gradient_direction", "id", "kind", "parent", "text"]),
    detKeys
  );
  check("builder input has artboard + detections only", JSON.stringify(Object.keys(inputs[0]).sort()) === JSON.stringify(["artboard", "detections"]));

  // Forced straight line + straighten_h.
  const lineStub = stubBuilder((input) => ({
    schema_version: "shapes-1.0",
    components: [{ op: "line", from: input.detections[0].id, snap: "straighten_h" }],
  }));
  const lineRes = await runAutocomplete(
    {
      png_base64: "",
      canvas: CANVAS,
      strokes: [mkStroke("s1", wobblyEdge(100, 300, 600, 320, 4, 2))],
      forced_op: "line",
    },
    { builder: lineStub.builder }
  );
  check("forced line: ok", lineRes.ok === true, lineRes);
  if (lineRes.ok) {
    const p = lineRes.results[0].geometry.path;
    check(
      "forced line: straighten_h leveled the path (2 points, equal y = 310)",
      !!p && p.length === 2 && approx(p[0].y, 310) && approx(p[1].y, 310) && p[0].x === 100 && p[1].x === 600,
      p
    );
  }
}

async function testValidationDegrade(): Promise<void> {
  console.log("\n== pipeline: validation failure degrades (never throws) ==");

  // Coverage violation: `from` references a detection that doesn't exist.
  const { builder } = stubBuilder(() => ({
    schema_version: "shapes-1.0",
    components: [{ op: "rect", from: "det_999" }],
  }));
  const res = await runAutocomplete(
    { png_base64: "", canvas: CANVAS, strokes: wobblyRectStrokes(), forced_op: "rect" },
    { builder }
  );
  check("degrade: ok=false with a coverage reason", res.ok === false && res.reason === "validation_failed_coverage", res);
  check("degrade: issues attached", !res.ok && Array.isArray(res.issues) && res.issues.length > 0);

  // Throwing builder degrades too.
  const boom: ShapeBuilderClient = {
    async buildShapes(): Promise<ShapesOutput> {
      throw new Error("kaboom");
    },
  };
  const res2 = await runAutocomplete(
    { png_base64: "", canvas: CANVAS, strokes: wobblyRectStrokes(), forced_op: "rect" },
    { builder: boom }
  );
  check("degrade: throwing builder -> ok=false builder_failed", res2.ok === false && res2.reason.startsWith("builder_failed"), res2);
}

async function testStubbedVisionFullPath(): Promise<void> {
  console.log("\n== pipeline: stubbed vision, glyph merge inside the pipeline ==");

  const boxStroke = mkStroke("s1", [[100, 100], [300, 102], [298, 250], [98, 248], [100, 100]]);
  const letterStroke = mkStroke("s2", [[195, 160], [196, 200], [205, 180], [210, 200]]);

  const vision = async (): Promise<ShapeDetectionSet> => ({
    detections: [
      { stroke_ids: ["s1"], kind: "rect", glyph: null, ...emptyDet, confidence: 0.87, bbox: { x: 95, y: 98, width: 210, height: 155 } },
      { stroke_ids: ["s2"], kind: "text_writing", glyph: "b", ...emptyDet, confidence: 0.62, bbox: { x: 190, y: 155, width: 25, height: 50 } },
    ],
  });
  const { builder, inputs } = stubBuilder((input) => ({
    schema_version: "shapes-1.0",
    components: input.detections.map((d) => ({
      op: d.glyph === "b" ? ("button" as const) : ("rect" as const),
      from: d.id,
    })),
  }));

  const res = await runAutocomplete(
    { png_base64: "aWs=", canvas: CANVAS, strokes: [boxStroke, letterStroke] },
    { builder, vision }
  );
  check("full path: ok", res.ok === true, res);
  check("full path: builder saw ONE merged detection", inputs[0].detections.length === 1 && inputs[0].detections[0].glyph === "b");
  if (res.ok) {
    check("full path: one button result at medium tier (min-confidence 0.62)", res.results.length === 1 && res.results[0].command.op === "button" && res.results[0].tier === "medium");
    check("full path: ink wipe covers both strokes", res.results[0].detection.stroke_ids.length === 2);
  }

  // Vision throwing degrades, not throws.
  const res2 = await runAutocomplete(
    { png_base64: "aWs=", canvas: CANVAS, strokes: [boxStroke] },
    {
      builder,
      vision: async () => {
        throw new Error("no eyes");
      },
    }
  );
  check("full path: vision failure -> ok=false vision_failed", res2.ok === false && res2.reason.startsWith("vision_failed"), res2);
}

// ---------------------------------------------------------------------------
// 6.5. Kind correction (normalize.ts) + alternates (pipeline.ts)
// ---------------------------------------------------------------------------

/** Dense single-stroke square loop, ending ~10px short of the start. */
function closedSquareStroke(id = "sq"): Stroke {
  const pts: Array<[number, number]> = [];
  const walk = (x0: number, y0: number, x1: number, y1: number): void => {
    const steps = 20;
    for (let i = 0; i < steps; i++) pts.push([x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]);
  };
  walk(100, 100, 300, 100);
  walk(300, 100, 300, 300);
  walk(300, 300, 100, 300);
  walk(100, 300, 100, 110); // stops 10px short — hand-drawn closure gap
  return mkStroke(id, pts);
}

/** Dense single-stroke near-circle (98% of a full turn). */
function nearCircleStroke(id = "circ", r = 100, wobble = 0): Stroke {
  const pts: Array<[number, number]> = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * 0.98;
    const rr = r + (wobble ? Math.sin(t * 5) * wobble : 0);
    pts.push([400 + Math.cos(t) * rr, 300 + Math.sin(t) * rr]);
  }
  return mkStroke(id, pts);
}

/** Open semicircular arc — genuinely open (closure ratio ≈ 0.64). */
function openArcStroke(id = "arc"): Stroke {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * Math.PI;
    pts.push([400 + Math.cos(t) * 120, 300 - Math.sin(t) * 120]);
  }
  return mkStroke(id, pts);
}

const detOf = (strokeIds: string[], kind: "line" | "scribble" | "rect", confidence = 0.7) => ({
  stroke_ids: strokeIds,
  kind: kind as "line",
  glyph: null,
  ...emptyDet,
  confidence,
  bbox: { x: 0, y: 0, width: 1, height: 1 },
});

/** Stub builder answering every detection with its kind's geometric op. */
function kindEchoBuilder(fill?: string): ShapeBuilderClient {
  return {
    async buildShapes(input: ShapeBuilderInput): Promise<ShapesOutput> {
      return {
        schema_version: "shapes-1.0",
        components: input.detections.map((d) => ({
          op: (d.kind === "scribble" ? "night_sky" : d.kind === "text_writing" ? "text" : d.kind) as "rect",
          from: d.id,
          ...(fill ? { params: { fill } } : {}),
        })),
      };
    },
  };
}

async function testKindCorrectionAndAlternates(): Promise<void> {
  console.log("\n== kind correction (normalize) + alternates (pipeline) ==");

  // --- normalizer corrections, in isolation ---------------------------------
  const sq = closedSquareStroke();
  const corrected = normalizeDetections({ detections: [detOf(["sq"], "line")] }, [sq], CANVAS);
  check("closed square reported as line -> corrected to rect", corrected[0].kind === "rect", corrected[0].kind);
  check("original vision kind kept as visionKind (telemetry)", corrected[0].visionKind === "line");
  check("kindScores measured (closed, ~4 corners)", corrected[0].kindScores.closed && corrected[0].kindScores.cornerCount >= 3 && corrected[0].kindScores.cornerCount <= 5, corrected[0].kindScores);

  const circ = nearCircleStroke();
  const asEllipse = normalizeDetections({ detections: [detOf(["circ"], "line")] }, [circ], CANVAS);
  check("near-circle reported as line -> corrected to ellipse", asEllipse[0].kind === "ellipse", asEllipse[0].kindScores);

  const arc = openArcStroke();
  const staysLine = normalizeDetections({ detections: [detOf(["arc"], "line")] }, [arc], CANVAS);
  check("genuinely open arc stays line", staysLine[0].kind === "line" && staysLine[0].visionKind === "line", staysLine[0].kindScores);

  // Closed single-stroke blob misread as scribble -> promoted (low self-intersection).
  const blob = nearCircleStroke("blob", 80, 5);
  const scribblePromoted = normalizeDetections({ detections: [detOf(["blob"], "scribble")] }, [blob], CANVAS);
  check("closed single-stroke scribble -> promoted to ellipse", scribblePromoted[0].kind === "ellipse" && scribblePromoted[0].visionKind === "scribble", scribblePromoted[0].kindScores);

  // Multi-stroke scribble is NEVER promoted (may be a diagram composite).
  const multi = normalizeDetections(
    { detections: [{ ...detOf(["m1", "m2"], "scribble"), stroke_ids: ["m1", "m2"] }] },
    [closedSquareStroke("m1"), mkStroke("m2", [[500, 500], [560, 560], [520, 500], [580, 560]])],
    CANVAS
  );
  check("multi-stroke scribble is not promoted", multi[0].kind === "scribble");

  // Rects are untouched by the pass (never demoted; correction targets line/scribble/smooth_path).
  const rectStays = normalizeDetections({ detections: [detOf(["sq"], "rect")] }, [sq], CANVAS);
  check("reported rect stays rect (no demotion path exists)", rectStays[0].kind === "rect" && rectStays[0].visionKind === "rect");

  // --- alternates through the pipeline --------------------------------------
  // (1) Closed square misreported as line: corrected to rect before the
  // builder; the rect result carries [ellipse (roundness middling), keep-as-drawn].
  const vision = async (): Promise<ShapeDetectionSet> => ({ detections: [detOf(["sq"], "line")] });
  const res = await runAutocomplete(
    { png_base64: "aWs=", canvas: CANVAS, strokes: [closedSquareStroke()] },
    { builder: kindEchoBuilder("#123456"), vision }
  );
  check("alternates: corrected-line pipeline run ok", res.ok === true, res);
  if (res.ok) {
    const r = res.results[0];
    check("alternates: primary command is rect", r.command.op === "rect");
    check("alternates: present and <= 2", Array.isArray(r.alternates) && r.alternates.length > 0 && r.alternates.length <= 2, r.alternates);
    check("alternates: never duplicate the primary op", r.alternates.every((a) => a.op !== r.command.op));
    check("alternates: no duplicates among themselves", new Set(r.alternates.map((a) => a.op)).size === r.alternates.length);
    check("alternates: rect offers ellipse first (middling roundness), then keep-as-drawn",
      r.alternates[0]?.op === "ellipse" && r.alternates[1]?.op === "smooth_path", r.alternates);
    check("alternates: style params carried over (fill)", r.alternates[0]?.params?.fill === "#123456", r.alternates[0]);
    check("alternates: every entry has a note", r.alternates.every((a) => typeof a.note === "string" && a.note.length > 0));
  }

  // (2) Open arc line: no enclosed alternate — just keep-as-drawn.
  const arcRes = await runAutocomplete(
    { png_base64: "aWs=", canvas: CANVAS, strokes: [openArcStroke()] },
    { builder: kindEchoBuilder(), vision: async () => ({ detections: [detOf(["arc"], "line")] }) }
  );
  if (arcRes.ok) {
    const r = arcRes.results[0];
    check("alternates: open line -> [smooth_path] only", r.command.op === "line" && r.alternates.length === 1 && r.alternates[0].op === "smooth_path", r.alternates);
  } else {
    check("alternates: open-arc pipeline run ok", false, arcRes);
  }

  // (3) Glyph component (box + b -> button): alternates are the plain box,
  // then the placeholder box.
  const boxStroke = mkStroke("s1", [[100, 100], [300, 102], [298, 250], [98, 248], [100, 100]]);
  const letterStroke = mkStroke("s2", [[195, 160], [196, 200], [205, 180], [210, 200]]);
  const glyphRes = await runAutocomplete(
    { png_base64: "aWs=", canvas: CANVAS, strokes: [boxStroke, letterStroke] },
    {
      vision: async () => ({
        detections: [
          { stroke_ids: ["s1"], kind: "rect", glyph: null, ...emptyDet, confidence: 0.9, bbox: { x: 95, y: 98, width: 210, height: 155 } },
          { stroke_ids: ["s2"], kind: "text_writing", glyph: "b", ...emptyDet, confidence: 0.8, bbox: { x: 190, y: 155, width: 25, height: 50 } },
        ],
      }),
      builder: {
        async buildShapes(input: ShapeBuilderInput): Promise<ShapesOutput> {
          return {
            schema_version: "shapes-1.0",
            components: input.detections.map((d) => ({ op: "button", from: d.id, params: { fill: "#20c" } })),
          };
        },
      },
    }
  );
  if (glyphRes.ok) {
    const r = glyphRes.results[0];
    check("alternates: glyph component -> [rect, placeholder]",
      r.command.op === "button" && r.alternates.map((a) => a.op).join(",") === "rect,placeholder", r.alternates);
    check("alternates: glyph rect alternate carries fill", r.alternates[0]?.params?.fill === "#20c");
  } else {
    check("alternates: glyph pipeline run ok", false, glyphRes);
  }

  // (4) Forced decorative op: synthesized detections (confidence 1.0) are
  // never kind-corrected, and decorative results offer only keep-as-drawn.
  const forcedRes = await runAutocomplete(
    { png_base64: "", canvas: CANVAS, strokes: [nearCircleStroke("blob", 80, 5)], forced_op: "night_sky" },
    { builder: kindEchoBuilder() }
  );
  check("alternates: forced decorative run ok", forcedRes.ok === true, forcedRes);
  if (forcedRes.ok) {
    const r = forcedRes.results[0];
    check("forced-op detection is never kind-corrected (scribble kept at confidence 1.0)", r.detection.kind === "scribble");
    check("alternates: decorative -> [smooth_path 'keep as drawn'] only",
      r.command.op === "night_sky" && r.alternates.length === 1 && r.alternates[0].op === "smooth_path" && r.alternates[0].note === "keep as drawn", r.alternates);
  }
}

// ---------------------------------------------------------------------------
// 7. Live end-to-end (only with GEMINI_API_KEY) — synthetic PNG, real models
// ---------------------------------------------------------------------------
// PNG rasterizer + encoder: same dependency-free technique as
// scripts/test-vision-shapes.ts (RGB scanlines + node:zlib deflate).

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
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

function strokesToPng(strokes: Stroke[], canvas: { width: number; height: number }): Buffer {
  const { width, height } = canvas;
  const data = new Uint8Array(width * height * 3).fill(255);
  const set = (x: number, y: number, r: number, g: number, b: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  };
  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(v, 16);
    return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  for (const s of strokes) {
    const [r, g, b] = hexToRgb(s.color);
    for (let i = 0; i + 1 < s.points.length; i++) {
      // Bresenham with a 2px brush.
      let cx = Math.round(s.points[i].x);
      let cy = Math.round(s.points[i].y);
      const ex = Math.round(s.points[i + 1].x);
      const ey = Math.round(s.points[i + 1].y);
      const dx = Math.abs(ex - cx), sx = cx < ex ? 1 : -1;
      const dy = -Math.abs(ey - cy), sy = cy < ey ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        for (let ox = 0; ox < 2; ox++) for (let oy = 0; oy < 2; oy++) set(cx + ox, cy + oy, r, g, b);
        if (cx === ex && cy === ey) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; cx += sx; }
        if (e2 <= dx) { err += dx; cy += sy; }
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const scanlines = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    scanlines[rowStart] = 0;
    Buffer.from(data.buffer, y * width * 3, width * 3).copy(scanlines, rowStart + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function testLiveEndToEnd(): Promise<void> {
  console.log("\n== LIVE end-to-end (real vision + real builder chain) ==");
  const strokes = wobblyRectStrokes();
  const png = strokesToPng(strokes, CANVAS);
  const res = await runAutocomplete({
    png_base64: png.toString("base64"),
    canvas: CANVAS,
    strokes,
  });
  console.log(JSON.stringify(res, null, 2));
  check("live: pipeline answered (ok:true or a typed degrade — never a throw)", typeof res.ok === "boolean");
  if (res.ok) {
    check("live: at least one result for the wobbly rect", res.results.length >= 1, res.results.length);
    const first = res.results[0];
    if (first) {
      check(
        "live: geometry bbox is the real stroke bounds (not full canvas)",
        first.geometry.bbox.width > 300 && first.geometry.bbox.width < CANVAS.width,
        first.geometry.bbox
      );
    }
  } else {
    console.warn(`live: degraded — reason: ${res.reason}`);
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  testSnap();
  testRdp();
  testNormalize();
  await testForcedOpOffline();
  await testValidationDegrade();
  await testStubbedVisionFullPath();
  await testKindCorrectionAndAlternates();

  loadDotEnv();
  if (process.env.GEMINI_API_KEY) {
    await testLiveEndToEnd();
  } else {
    console.log("\n(no GEMINI_API_KEY — skipping the live end-to-end run)");
  }

  console.log(`\n${failed === 0 ? "ALL GREEN" : "FAILURES"}: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
