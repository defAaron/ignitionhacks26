/**
 * Shared types for the three-gate validator pipeline (ai-pipeline.md §4 stage:
 * schema -> geometric -> domain). All gates are pure functions over the frozen
 * contract types in types/schemas.ts.
 */

import type { ComponentsOutput } from "../../types/schemas";

export type Wave = 1 | 2;

export type GateName = "schema" | "geometric" | "domain";

export interface ValidationIssue {
  gate: GateName;
  /** Stable machine-readable code, e.g. "out_of_bounds", "unknown_from". */
  code: string;
  /** Human-readable explanation. */
  message: string;
  /** Index into output.components, when the issue is about one command. */
  command_index?: number;
  /** The command's `from` detection id, when known. */
  from?: string;
}

/**
 * Context the geometric and domain gates check against. Structurally minimal
 * so any richer object (e.g. a full BuilderInput) can be passed.
 */
export interface ValidationCtx {
  /** Artboard/canvas dimensions in px. */
  canvas: { width: number; height: number };
  /** The detections this output must answer 1:1 (ids are what `from` binds to). */
  detections: ReadonlyArray<{ id: string }>;
  /** Existing tree components (ids are what `replaces` may reference). */
  existingTree?: ReadonlyArray<{ id: string; op: string }>;
}

export type ValidationResult =
  | { ok: true; output: ComponentsOutput }
  | { ok: false; gate: GateName; issues: ValidationIssue[] };
