import { shapesPack } from "@/lib/packs/shapes/registry";
import { diagramsPack } from "@/lib/packs/diagrams/registry";
import { mulberry32, type PathPoint, type ShapeTemplateProps } from "@/lib/packs/shapes/types";

/** Op → template across packs (op ids never collide between packs). */
const RENDERERS = { ...shapesPack, ...diagramsPack };

export const metadata = { title: "baio — Shapes Gallery" };

const PAD = 14;

interface Variant {
  note: string;
  frame: { w: number; h: number };
  props: ShapeTemplateProps;
}
interface Entry {
  op: string;
  glyph?: string;
  variants: Variant[];
}

const v = (
  w: number,
  h: number,
  note: string,
  params?: Record<string, unknown>,
  path?: PathPoint[]
): Variant => ({
  note,
  frame: { w, h },
  props: { bbox: { x: PAD, y: PAD, width: w - PAD * 2, height: h - PAD * 2 }, params, path },
});

/* ---- deterministic ink paths (frame coords) — stand-ins for smoothed source strokes ---- */

const seg = (x1: number, y1: number, x2: number, y2: number): PathPoint[] => [
  { x: x1, y: y1 },
  { x: x2, y: y2 },
];

/** Flame silhouette, tip up; endpoints land near each other so the curve closes. */
const FLAME_N: Array<[number, number]> = [
  [0.5, 0.04], [0.63, 0.2], [0.57, 0.34], [0.73, 0.45], [0.81, 0.63],
  [0.72, 0.83], [0.5, 0.94], [0.28, 0.83], [0.19, 0.63], [0.27, 0.45],
  [0.43, 0.34], [0.37, 0.2], [0.48, 0.07],
];
const flamePath = (w: number, h: number): PathPoint[] =>
  FLAME_N.map(([nx, ny]) => ({ x: PAD + nx * (w - PAD * 2), y: PAD + ny * (h - PAD * 2) }));

/** Hand-jittered 5-point star (seeded — never Math.random). */
const starPath = (w: number, h: number, seed: number): PathPoint[] => {
  const rng = mulberry32(seed);
  const cx = w / 2;
  const cy = h / 2;
  const rOuter = Math.min(w, h) / 2 - PAD;
  const rInner = rOuter * 0.45;
  const pts: PathPoint[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5 + (rng() - 0.5) * 0.07;
    const r = (i % 2 === 0 ? rOuter : rInner) * (1 + (rng() - 0.5) * 0.12);
    pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
  }
  pts.push({ x: pts[0].x + 2, y: pts[0].y + 2 }); // land near the start → closes
  return pts;
};

/** Open sine squiggle — proves open smooth_path stays a stroke. */
const squigglePath = (w: number, h: number): PathPoint[] => {
  const pts: PathPoint[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push({
      x: PAD + t * (w - PAD * 2),
      y: h / 2 + Math.sin(t * Math.PI * 3) * (h / 2 - PAD) * 0.8,
    });
  }
  return pts;
};

/* ---- the taste-pass grid ---- */

const SHAPES: Entry[] = [
  {
    op: "rect",
    variants: [
      v(200, 140, "plain — crisp ink outline"),
      v(160, 160, "filled, rounded (snap: square)", { fill: "#4f6ef7", radius: 12 }),
      v(240, 120, "diagonal gradient", {
        gradient: { colors: ["#4f6ef7", "#9f7bff"], direction: "diagonal" },
        radius: 10,
      }),
    ],
  },
  {
    op: "ellipse",
    variants: [
      v(200, 130, "plain outline"),
      v(150, 150, "filled circle (snap: square)", { fill: "#38d9c3" }),
      v(220, 150, "radial gradient", {
        gradient: { colors: ["#ffd68f", "#f76e6e"], direction: "radial" },
      }),
    ],
  },
  {
    op: "line",
    variants: [
      v(260, 60, "straightened horizontal", undefined, seg(PAD, 30, 246, 30)),
      v(200, 150, "free diagonal, thick accent", { stroke: { color: "#4f6ef7", width: 5 } }, seg(PAD, 136, 186, PAD)),
    ],
  },
  {
    op: "arrow",
    variants: [
      v(260, 70, "straightened, ink", undefined, seg(PAD, 35, 246, 35)),
      v(200, 150, "up-right, colored", { stroke: { color: "#f76e6e", width: 4 } }, seg(PAD, 136, 186, PAD)),
    ],
  },
  {
    op: "text",
    variants: [
      v(280, 52, "body size from small bbox", { text: "Sketch it. Ship it." }),
      v(320, 96, "heading weight from tall bbox", { text: "Big idea" }),
      v(260, 64, "colored, centered", { text: "baio", fill: "#4f6ef7", align: "center" }),
    ],
  },
  {
    op: "smooth_path",
    variants: [
      v(200, 240, "flame silhouette · fire gradient", {
        gradient: { colors: ["#f76e6e", "#f5a623"], direction: "down" },
      }, flamePath(200, 240)),
      v(220, 220, "hand-drawn star · solid fill", { fill: "#f5a623" }, starPath(220, 220, 6)),
      v(280, 120, "open squiggle stays a stroke", { stroke: { color: "#1a1a1a", width: 3 } }, squigglePath(280, 120)),
    ],
  },
];

