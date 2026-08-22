/**
 * The full 73-op label set for the baio labeler (shapes-first).
 *
 * Source of truth: docs/architecture/label-tree.md (grouping + phases) and
 * docs/architecture/vocabulary.md §3 (Phase-1 menu order by expected drawing
 * volume).
 *
 * Array order IS the menu order and the Tab order: Phase 1 first — the
 * shapes-v1 16 (base shapes → glyph components → decorative, vocabulary.md §3
 * order) — then the Phase-2 bench in label-tree order (web-ui components →
 * decorative → diagrams).
 *
 * Wave 1.5 (shapes-v2, 2026-07-19): six diagram ops are PROMOTED into the
 * live builder vocabulary (PHASE15_OPS below) — bar_chart, pie_chart,
 * venn_diagram, timeline from the bench, plus the new periodic_table and
 * atomic_structure. They keep `phase: 2` here (the labeler-record contract
 * enumerates phases 1|2; their calibration/golden reps live in the phase-2
 * pool) but are grammar-live in shapes-v2.json. PHASE1_OPS/PHASE1_COUNT are
 * unchanged (16).
 */

export type LabelGroup =
  | "base shapes"
  | "glyph components"
  | "decorative"
  | "web-ui components"
  | "diagrams";

export interface LabelDef {
  op: string;
  group: LabelGroup;
  phase: 1 | 2;
  sketchHint: string;
}

const B = "base shapes" as const;
const C = "glyph components" as const;
const D = "decorative" as const;
const W = "web-ui components" as const;
const G = "diagrams" as const;

