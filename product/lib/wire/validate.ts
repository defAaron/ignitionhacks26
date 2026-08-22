// Validate a Haiku logic-block payload against the logic-1.0 contract.
// The frozen JSON Schema lives at shared/schemas/logic-v1.json; this is the
// runtime line of defense (the model can drift; the gate cannot). Mirrors the
// role shapesSchemaGate plays for the shapes pipeline.

import type { WireOutput, WireResponse, Trigger, OutputType } from "./types";

const TRIGGERS: Trigger[] = [
  "onClick",
  "onSubmit",
  "onLoad",
  "onChange",
  "onResult",
  "onTimer",
];
const OUTPUT_TYPES: OutputType[] = ["data", "page"];

/** Strip an optional ```json … ``` fence and surrounding prose. */
function stripJsonFence(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start > 0 || (end !== -1 && end < s.length - 1)) {
    if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  }
  return s.trim();
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Parse + structurally validate the wiring builder output. */
export function validateWireOutput(raw: string): WireResponse {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonFence(raw));
  } catch {
    return { ok: false, reason: "logic block was not valid JSON" };
  }

  const root = json as Record<string, unknown>;
  if (root?.schema_version !== "logic-1.0") {
    return { ok: false, reason: 'missing schema_version "logic-1.0"' };
  }
  const block = root.block as Record<string, unknown> | undefined;
  if (!block || typeof block !== "object") {
    return { ok: false, reason: "missing block" };
  }
  if (typeof block.from !== "string" || !block.from) {
    return { ok: false, reason: "block.from must be a non-empty string" };
  }

  // Abstention branch.
  if (block.status === "unresolved") {
    if (typeof block.reason !== "string") {
      return { ok: false, reason: "wait block needs a reason" };
    }
    return { ok: true, output: json as WireOutput };
  }

  // Logic block branch.
  if (!isStringArray(block.inputs)) {
    return { ok: false, reason: "block.inputs must be a string array" };
  }
  if (!TRIGGERS.includes(block.trigger as Trigger)) {
    return { ok: false, reason: `block.trigger must be one of ${TRIGGERS.join(", ")}` };
  }
  if (typeof block.body !== "string") {
    return { ok: false, reason: "block.body must be a string" };
  }
  const output = block.output as Record<string, unknown> | undefined;
  if (!output || !OUTPUT_TYPES.includes(output.type as OutputType)) {
    return { ok: false, reason: "block.output.type must be data or page" };
  }
  if (typeof output.to !== "string" || !output.to) {
    return { ok: false, reason: "block.output.to must be a non-empty string" };
  }

  return { ok: true, output: json as WireOutput };
}
