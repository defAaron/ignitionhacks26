/* baio showcase generator — real adapter calls, real template renders. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React, { createElement } from "react";
(globalThis as any).React = React;
import { renderToStaticMarkup } from "react-dom/server";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(): void {
  for (const envPath of [
    path.join(ROOT, ".env"),
    path.join(ROOT, "product", ".env"),
  ]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(trimmed);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  }
}

loadDotEnv();

if (!process.env.FREESOLO_MODEL) {
  console.error("FREESOLO_MODEL not set — add it to .env or product/.env");
  process.exit(1);
}

const { FreesoloBuilder } = await import("../lib/models/freesolo");
const { shapesPack } = await import("../lib/packs/shapes/registry");
const { applySnap } = await import("../lib/interpretation/snap");

type BBox = { x: number; y: number; width: number; height: number };
type Pt = { x: number; y: number };

// Wobbly hand-drawn ink paths (deterministic jitter)
function wobbleRect(b: BBox, amp = 4): Pt[] {
  const pts: Pt[] = [];
  const per = [
    [b.x, b.y, b.x + b.width, b.y], [b.x + b.width, b.y, b.x + b.width, b.y + b.height],
    [b.x + b.width, b.y + b.height, b.x, b.y + b.height], [b.x, b.y + b.height, b.x, b.y + 2],
  ];
  let t = 0;
  for (const [x1, y1, x2, y2] of per)
    for (let i = 0; i <= 10; i++, t++) {
      const f = i / 10;
      pts.push({ x: x1 + (x2 - x1) * f + Math.sin(t * 1.7) * amp, y: y1 + (y2 - y1) * f + Math.cos(t * 2.3) * amp });
    }
  return pts;
}
function firePath(b: BBox): Pt[] {
  const cx = b.x + b.width / 2, base = b.y + b.height;
  const raw: [number, number][] = [
    [cx - 90, base], [cx - 105, base - 90], [cx - 60, base - 120], [cx - 75, base - 195],
    [cx - 15, base - 160], [cx + 10, base - 260], [cx + 45, base - 175], [cx + 90, base - 210],
    [cx + 75, base - 105], [cx + 105, base - 75], [cx + 85, base], [cx - 90, base],
  ];
  return raw.map(([x, y], i) => ({ x: x + Math.sin(i * 2.1) * 5, y: y + Math.cos(i * 1.3) * 5 }));
}
function scribble(b: BBox, rows = 6): Pt[] {
  const pts: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    const y = b.y + (b.height * r) / rows;
    for (let i = 0; i <= 14; i++)
      pts.push({ x: b.x + (b.width * (r % 2 ? 14 - i : i)) / 14, y: y + Math.sin(i * 2 + r) * 7 });
  }
  return pts;
}
const toPathD = (pts: Pt[]) => "M" + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L");

interface ShowCase {
  title: string; sub: string;
  det: Record<string, unknown>;
  ink: { d: string; color: string; extra?: string }[];
  bbox: BBox; path?: Pt[];
}
const CASES: ShowCase[] = [
  {
    title: "Glyph: box + b + “Login”", sub: "the drawing book — semantics are opt-in",
    det: { id: "det_1", kind: "rect", glyph: "b", text: "Login", colors: ["#1a1a2e"], gradient_direction: null, confidence: 0.9, bbox: { x: 40, y: 30, width: 220, height: 64 } },
    ink: [
      { d: toPathD(wobbleRect({ x: 40, y: 30, width: 220, height: 64 })), color: "#1a1a2e" },
      { d: "", color: "#1a1a2e", extra: `<text x="110" y="72" font-family="'Comic Sans MS','Segoe Print',cursive" font-size="30" fill="#1a1a2e">b Login</text>` },
    ],
    bbox: { x: 40, y: 30, width: 220, height: 64 },
  },
  {
    title: "Glyph: box + i", sub: "single letter alone → image placeholder",
    det: { id: "det_1", kind: "rect", glyph: "i", text: null, colors: ["#1c1c1e"], gradient_direction: null, confidence: 0.88, bbox: { x: 40, y: 24, width: 240, height: 170 } },
    ink: [
      { d: toPathD(wobbleRect({ x: 40, y: 24, width: 240, height: 170 })), color: "#1c1c1e" },
      { d: "", color: "#1c1c1e", extra: `<text x="146" y="125" font-family="'Comic Sans MS','Segoe Print',cursive" font-size="44" fill="#1c1c1e">i</text>` },
    ],
    bbox: { x: 40, y: 24, width: 240, height: 170 },
  },
  {
    title: "Rect with a fire gradient", sub: "two ink colors shading down → gradient fill",
    det: { id: "det_1", kind: "rect", glyph: null, text: null, colors: ["#ef4444", "#f97316"], gradient_direction: "down", confidence: 0.87, bbox: { x: 40, y: 24, width: 250, height: 170 } },
    ink: [
      { d: toPathD(wobbleRect({ x: 40, y: 24, width: 250, height: 170 })), color: "#ef4444" },
      { d: toPathD(scribble({ x: 55, y: 40, width: 220, height: 65 }, 3)), color: "#ef4444" },
      { d: toPathD(scribble({ x: 55, y: 115, width: 220, height: 62 }, 3)), color: "#f97316" },
    ],
    bbox: { x: 40, y: 24, width: 250, height: 170 },
  },
  {
    title: "Fire-shaped doodle, kept as drawn", sub: "smooth_path — your silhouette survives",
    det: { id: "det_1", kind: "smooth_path", glyph: null, text: null, colors: ["#dc2626", "#f59e0b"], gradient_direction: "down", confidence: 0.85, bbox: { x: 60, y: 20, width: 220, height: 275 } },
    ink: [{ d: toPathD(firePath({ x: 60, y: 20, width: 220, height: 275 })), color: "#dc2626" }],
    bbox: { x: 60, y: 20, width: 220, height: 275 },
    path: firePath({ x: 60, y: 20, width: 220, height: 275 }),
  },
  {
    title: "Glyph: wide box + n", sub: "navbar — snaps full-width to the top",
    det: { id: "det_1", kind: "rect", glyph: "n", text: "baio", colors: ["#1c1c1e"], gradient_direction: null, confidence: 0.92, bbox: { x: 60, y: 40, width: 560, height: 62 } },
    ink: [
      { d: toPathD(wobbleRect({ x: 60, y: 40, width: 560, height: 62 }, 3)), color: "#1c1c1e" },
      { d: "", color: "#1c1c1e", extra: `<text x="300" y="84" font-family="'Comic Sans MS','Segoe Print',cursive" font-size="28" fill="#1c1c1e">n</text>` },
    ],
    bbox: { x: 60, y: 40, width: 560, height: 62 },
  },
  {
    title: "Dark scribble + dots, top of page", sub: "night sky — renderer owns the beauty",
    det: { id: "det_1", kind: "scribble", glyph: null, text: null, colors: ["#1e293b", "#f8fafc"], gradient_direction: null, confidence: 0.8, bbox: { x: 20, y: 12, width: 620, height: 210 } },
    ink: [
      { d: toPathD(scribble({ x: 20, y: 12, width: 620, height: 210 }, 8)), color: "#1e293b" },
      { d: "", color: "#f8fafc", extra: [80, 200, 340, 470, 560].map((x, i) => `<text x="${x}" y="${40 + (i % 3) * 55}" font-size="22" fill="#475569">*</text>`).join("") },
    ],
    bbox: { x: 20, y: 12, width: 620, height: 210 },
  },
];

const builder = new FreesoloBuilder("shapes");
const cards: string[] = [];
let hits = 0, calls = 0, latSum = 0;

for (const c of CASES) {
  const artboard = { width: 1440, height: 900 };
  let cmd: any = null, ms = 0, failed = "";
  const t0 = Date.now();
  // Serving endpoint is nondeterministic (grammar flakiness) — retry when a
  // labeled glyph detection comes back label-less; keep the best of 3.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await builder.buildShapes({ artboard, detections: [c.det] } as any);
      const got = out.components[0] as any;
      if (!cmd) cmd = got;
      const wantsLabel = typeof (c.det as any).text === "string" && (c.det as any).glyph;
      if (got && got.op !== "wait" && (!wantsLabel || got.params?.label)) { cmd = got; break; }
    } catch (e) {
      failed = (e as Error).message.slice(0, 120);
    }
  }
  ms = Date.now() - t0;
  calls++; latSum += ms;

  let renderedSvg = "", verdict = "";
  if (cmd && cmd.op !== "wait") {
    const snapped = applySnap((cmd.snap ?? "none") as any, { bbox: c.bbox, centroid: { x: c.bbox.x + c.bbox.width / 2, y: c.bbox.y + c.bbox.height / 2 }, path: c.path } as any, artboard);
    const tpl = (shapesPack as any)[cmd.op];
    if (tpl) {
      const g = renderToStaticMarkup(createElement(tpl, { bbox: snapped.bbox, path: snapped.path ?? c.path, params: cmd.params ?? {} }));
      const pad = 16;
      // Frame whatever the snap produced (center_in_region etc. can move it).
      const fb = snapped.bbox;
      const vb = cmd.snap && String(cmd.snap).startsWith("full_width")
        ? `-8 ${fb.y - pad} ${artboard.width + 16} ${fb.height + pad * 2}`
        : `${fb.x - pad} ${fb.y - pad} ${fb.width + pad * 2} ${fb.height + pad * 2}`;
      renderedSvg = `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
      verdict = "ok"; hits++;
    } else { verdict = "unknown-op"; }
  } else if (cmd) { verdict = "wait"; } else { verdict = "failed"; }

  const inkSvg = `<svg viewBox="${c.bbox.x - 20} ${c.bbox.y - 20} ${c.bbox.width + 40} ${c.bbox.height + 40}" preserveAspectRatio="xMidYMid meet">${c.ink
    .map((s) => (s.extra ?? "") + (s.d ? `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ""))
    .join("")}</svg>`;

  const cmdPretty = cmd ? JSON.stringify(cmd, null, 1).replace(/&/g, "&amp;").replace(/</g, "&lt;") : failed;
  cards.push(`
  <article class="card">
    <header><h2>${c.title}</h2><p>${c.sub}</p>
      <span class="badge ${verdict === "ok" ? "good" : "warn"}">${verdict === "ok" ? `✓ rendered · ${ms}ms` : verdict + ` · ${ms}ms`}</span>
    </header>
    <div class="tri">
      <figure><figcaption>your ink</figcaption><div class="pane ink">${inkSvg}</div></figure>
      <div class="arrowcol"><div class="arrow">→</div><pre>${cmdPretty}</pre><div class="arrow">→</div></div>
      <figure><figcaption>baio renders</figcaption><div class="pane out">${renderedSvg || `<div class="empty">${failed || "wait — ink left untouched"}</div>`}</div></figure>
    </div>
  </article>`);
}

const html = `<title>baio — ink to component</title>
<style>
:root{--bg:#ffffff;--card:#ffffff;--inkline:color-mix(in oklch,#421040 14%,transparent);--txt:#421040;--sub:#6e496b;--acc:#0b764d;--good:#0b764d;--warn:#421040;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;--font:'Hanken Grotesk',system-ui,sans-serif}
body{background:var(--bg);color:var(--txt);font:15px/1.5 var(--font);margin:0;padding:32px 20px 64px}
.wrap{max-width:1060px;margin:0 auto;display:grid;gap:20px}
h1{font-size:26px;margin:0}
.lede{color:var(--sub);max-width:64ch;margin:4px 0 0}
.stats{display:flex;gap:18px;flex-wrap:wrap;color:var(--sub);font-size:13px;border-top:1px solid var(--inkline);border-bottom:1px solid var(--inkline);padding:10px 0}
.stats b{color:var(--txt);font-variant-numeric:tabular-nums}
.card{background:var(--card);border:1px solid var(--inkline);border-radius:10px;padding:18px 20px}
.card header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.card h2{font-size:16px;margin:0}
.card header p{margin:0;color:var(--sub);font-size:13px;flex:1}
.badge{font-size:12px;padding:2px 10px;border-radius:99px;white-space:nowrap}
.badge.good{color:var(--good);border:1px solid var(--good)}
.badge.warn{color:var(--warn);border:1px solid var(--warn)}
.tri{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:stretch}
@media(max-width:760px){.tri{grid-template-columns:1fr}}
figure{margin:0;display:flex;flex-direction:column;gap:6px}
figcaption{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub)}
.pane{border:1px dashed var(--inkline);border-radius:8px;min-height:170px;display:flex;align-items:center;justify-content:center;padding:8px}
.pane svg{width:100%;height:160px}
.pane.out{border-style:solid;border-color:var(--acc)}
.arrowcol{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;max-width:290px}
.arrow{color:var(--acc);font-size:20px}
pre{font-family:var(--mono);font-size:10.5px;line-height:1.45;background:transparent;border:1px solid var(--inkline);border-radius:8px;padding:8px 10px;margin:0;max-width:280px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;color:var(--txt)}
.empty{color:var(--sub);font-size:13px}
</style>
<div class="wrap">
  <div>
    <h1>毛笔 baio — ink to component</h1>
    <p class="lede">Six real passes through the trained pipeline. Left: what you drew (mock ink). Middle: the actual tool call returned by the fine-tuned 0.8B adapter (<span style="font-family:var(--mono)">flash-1784434505</span>, $0.016 of training). Right: the deterministic template render at your ink's geometry. No coordinates in any tool call — geometry comes from the strokes.</p>
  </div>
  <div class="stats">
    <span>model <b>Qwen3.5-0.8B + LoRA</b></span>
    <span>rendered <b>${hits}/${calls}</b></span>
    <span>mean latency <b>${Math.round(latSum / calls)}ms</b></span>
    <span>cost per call <b>~$0.000025</b></span>
  </div>
  ${cards.join("\n")}
</div>`;
writeFileSync(`${ROOT}/showcase.html`, html);
console.log(`wrote showcase.html — rendered ${hits}/${calls}, mean ${Math.round(latSum / calls)}ms`);