export const LABELS: readonly LabelDef[] = [
  // ── Phase 1: base shapes (vocabulary.md §3 order) ────────────────────
  { op: "rect", group: B, phase: 1, sketchHint: "wobbly 4-sided box, roughly closed" },
  { op: "ellipse", group: B, phase: 1, sketchHint: "closed convex roundish curve" },
  { op: "line", group: B, phase: 1, sketchHint: "single open low-curvature stroke" },
  { op: "arrow", group: B, phase: 1, sketchHint: "line with chevron/triangle head at one end" },
  { op: "text", group: B, phase: 1, sketchHint: "handwriting — a word, phrase, or sentence" },
  { op: "smooth_path", group: B, phase: 1, sketchHint: "freeform doodle, kept as drawn (smoothed)" },
  // ── Phase 1: glyph components — a single letter alone inside a box ───
  { op: "button", group: C, phase: 1, sketchHint: "box + b (word nearby → its label)" },
  { op: "image", group: C, phase: 1, sketchHint: "box + i" },
  { op: "form", group: C, phase: 1, sketchHint: "box + f" },
  { op: "navbar", group: C, phase: 1, sketchHint: "box + n (wide, near the top)" },
  { op: "video", group: C, phase: 1, sketchHint: "box + v" },
  { op: "placeholder", group: C, phase: 1, sketchHint: "box + ?" },
  // ── Phase 1: decorative (vocabulary.md §3 order) ─────────────────────
  { op: "wave_divider", group: D, phase: 1, sketchHint: "long free curved-crest squiggle at section edge" },
  { op: "sparkles", group: D, phase: 1, sketchHint: "small 4-point asterisk scribbles near text" },
  { op: "night_sky", group: D, phase: 1, sketchHint: "dark rect + scattered dots/asterisks" },
  { op: "aurora_gradient", group: D, phase: 1, sketchHint: "loose overlapping scribbled ovals in hero region" },
  // ── Phase 2 bench: web-ui components (label-tree.md order) ───────────
  { op: "footer", group: W, phase: 2, sketchHint: "wide bottom band, 2–4 columns of short lines" },
  { op: "card", group: W, phase: 2, sketchHint: "bordered box: image area + text lines + button" },
  { op: "card_grid", group: W, phase: 2, sketchHint: "2–4 identical rects side by side" },
  { op: "hero", group: W, phase: 2, sketchHint: "large top block: big text + button + image area" },
  { op: "search_bar", group: W, phase: 2, sketchHint: "rect with magnifier at one end" },
  { op: "dropdown", group: W, phase: 2, sketchHint: "rect with caret ▼ at right edge" },
  { op: "text_input", group: W, phase: 2, sketchHint: "empty wide rect, label above/left" },
  { op: "cta_banner", group: W, phase: 2, sketchHint: "short wide band: one text line + one button" },
  { op: "tabs", group: W, phase: 2, sketchHint: "row of labels (one highlighted) above a panel" },
  { op: "modal", group: W, phase: 2, sketchHint: "centered box over dimmed page, X in corner" },
  { op: "accordion", group: W, phase: 2, sketchHint: "stacked bars each with +/chevron at right" },
  { op: "carousel", group: W, phase: 2, sketchHint: "wide box, side chevrons, dot row below" },
  { op: "table", group: W, phase: 2, sketchHint: "ruled grid with distinct header row" },
  { op: "sidebar", group: W, phase: 2, sketchHint: "tall narrow column of stacked lines/icons" },
  { op: "testimonial", group: W, phase: 2, sketchHint: "quote marks + text + circle avatar + name" },
  { op: "logo_cloud", group: W, phase: 2, sketchHint: "single row of small varied boxes/marks" },
  { op: "newsletter_signup", group: W, phase: 2, sketchHint: "one input directly beside one button" },
  { op: "pricing_table", group: W, phase: 2, sketchHint: "2–4 tall columns: big number, list, button" },
  { op: "image_gallery", group: W, phase: 2, sketchHint: "grid of image boxes, no text lines" },
  { op: "map", group: W, phase: 2, sketchHint: "box with a location pin / wiggly region lines" },
  // ── Phase 2 bench: decorative (label-tree.md order) ──────────────────
  { op: "dot_grid", group: D, phase: 2, sketchHint: "faint matrix of dots" },
  { op: "grid_lines", group: D, phase: 2, sketchHint: "graph-paper line grid" },
  { op: "hero_glow", group: D, phase: 2, sketchHint: "big radial glow blob behind headline" },
  { op: "layered_waves", group: D, phase: 2, sketchHint: "multiple stacked wave bands" },
  { op: "hand_drawn_underline", group: D, phase: 2, sketchHint: "sketchy stroke under a word" },
  { op: "hand_drawn_highlight", group: D, phase: 2, sketchHint: "sketchy circle/box/marker around a word" },
  { op: "shape_scatter", group: D, phase: 2, sketchHint: "scattered circles/polygons backdrop" },
  { op: "confetti", group: D, phase: 2, sketchHint: "colorful rotated rects/ribbons" },
  { op: "concentric_rings", group: D, phase: 2, sketchHint: "fading circle outlines radiating from a point" },
  { op: "squiggle_accents", group: D, phase: 2, sketchHint: "zigzags/springs/crosses floating near headings" },
  { op: "landscape_silhouette", group: D, phase: 2, sketchHint: "layered mountain/cloud silhouettes" },
  { op: "tiled_pattern", group: D, phase: 2, sketchHint: "repeating subtle icon/geometric tile" },
  { op: "noise_grain", group: D, phase: 2, sketchHint: "film-grain texture overlay (param-triggered)" },
  { op: "topo_contours", group: D, phase: 2, sketchHint: "nested wavy contour-map lines" },
  { op: "low_poly_mesh", group: D, phase: 2, sketchHint: "triangulated gradient background" },
  // ── Phase 2 bench: diagrams (label-tree.md order) ────────────────────
  // ★1.5 = promoted to wave 1.5 (shapes-v2 grammar-live); see PHASE15_OPS.
  { op: "bar_chart", group: G, phase: 2, sketchHint: "3–6 vertical rects, shared baseline, often L-axes" }, // ★1.5
  { op: "venn_diagram", group: G, phase: 2, sketchHint: "2–3 overlapping circles" }, // ★1.5
  { op: "flowchart", group: G, phase: 2, sketchHint: "box→diamond→box chains + arrows" },
  { op: "timeline", group: G, phase: 2, sketchHint: "long horizontal line with 3+ ticks/dots" }, // ★1.5
  { op: "line_chart", group: G, phase: 2, sketchHint: "L-axes + zigzag trend stroke" },
  { op: "pie_chart", group: G, phase: 2, sketchHint: "circle with 2+ radial lines from center" }, // ★1.5
  { op: "periodic_table", group: G, phase: 2, sketchHint: "wide grid of many small rects, letters in cells" }, // ★1.5 (new)
  { op: "atomic_structure", group: G, phase: 2, sketchHint: "small filled circle + concentric rings with dots" }, // ★1.5 (new)
  { op: "table_grid", group: G, phase: 2, sketchHint: "crossing horizontal/vertical lines" },
  { op: "org_chart", group: G, phase: 2, sketchHint: "boxes in layers, connecting lines" },
  { op: "quadrant_chart", group: G, phase: 2, sketchHint: "large + inside a box" },
  { op: "scatter_plot", group: G, phase: 2, sketchHint: "axes + scattered dots" },
  { op: "funnel_chart", group: G, phase: 2, sketchHint: "stack of narrowing trapezoids" },
  { op: "cycle_diagram", group: G, phase: 2, sketchHint: "circle of boxes with arced arrows" },
  { op: "pyramid_chart", group: G, phase: 2, sketchHint: "triangle with horizontal layer lines" },
  { op: "coordinate_plane", group: G, phase: 2, sketchHint: "crossed axes with arrowheads" },
  { op: "mind_map", group: G, phase: 2, sketchHint: "hub with spokes to blobs" },
  { op: "gantt_chart", group: G, phase: 2, sketchHint: "staggered horizontal bars" },
  { op: "sequence_diagram", group: G, phase: 2, sketchHint: "parallel lifelines + horizontal arrows" },
  { op: "block_diagram", group: G, phase: 2, sketchHint: "nested labeled boxes, arbitrary topology" },
  { op: "state_diagram", group: G, phase: 2, sketchHint: "rounded states + transition arrows" },
  { op: "er_diagram", group: G, phase: 2, sketchHint: "entity boxes + crow's-foot lines" },
];

