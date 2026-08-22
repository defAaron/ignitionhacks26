/**
 * Gate 2 — geometric. Pure checks over an already-schema-valid output:
 *
 * - every op-command bbox lies within the artboard (small tolerance)
 * - width/height are positive and sane (>= 4px, <= artboard dimension)
 * - `from` references an existing detection id
 * - exactly one command per detection — the 1:1 rule (no duplicates,
 *   no missed detections, no hallucinated `from`)
 * - `replaces`, when present, references an existing tree component id
 *
 * Numeric bounds live here, not in the grammar (shared/schemas/README.md,
 * "deliberate grammar-level omissions").
 */

import type { ComponentsOutput } from "../../types/schemas";
import type { ValidationCtx, ValidationIssue } from "./types";

/** Commands may spill this many px outside the artboard before failing. */
export const BOUNDS_TOLERANCE_PX = 8;
/** Anything thinner/shorter than this is noise, not a component. */
export const MIN_DIMENSION_PX = 4;

export function geometricGate(output: ComponentsOutput, ctx: ValidationCtx): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (code: string, message: string, index?: number, from?: string) =>
    issues.push({
      gate: "geometric",
      code,
      message,
      ...(index !== undefined ? { command_index: index } : {}),
      ...(from !== undefined ? { from } : {}),
    });

  const detectionIds = new Set(ctx.detections.map((d) => d.id));
  const treeIds = new Set((ctx.existingTree ?? []).map((c) => c.id));
  const { width: aw, height: ah } = ctx.canvas;
  const tol = BOUNDS_TOLERANCE_PX;

  const fromCounts = new Map<string, number>();

  output.components.forEach((cmd, i) => {
    // -- `from` must reference a real detection (holds for waits too) --------
    if (!detectionIds.has(cmd.from)) {
      push(
        "unknown_from",
        `command[${i}] (op "${cmd.op}") references unknown detection "${cmd.from}" (hallucination)`,
        i,
        cmd.from
      );
    }
    fromCounts.set(cmd.from, (fromCounts.get(cmd.from) ?? 0) + 1);

    if (cmd.op === "wait") return; // waits carry no geometry

    // -- finite numbers ------------------------------------------------------
    const nums: Array<[string, number]> = [
      ["x", cmd.x],
      ["y", cmd.y],
      ["width", cmd.width],
      ["height", cmd.height],
    ];
    for (const [name, v] of nums) {
      if (!Number.isFinite(v)) {
        push("non_finite", `command[${i}] (op "${cmd.op}") ${name} is not a finite number`, i, cmd.from);
        return; // remaining geometry checks are meaningless
      }
    }

    // -- size sanity ---------------------------------------------------------
    if (cmd.width <= 0 || cmd.height <= 0) {
      push(
        "non_positive_size",
        `command[${i}] (op "${cmd.op}") has non-positive size ${cmd.width}x${cmd.height}`,
        i,
        cmd.from
      );
    } else {
      if (cmd.width < MIN_DIMENSION_PX || cmd.height < MIN_DIMENSION_PX) {
        push(
          "degenerate_size",
          `command[${i}] (op "${cmd.op}") is smaller than ${MIN_DIMENSION_PX}px (${cmd.width}x${cmd.height})`,
          i,
          cmd.from
        );
      }
      if (cmd.width > aw + tol || cmd.height > ah + tol) {
        push(
          "oversized",
          `command[${i}] (op "${cmd.op}") ${cmd.width}x${cmd.height} exceeds the ${aw}x${ah} artboard`,
          i,
          cmd.from
        );
      }
    }

    // -- artboard bounds (with tolerance) ------------------------------------
    if (
      cmd.x < -tol ||
      cmd.y < -tol ||
      cmd.x + cmd.width > aw + tol ||
      cmd.y + cmd.height > ah + tol
    ) {
      push(
        "out_of_bounds",
        `command[${i}] (op "${cmd.op}") bbox [${cmd.x}, ${cmd.y}, ${cmd.width}, ${cmd.height}] ` +
          `falls outside the ${aw}x${ah} artboard (tolerance ${tol}px)`,
        i,
        cmd.from
      );
    }

    // -- replaces must point at a real tree component ------------------------
    if (cmd.replaces !== undefined && !treeIds.has(cmd.replaces)) {
      push(
        "unknown_replaces",
        `command[${i}] (op "${cmd.op}") replaces unknown tree component "${cmd.replaces}"`,
        i,
        cmd.from
      );
    }
  });

  // -- the 1:1 rule ----------------------------------------------------------
  for (const [from, count] of fromCounts) {
    if (count > 1 && detectionIds.has(from)) {
      push("duplicate_from", `detection "${from}" is answered by ${count} commands (must be exactly 1)`, undefined, from);
    }
  }
  for (const id of detectionIds) {
    if (!fromCounts.has(id)) {
      push("missed_detection", `detection "${id}" has no command (must have exactly 1; use "wait" to abstain)`, undefined, id);
    }
  }

  return issues;
}