const GLYPHS: Entry[] = [
  { op: "image", glyph: "box + i", variants: [v(230, 160, "photo placeholder", { variant: "photo" })] },
  { op: "form", glyph: "box + f", variants: [v(290, 260, "2 fields, routed submit label", { fields: 2, label: "Sign in" })] },
  {
    op: "button",
    glyph: "box + b",
    variants: [
      v(180, 62, "solid, routed label", { label: "Get started" }),
      v(180, 62, "gradient", { fill: "gradient", colors: ["#4f6ef7", "#9f7bff"], label: "Upgrade" }),
    ],
  },
  { op: "navbar", glyph: "box + n", variants: [v(500, 66, "snap: full_width_top, routed brand", { links: 3, label: "Acme" })] },
  {
    op: "video",
    glyph: "box + v",
    variants: [v(300, 180, "16:9 player frame"), v(190, 130, "small player")],
  },
  { op: "placeholder", glyph: "box + ?", variants: [v(210, 150, "dashed slot")] },
];

const DECORATIVE: Entry[] = [
  {
    op: "wave_divider",
    variants: [
      v(500, 110, "calm", { amplitude: 18, layers: 3, seed: 2 }),
      v(500, 110, "tall, flipped", { amplitude: 30, layers: 4, flip: true, seed: 9 }),
    ],
  },
  {
    op: "night_sky",
    variants: [
      v(500, 200, "sparse, clustered up", { density: 0.35, cluster_bias: 0.7, seed: 2 }),
      v(500, 200, "dense", { density: 0.9, size_range: [0.5, 2.4], cluster_bias: 0.4, seed: 9 }),
    ],
  },
  {
    op: "sparkles",
    variants: [
      v(250, 150, "few", { count: 7, seed: 4 }),
      v(250, 150, "many, larger", { count: 14, size_range: [4, 16], spread: 1, seed: 21 }),
    ],
  },
  {
    op: "aurora_gradient",
    variants: [
      v(500, 200, "aurora palette", { palette: "aurora", blob_count: 4, seed: 4 }),
      v(500, 200, "sunset palette", { palette: "sunset", blob_count: 5, seed: 11 }),
    ],
  },
];

const DIAGRAMS: Entry[] = [
  {
    op: "bar_chart",
    variants: [
      v(300, 190, "seeded default bars", { seed: 3 }),
      v(300, 190, "explicit values + labels", { values: [42, 68, 31, 90, 55], labels: ["Mon", "Tue", "Wed", "Thu", "Fri"] }),
    ],
  },
  {
    op: "pie_chart",
    variants: [
      v(180, 180, "square, seeded wedges", { seed: 5 }),
      v(300, 170, "wide bbox → side legend", { values: [40, 25, 20, 15], labels: ["Chrome", "Safari", "Edge", "Other"] }),
    ],
  },
  {
    op: "venn_diagram",
    variants: [
      v(280, 180, "2 sets, custom labels", { labels: ["Design", "Code"] }),
      v(260, 230, "3 sets", { sets: 3 }),
    ],
  },
  {
    op: "timeline",
    variants: [
      v(420, 130, "4 generic milestones"),
      v(460, 140, "5 custom events", { events: ["Idea", "Prototype", "Alpha", "Beta", "Launch"] }),
    ],
  },
  {
    op: "periodic_table",
    variants: [
      v(600, 330, "full 18×7 + f-block lookup"),
      v(600, 330, "noble gases highlighted", { highlight: ["He", "Ne", "Ar", "Kr", "Xe", "Rn", "Og"] }),
    ],
  },
  {
    op: "atomic_structure",
    variants: [
      v(220, 220, "2 shells", { shells: 2, seed: 4 }),
      v(260, 260, "4 shells", { shells: 4, seed: 9 }),
    ],
  },
];

