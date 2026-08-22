/**
 * Randomized guide-box generation for the labeler.
 * The guide box IS the gold bbox (ai-pipeline.md §6), so per-label sizing
 * hints keep it sensible: navbar glyph = wide short near top, night_sky =
 * large upper region, line/arrow = wide short anywhere, smooth_path = large
 * anywhere, etc. Default = medium anywhere.
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./labels";

export interface GuideBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Region = "top" | "upper" | "middle" | "lower" | "bottom" | "left" | "anywhere";

interface GuideHint {
  w: [number, number];
  h: [number, number];
  region: Region;
}

const DEFAULT_HINT: GuideHint = { w: [260, 520], h: [160, 340], region: "anywhere" };

const WIDE_SHORT_SMALL: GuideHint = { w: [240, 460], h: [44, 84], region: "anywhere" };
const MEDIUM_LARGE: GuideHint = { w: [360, 680], h: [220, 400], region: "anywhere" };

const HINTS: Record<string, GuideHint> = {
  // base shapes
  line: { w: [300, 700], h: [44, 130], region: "anywhere" },
  arrow: { w: [280, 640], h: [60, 180], region: "anywhere" },
  text: { w: [280, 540], h: [50, 110], region: "anywhere" },
  smooth_path: { w: [320, 680], h: [240, 440], region: "anywhere" },
  // glyph components (box + letter needs room for the glyph)
  navbar: { w: [720, 984], h: [48, 88], region: "top" },
  button: { w: [110, 220], h: [42, 80], region: "anywhere" },
  // web-ui bench
  footer: { w: [720, 984], h: [90, 170], region: "bottom" },
  hero: { w: [620, 920], h: [260, 430], region: "top" },
  text_input: WIDE_SHORT_SMALL,
  search_bar: WIDE_SHORT_SMALL,
  dropdown: WIDE_SHORT_SMALL,
  newsletter_signup: { w: [340, 620], h: [50, 100], region: "anywhere" },
  cta_banner: { w: [520, 920], h: [80, 160], region: "anywhere" },
  sidebar: { w: [160, 260], h: [420, 660], region: "left" },
  modal: { w: [360, 560], h: [240, 410], region: "middle" },
  table: { w: [420, 760], h: [220, 380], region: "anywhere" },
  card_grid: { w: [520, 920], h: [200, 360], region: "anywhere" },
  pricing_table: { w: [520, 900], h: [300, 480], region: "middle" },
  image_gallery: MEDIUM_LARGE,
  carousel: { w: [520, 900], h: [200, 340], region: "anywhere" },
  logo_cloud: { w: [520, 920], h: [70, 130], region: "anywhere" },
  map: MEDIUM_LARGE,
  // decorative
  wave_divider: { w: [620, 984], h: [70, 160], region: "middle" },
  layered_waves: { w: [620, 984], h: [110, 220], region: "lower" },
  night_sky: { w: [520, 920], h: [240, 430], region: "upper" },
  aurora_gradient: { w: [420, 840], h: [200, 380], region: "upper" },
  hero_glow: { w: [380, 720], h: [200, 360], region: "upper" },
  sparkles: { w: [140, 320], h: [100, 220], region: "anywhere" },
  squiggle_accents: { w: [140, 320], h: [100, 220], region: "anywhere" },
  hand_drawn_underline: { w: [160, 380], h: [40, 90], region: "anywhere" },
  hand_drawn_highlight: { w: [180, 380], h: [70, 150], region: "anywhere" },
  landscape_silhouette: { w: [560, 940], h: [160, 320], region: "lower" },
  confetti: MEDIUM_LARGE,
  shape_scatter: MEDIUM_LARGE,
  dot_grid: MEDIUM_LARGE,
  grid_lines: MEDIUM_LARGE,
  tiled_pattern: MEDIUM_LARGE,
  noise_grain: MEDIUM_LARGE,
  topo_contours: MEDIUM_LARGE,
  low_poly_mesh: MEDIUM_LARGE,
  concentric_rings: { w: [220, 460], h: [200, 420], region: "anywhere" },
  // diagrams
  timeline: { w: [560, 940], h: [80, 170], region: "anywhere" },
  gantt_chart: { w: [460, 820], h: [220, 380], region: "anywhere" },
  bar_chart: { w: [340, 640], h: [240, 420], region: "anywhere" },
  line_chart: { w: [340, 640], h: [240, 420], region: "anywhere" },
  scatter_plot: { w: [340, 640], h: [240, 420], region: "anywhere" },
  coordinate_plane: { w: [300, 560], h: [260, 460], region: "middle" },
  pie_chart: { w: [240, 440], h: [240, 420], region: "anywhere" },
  venn_diagram: { w: [320, 580], h: [240, 420], region: "anywhere" },
  pyramid_chart: { w: [300, 560], h: [260, 440], region: "anywhere" },
  funnel_chart: { w: [300, 540], h: [280, 460], region: "anywhere" },
  flowchart: { w: [420, 800], h: [280, 500], region: "anywhere" },
  org_chart: { w: [420, 800], h: [280, 480], region: "anywhere" },
  mind_map: { w: [420, 760], h: [300, 500], region: "middle" },
  cycle_diagram: { w: [340, 600], h: [300, 480], region: "middle" },
};

const MARGIN = 16;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

export function randomGuideBox(
  op: string,
  cw: number = CANVAS_WIDTH,
  ch: number = CANVAS_HEIGHT
): GuideBox {
  const hint = HINTS[op] ?? DEFAULT_HINT;
  const width = Math.round(clamp(rand(hint.w[0], hint.w[1]), 24, cw - 2 * MARGIN));
  const height = Math.round(clamp(rand(hint.h[0], hint.h[1]), 24, ch - 2 * MARGIN));

  const xMax = cw - width - MARGIN;
  const yMax = ch - height - MARGIN;

  let x: number;
  let y: number;

  switch (hint.region) {
    case "top":
      x = rand(MARGIN, xMax);
      y = rand(MARGIN, Math.min(64, yMax));
      break;
    case "upper":
      x = rand(MARGIN, xMax);
      y = rand(MARGIN, Math.min(ch * 0.4 - height, yMax));
      break;
    case "middle":
      x = rand(MARGIN, xMax);
      y = rand(ch * 0.22, Math.min(ch * 0.78 - height, yMax));
      break;
    case "lower":
      x = rand(MARGIN, xMax);
      y = rand(Math.min(ch * 0.5, yMax), yMax);
      break;
    case "bottom":
      x = rand(MARGIN, xMax);
      y = rand(Math.max(MARGIN, ch - height - 64), yMax);
      break;
    case "left":
      x = rand(MARGIN, Math.min(64, xMax));
      y = rand(MARGIN, yMax);
      break;
    case "anywhere":
    default:
      x = rand(MARGIN, xMax);
      y = rand(MARGIN, yMax);
      break;
  }

  return {
    x: Math.round(clamp(x, MARGIN, Math.max(MARGIN, xMax))),
    y: Math.round(clamp(y, MARGIN, Math.max(MARGIN, yMax))),
    width,
    height,
  };
}
