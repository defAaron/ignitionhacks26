/**
 * Builder selection + graceful degradation (ai-pipeline.md §7 — "the demo can
 * never hard-fail: every hop degrades to something that works").
 *
 *   BUILDER=freesolo  -> FreeSolo adapter, falling back to the Gemini
 *                        baseline, falling back to all-wait
 *   BUILDER=baseline  -> Gemini baseline, falling back to all-wait (default)
 *
 * Two contracts, same chain shape:
 *   getBuilder()      -> legacy components-v1 (pre-pivot, flash-1784430057)
 *   getShapeBuilder() -> shapes-v1 (shapes-first pivot — the live one)
 *
 * The all-wait terminal output is contract-valid abstention on every
 * detection: the client simply leaves the ink alone.
 */

import type { ComponentsOutputV1, ShapesOutput } from "../../types/schemas";
import { BaselineBuilder } from "./baseline";
import { BaselineShapesBuilder, BaselineShapesV3Builder } from "./baselineShapes";
import { FreesoloBuilder } from "./freesolo";
import type {
  BuilderClient,
  BuilderInput,
  ShapeBuilderClient,
  ShapeBuilderInput,
} from "./types";

export { BaselineBuilder } from "./baseline";
export { BaselineShapesBuilder } from "./baselineShapes";
export { FreesoloBuilder, resolveSchemaContract } from "./freesolo";
export type { SchemaContract } from "./freesolo";
export { BuilderError } from "./types";
export type {
  Artboard,
  BuilderClient,
  BuilderDetection,
  BuilderInput,
  ShapeBuilderClient,
  ShapeBuilderDetection,
  ShapeBuilderInput,
  TreeComponentSummary,
} from "./types";

/** Contract-valid "do nothing" output: one wait per detection (legacy). */
export function buildAllWaitOutput(
  input: BuilderInput,
  reason = "builder_unavailable"
): ComponentsOutputV1 {
  return {
    schema_version: "1.0",
    components: input.detections.map((d) => ({
      op: "wait" as const,
      from: d.id,
      reason,
    })),
  };
}

/** Contract-valid "do nothing" output: one wait per detection (shapes-v1). */
export function buildAllWaitShapesOutput(
  input: ShapeBuilderInput,
  reason = "builder_unavailable"
): ShapesOutput {
  return {
    schema_version: "shapes-1.0",
    components: input.detections.map((d) => ({
      op: "wait" as const,
      from: d.id,
      reason,
    })),
  };
}

/**
 * Tries each builder in order; if every one throws, returns the all-wait
 * output instead of propagating (the pipeline degrades, never hard-fails).
 */
class FallbackBuilder implements BuilderClient {
  constructor(private readonly chain: ReadonlyArray<{ name: string; client: BuilderClient }>) {}

  async buildComponents(input: BuilderInput): Promise<ComponentsOutputV1> {
    for (const { name, client } of this.chain) {
      try {
        return await client.buildComponents(input);
      } catch (e) {
        console.warn(`[models] builder "${name}" failed, falling back:`, (e as Error).message);
      }
    }
    return buildAllWaitOutput(input);
  }
}

/** Same degradation ladder, shapes-v1 contract. */
class FallbackShapeBuilder implements ShapeBuilderClient {
  constructor(
    private readonly chain: ReadonlyArray<{ name: string; client: ShapeBuilderClient }>
  ) {}

  async buildShapes(input: ShapeBuilderInput): Promise<ShapesOutput> {
    for (const { name, client } of this.chain) {
      try {
        return await client.buildShapes(input);
      } catch (e) {
        console.warn(`[models] shape builder "${name}" failed, falling back:`, (e as Error).message);
      }
    }
    return buildAllWaitShapesOutput(input);
  }
}

/**
 * Choose the LEGACY builder chain from BUILDER ("baseline" default |
 * "freesolo"). Pre-pivot contract; kept for the flash-1784430057 run.
 */
export function getBuilder(): BuilderClient {
  const choice = (process.env.BUILDER || "baseline").toLowerCase();
  if (choice === "freesolo") {
    return new FallbackBuilder([
      { name: "freesolo", client: new FreesoloBuilder("legacy") },
      { name: "baseline", client: new BaselineBuilder() },
    ]);
  }
  if (choice !== "baseline") {
    console.warn(`[models] unknown BUILDER "${choice}", using baseline`);
  }
  return new FallbackBuilder([{ name: "baseline", client: new BaselineBuilder() }]);
}

/**
 * Choose the SHAPES builder chain from BUILDER ("baseline" default |
 * "freesolo") — same fallback shape as getBuilder():
 * freesolo -> baseline-shapes -> all-wait.
 */
export function getShapeBuilder(): ShapeBuilderClient {
  const choice = (process.env.BUILDER || "baseline").toLowerCase();
  // Wave-3 promotion: serving input carries `parent`, so both the adapter and
  // the baseline speak the containment contract (README §1.6).
  if (choice === "freesolo") {
    return new FallbackShapeBuilder([
      { name: "freesolo", client: new FreesoloBuilder("shapes") },
      { name: "baseline-shapes-v3", client: new BaselineShapesV3Builder() },
    ]);
  }
  if (choice !== "baseline") {
    console.warn(`[models] unknown BUILDER "${choice}", using baseline`);
  }
  return new FallbackShapeBuilder([
    { name: "baseline-shapes-v3", client: new BaselineShapesV3Builder() },
  ]);
}
