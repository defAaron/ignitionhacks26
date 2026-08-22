/**
 * The three-gate validator (ai-pipeline.md §4: schema -> geometric -> domain).
 *
 * `validate` runs the gates in order and FAILS CLOSED: the first gate with
 * issues rejects the output, with all of that gate's issues collected. Only an
 * output that clears all three gates reaches the renderer.
 */

import { schemaGate } from "./schema";
import { geometricGate } from "./geometric";
import { domainGate } from "./domain";
import type { ValidationCtx, ValidationResult, Wave } from "./types";

export { schemaGate } from "./schema";
export type { SchemaGateResult } from "./schema";
export { geometricGate, BOUNDS_TOLERANCE_PX, MIN_DIMENSION_PX } from "./geometric";
export { domainGate } from "./domain";
export type { GateName, ValidationCtx, ValidationIssue, ValidationResult, Wave } from "./types";

// Shapes-first pivot (2026-07-18): the shapes-v1 validator. Note it has NO
// geometric gate — the shapes contract has no coordinates to check (geometry
// derives deterministically from ink); see lib/validate/shapes.ts.
export {
  legalOpsForDetection,
  shapesCoverageGate,
  shapesSchemaGate,
  shapesSemanticGate,
  validateShapes,
} from "./shapes";
export type {
  ShapeGateName,
  ShapesSchemaGateResult,
  ShapeValidationCtx,
  ShapeValidationIssue,
  ShapeValidationResult,
} from "./shapes";

/**
 * Validate raw builder output against the active wave's contract and the
 * request context. Pure; never throws on bad input — bad input is the point.
 */
export function validate(output: unknown, ctx: ValidationCtx, wave: Wave): ValidationResult {
  const schema = schemaGate(output, wave);
  if (!schema.ok) return { ok: false, gate: "schema", issues: schema.issues };

  const geoIssues = geometricGate(schema.output, ctx);
  if (geoIssues.length > 0) return { ok: false, gate: "geometric", issues: geoIssues };

  const domainIssues = domainGate(schema.output, ctx, wave);
  if (domainIssues.length > 0) return { ok: false, gate: "domain", issues: domainIssues };

  return { ok: true, output: schema.output };
}
