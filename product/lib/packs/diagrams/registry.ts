import type { ShapeTemplate } from "../shapes/types";
import { bar_chart } from "./bar_chart";
import { pie_chart } from "./pie_chart";
import { venn_diagram } from "./venn_diagram";
import { timeline } from "./timeline";
import { periodic_table } from "./periodic_table";
import { atomic_structure } from "./atomic_structure";

/** Diagrams pack (pack 2): chart + lookup ops on the same ShapeTemplate contract as shapes-v1. */
export const diagramsPack: Record<string, ShapeTemplate> = {
  bar_chart,
  pie_chart,
  venn_diagram,
  timeline,
  periodic_table,
  atomic_structure,
};

export const DIAGRAM_OPS = Object.keys(diagramsPack);