export const GROUPS: readonly LabelGroup[] = [B, C, D, W, G];

/**
 * Labels whose variation checklist requires ≥1 save with a non-black color.
 * Gradient/fill reps matter most here (a gradient-filled smooth_path is the
 * old blob; colors feed the vision layer's colors/gradient_direction signal).
 */
export const COLOR_RELEVANT_OPS: readonly string[] = [
  "rect",
  "ellipse",
  "smooth_path",
  "night_sky",
  "aurora_gradient",
  "sparkles",
];

export const PHASE1_OPS: readonly string[] = LABELS.filter((l) => l.phase === 1).map((l) => l.op);

export const PHASE1_COUNT = PHASE1_OPS.length; // 16

/**
 * Wave 1.5 ("phase 1.5"): the six diagram ops promoted into the live
 * shapes-v2 builder vocabulary (order mirrors OPS_SHAPES_V2_DIAGRAMS in
 * types/schemas.ts). Still labeled within the phase-2 pool — this list marks
 * which bench labels are already grammar-live.
 */
export const PHASE15_OPS: readonly string[] = [
  "bar_chart",
  "pie_chart",
  "venn_diagram",
  "timeline",
  "periodic_table",
  "atomic_structure",
];

export const PHASE15_COUNT = PHASE15_OPS.length; // 6 (16 + 6 = the shapes-v2 22)

/** Style prompt cycle for variation coverage: rep n asks for STYLE_CYCLE[n % 3]. */
export const STYLE_CYCLE = ["sloppy", "neat", "free"] as const;
export type StylePrompt = (typeof STYLE_CYCLE)[number];

/** Fixed 9-swatch ink palette; number keys 1–9. 1 = black (default). */
export const PALETTE: readonly { name: string; hex: string }[] = [
  { name: "black", hex: "#000000" },
  { name: "red", hex: "#dc2626" },
  { name: "orange", hex: "#ea580c" },
  { name: "yellow", hex: "#eab308" },
  { name: "green", hex: "#16a34a" },
  { name: "blue", hex: "#2563eb" },
  { name: "purple", hex: "#7c3aed" },
  { name: "pink", hex: "#db2777" },
  { name: "gray", hex: "#6b7280" },
];

export const CANVAS_WIDTH = 1024;
export const CANVAS_HEIGHT = 768;