const GROUPS: Array<{ title: string; blurb: string; entries: Entry[] }> = [
  {
    title: "Shapes",
    blurb: "The 6 base ops — every stroke-set becomes one of these unless a glyph or decorative signature says otherwise. Geometry (bbox, path) arrives from the ink; the renderer only makes it crisp. smooth_path keeps the user's own silhouette — the flame below is the fire-shape demo.",
    entries: SHAPES,
  },
  {
    title: "Glyph components",
    blurb: "Semantics are opt-in: a single letter alone inside a box picks the component; nearby handwriting routes to its label param.",
    entries: GLYPHS,
  },
  {
    title: "Decorative",
    blurb: "The model emits {op, from, params}; the renderer owns the beauty. Every variant is seeded — re-rolling the seed live is a demo beat.",
    entries: DECORATIVE,
  },
  {
    title: "Diagrams (pack 2)",
    blurb:
      "Chart + lookup ops on the same shapes contract: geometry from ink, precision from code. periodic_table is the lookup-asset proof — a real 18×7 main block plus separated f-block lanes, category-tinted, with symbols auto-hidden below 9px cells. Everything seeded and deterministic.",
    entries: DIAGRAMS,
  },
];

const checker: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #ececef 25%, transparent 25%), linear-gradient(-45deg, #ececef 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ececef 75%), linear-gradient(-45deg, transparent 75%, #ececef 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
  backgroundColor: "#fafafa",
};

export default function GalleryPage() {
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const sans = "var(--font-ui, ui-sans-serif, system-ui, sans-serif)";
  return (
    <main style={{ fontFamily: sans, color: "#1a1a1a", background: "#fff", minHeight: "100vh", padding: "40px 48px 80px" }}>
      <header style={{ maxWidth: 900, marginBottom: 40 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
          Shapes Pack — Taste-Pass Gallery
        </h1>
        <p style={{ color: "#555", lineHeight: 1.6, marginTop: 12 }}>
          Checkpoint review for the shapes-first pivot: all 16 ops of{" "}
          <code style={{ fontFamily: mono }}>shapes-v1</code> (<code style={{ fontFamily: mono }}>vocabulary.md</code> §1).
          The canvas primitive is the <strong>shape</strong>, not the website component — users draw approximate
          shapes and baio makes them crisp and styled; components exist only behind opt-in glyphs. The model
          emits <code style={{ fontFamily: mono }}>{"{op, from, params, snap}"}</code> and <strong>no coordinates</strong>:
          every bbox and path below stands in for geometry derived from ink. All randomness is seeded, so every
          frame is fully deterministic. Flag anything that fails the taste bar. (The pre-pivot 18-component
          web-ui gallery lives in git history; its pack still backs the glyph components.)
        </p>
      </header>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9a9aa0", margin: "32px 0 4px" }}>
            {group.title} ({group.entries.length} ops)
          </h2>
          <p style={{ color: "#777", fontSize: 13, lineHeight: 1.55, maxWidth: 820, margin: "0 0 16px" }}>{group.blurb}</p>
          {group.entries.map((entry) => (
            <div key={entry.op} style={{ marginBottom: 36 }}>
              <h3 style={{ fontFamily: mono, fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>
                {entry.op}
                {entry.glyph && (
                  <span style={{ marginLeft: 10, fontSize: 11.5, fontWeight: 500, color: "#fff", background: "#4f6ef7", borderRadius: 999, padding: "2px 9px", verticalAlign: "middle" }}>
                    {entry.glyph}
                  </span>
                )}
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
                {entry.variants.map((variant, i) => (
                  <figure key={i} style={{ margin: 0 }}>
                    <div style={{ ...checker, border: "1px solid #e2e2e5", borderRadius: 10, overflow: "hidden", lineHeight: 0 }}>
                      <svg width={variant.frame.w} height={variant.frame.h} viewBox={`0 0 ${variant.frame.w} ${variant.frame.h}`}>
                        {RENDERERS[entry.op](variant.props)}
                      </svg>
                    </div>
                    <figcaption style={{ fontFamily: mono, fontSize: 10.5, color: "#777", marginTop: 6, maxWidth: variant.frame.w, overflowWrap: "anywhere" }}>
                      {variant.note}
                      {variant.props.params ? ` · ${JSON.stringify(variant.props.params)}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
