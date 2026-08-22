/** Shared types between the labeler UI and /api/labels. */

import type { StylePrompt } from "./labels";

export interface StrokePoint {
  x: number;
  y: number;
  t: number; // ms since the stroke started
}

export interface Stroke {
  id: string;
  points: StrokePoint[];
  color: string;
  width: number;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelRecord {
  id: string;
  label: string;
  phase: 1 | 2;
  split: "calibration" | "golden";
  guide_bbox: BBox;
  canvas: { width: number; height: number };
  strokes: Stroke[];
  colors_used: string[];
  style_prompt: StylePrompt;
  png_path: string;
  created_at: string;
}

/** POST body = the record plus the rendered PNG (stripped before writing JSONL). */
export interface LabelPostBody extends LabelRecord {
  png_base64: string;
}

/** Per-label aggregate returned by GET /api/labels so the UI restores progress. */
export interface LabelCounts {
  saves: number;
  sloppy: number;
  neat: number;
  free: number;
  nonBlack: number;
  calibration: number;
  golden: number;
}

export interface LabelsGetResponse {
  counts: Record<string, LabelCounts>;
}

export const EMPTY_COUNTS: LabelCounts = {
  saves: 0,
  sloppy: 0,
  neat: 0,
  free: 0,
  nonBlack: 0,
  calibration: 0,
  golden: 0,
};

export function isNonBlack(color: string): boolean {
  const c = color.trim().toLowerCase();
  return c !== "#000000" && c !== "#000" && c !== "black";
}

/** Checklist status for one label (ai-pipeline.md §6 variation coverage). */
export function checklistDone(
  counts: LabelCounts | undefined,
  colorRelevant: boolean
): boolean {
  if (!counts) return false;
  return (
    counts.saves >= 3 &&
    counts.sloppy >= 1 &&
    counts.neat >= 1 &&
    (!colorRelevant || counts.nonBlack >= 1)
  );
}
