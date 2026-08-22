/**
 * Gate 3 — domain. Semantic per-op conventions over a schema- and
 * geometry-valid output:
 *
 * - op ∈ the active wave's whitelist (belt-and-braces on top of the schema
 *   gate's enum, per shared/schemas/README.md enforcement point 1)
 * - navbar/footer near full width; navbar near top, footer near bottom
 * - button height within the standard 24–96px band
 * - heading/paragraph aspect ratios sane (text blocks are wider than tall)
 * - decorative `params` values have the expected primitive types when present
 *   (per-op key sets are conventions, README "per-op params conventions")
 */

import { OPS_V1, OPS_V2, type ComponentsOutput, type OpCommandV2 } from "../../types/schemas";
import type { ValidationCtx, ValidationIssue, Wave } from "./types";

// Tunable conventions ---------------------------------------------------------

const FULL_WIDTH_RATIO = 0.9; // navbar/footer must span >= 90% of the artboard
const NEAR_EDGE_RATIO = 0.15; // navbar top / footer bottom must sit in the outer 15%
const BUTTON_HEIGHT_MIN = 24;
const BUTTON_HEIGHT_MAX = 96;
const HEADING_MIN_ASPECT = 1.5; // width / height
const PARAGRAPH_MIN_ASPECT = 0.5;

// params typing conventions (README §1 "per-op params conventions") -----------

const NUMERIC_PARAM_KEYS = new Set([
  "amplitude",
  "layers",
  "seed",
  "density",
  "cluster_bias",
  "count",
  "points",
  "irregularity",
  "blob_count",
  "blur_radius",
]);
const BOOLEAN_PARAM_KEYS = new Set(["flip"]);
const STRING_PARAM_KEYS = new Set(["spread_zone", "fill", "variant"]);
/** Arrays of numbers. */
const NUMBER_ARRAY_PARAM_KEYS = new Set(["size_range", "values"]);
/** `palette` may be a named palette (string) or an explicit color list. */
const STRING_OR_ARRAY_PARAM_KEYS = new Set(["palette", "colors"]);

function checkParams(cmd: OpCommandV2, index: number, push: PushFn): void {
  if (!cmd.params) return;
  for (const [key, value] of Object.entries(cmd.params)) {
    if (NUMERIC_PARAM_KEYS.has(key)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        push("bad_param_type", `command[${index}] (op "${cmd.op}") params.${key} must be a number, got ${typeof value}`, index, cmd.from);
      }
    } else if (BOOLEAN_PARAM_KEYS.has(key)) {
      if (typeof value !== "boolean") {
        push("bad_param_type", `command[${index}] (op "${cmd.op}") params.${key} must be a boolean, got ${typeof value}`, index, cmd.from);
      }
    } else if (STRING_PARAM_KEYS.has(key)) {
      if (typeof value !== "string") {
        push("bad_param_type", `command[${index}] (op "${cmd.op}") params.${key} must be a string, got ${typeof value}`, index, cmd.from);
      }
    } else if (NUMBER_ARRAY_PARAM_KEYS.has(key)) {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
        push("bad_param_type", `command[${index}] (op "${cmd.op}") params.${key} must be an array of numbers`, index, cmd.from);
      }
    } else if (STRING_OR_ARRAY_PARAM_KEYS.has(key)) {
      const ok =
        typeof value === "string" ||
        (Array.isArray(value) && value.every((v) => typeof v === "string"));
      if (!ok) {
        push("bad_param_type", `command[${index}] (op "${cmd.op}") params.${key} must be a string or array of strings`, index, cmd.from);
      }
    }
    // Unknown keys pass: params is an open object at the grammar level.
  }
}

type PushFn = (code: string, message: string, index?: number, from?: string) => void;

export function domainGate(
  output: ComponentsOutput,
  ctx: ValidationCtx,
  wave: Wave = 1
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push: PushFn = (code, message, index, from) =>
    issues.push({
      gate: "domain",
      code,
      message,
      ...(index !== undefined ? { command_index: index } : {}),
      ...(from !== undefined ? { from } : {}),
    });

  const whitelist: ReadonlySet<string> = new Set(wave === 1 ? OPS_V1 : OPS_V2);
  const { width: aw, height: ah } = ctx.canvas;

  output.components.forEach((cmd, i) => {
    if (cmd.op === "wait") return;

    // -- wave whitelist ------------------------------------------------------
    if (!whitelist.has(cmd.op)) {
      push("op_not_in_wave", `command[${i}] op "${cmd.op}" is not in the wave-${wave} whitelist`, i, cmd.from);
      return; // per-op rules below assume a known op
    }

    switch (cmd.op) {
      case "navbar": {
        if (cmd.width < FULL_WIDTH_RATIO * aw) {
          push("navbar_not_full_width", `command[${i}] navbar width ${cmd.width} < ${FULL_WIDTH_RATIO * 100}% of artboard (${aw})`, i, cmd.from);
        }
        if (cmd.y > NEAR_EDGE_RATIO * ah) {
          push("navbar_not_at_top", `command[${i}] navbar y=${cmd.y} is not near the top (must be <= ${NEAR_EDGE_RATIO * ah})`, i, cmd.from);
        }
        break;
      }
      case "footer": {
        if (cmd.width < FULL_WIDTH_RATIO * aw) {
          push("footer_not_full_width", `command[${i}] footer width ${cmd.width} < ${FULL_WIDTH_RATIO * 100}% of artboard (${aw})`, i, cmd.from);
        }
        if (cmd.y + cmd.height < (1 - NEAR_EDGE_RATIO) * ah) {
          push("footer_not_at_bottom", `command[${i}] footer bottom ${cmd.y + cmd.height} is not near the bottom of the ${ah}px artboard`, i, cmd.from);
        }
        break;
      }
      case "button": {
        if (cmd.height < BUTTON_HEIGHT_MIN || cmd.height > BUTTON_HEIGHT_MAX) {
          push("button_height", `command[${i}] button height ${cmd.height} outside the ${BUTTON_HEIGHT_MIN}-${BUTTON_HEIGHT_MAX}px band`, i, cmd.from);
        }
        break;
      }
      case "heading": {
        if (cmd.height > 0 && cmd.width / cmd.height < HEADING_MIN_ASPECT) {
          push("heading_aspect", `command[${i}] heading aspect ${(cmd.width / cmd.height).toFixed(2)} < ${HEADING_MIN_ASPECT} (headings are wide text lines)`, i, cmd.from);
        }
        break;
      }
      case "paragraph": {
        if (cmd.height > 0 && cmd.width / cmd.height < PARAGRAPH_MIN_ASPECT) {
          push("paragraph_aspect", `command[${i}] paragraph aspect ${(cmd.width / cmd.height).toFixed(2)} < ${PARAGRAPH_MIN_ASPECT} (implausibly tall/narrow)`, i, cmd.from);
        }
        break;
      }
      default:
        break;
    }

    checkParams(cmd, i, push);
  });

  return issues;
}
