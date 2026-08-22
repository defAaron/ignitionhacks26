// Prompts + schemas for the two-stage wiring pipeline.
//   Stage 1 (Gemini): analyze what the drawn arrow connects  -> WireIntent
//   Stage 2 (Haiku):  write the logic block                  -> WireOutput (logic-1.0)
// The two-stage split mirrors the shapes pipeline: the vision/analysis model
// reports intent, the builder writes the structured artifact. Neither emits
// geometry — the arrow's endpoints are already resolved to element ids.

import type { WireIntent, WireRequest, WireEndpoint } from "./types";

const TRIGGERS = ["onClick", "onSubmit", "onLoad", "onChange", "onResult", "onTimer"];

// ---------------------------------------------------------------------------
// Stage 1 — Gemini analysis
// ---------------------------------------------------------------------------

/** Gemini responseSchema (OpenAPI-style dialect, lowercase types, no $ref). */
export const WIRE_INTENT_SCHEMA = {
  type: "object",
  properties: {
    relation: { type: "string" },
    summary: { type: "string" },
    trigger: { type: "string", enum: TRIGGERS },
    outputType: { type: "string", enum: ["data", "page"] },
    outputTo: { type: "string" },
    inputs: { type: "array", items: { type: "string" } },
  },
  required: ["relation", "summary", "trigger", "outputType", "outputTo", "inputs"],
};

export const WIRE_ANALYZE_SYSTEM = `You are the baio wiring analyzer ("the eyes for logic"). A user drew an ARROW connecting two on-canvas elements. Report what the connection MEANS as JSON.

baio's model: cells hold data (dumb), arrows are wires (dumb), blocks are stateless FUNCTIONS (the only logic). A block reads cells (inputs), runs on a trigger, and produces ONE output whose TYPE carries meaning: "data" writes a cell, "page" navigates (the href).

Given the arrow's source and target element, decide:
- relation: a short verb for the connection — navigate | submit | fetch | store | call-api | compute.
- summary: one plain-English sentence describing what should happen.
- trigger: WHEN it fires, from the source element's nature:
    button -> onClick; form -> onSubmit; text/input -> onChange; page -> onLoad;
    an api/result source -> onResult; a periodic source -> onTimer.
- outputType: "page" when the TARGET is a page (this is navigation); otherwise "data".
- outputTo: for "page", the target element's id; for "data", a SHORT camelCase cell name derived from the source (e.g. userMsg, searchQuery, savedRecord). Reuse an existing cell name when one clearly fits.
- inputs: cell names the block reads. Derive concise camelCase names from the source element (its text or kind). Reuse existing cells when relevant. Empty array if none.

RULES:
- Target is a page => outputType "page", outputTo = target id, relation "navigate".
- Never invent behavior unrelated to the two connected elements.
- Cell names: short, camelCase, no spaces.
Output JSON only, matching the schema.`;

function describe(e: WireEndpoint): string {
  const label = e.text ? ` "${e.text}"` : "";
  return `${e.kind}${label} (id ${e.id})`;
}

export function buildWireAnalyzeUser(req: WireRequest): string {
  const lines = [
    `arrow id: ${req.arrowId}`,
    `source element: ${describe(req.source)}`,
    `target element: ${describe(req.target)}`,
  ];
  if (req.neighbors?.length) {
    lines.push(`nearby elements: ${req.neighbors.map(describe).join("; ")}`);
  }
  lines.push(`existing cells: ${req.cells?.length ? req.cells.join(", ") : "(none)"}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Stage 2 — Haiku generation
// ---------------------------------------------------------------------------

export const WIRE_GENERATE_SYSTEM = `You write ONE baio logic block as JSON conforming to the logic-1.0 contract. You receive the two connected elements and an analysis of the connection. Emit JSON only — no prose, no code fences.

Shape:
{"schema_version":"logic-1.0","block":{"from":"<arrowId>","inputs":["<cell>",...],"trigger":"<trigger>","body":"<pseudo-code>","output":{"type":"data"|"page","to":"<cell-or-pageId>"}}}

RULES:
- The block is a STATELESS function. State lives in cells; never store state in the block.
- inputs = the cell names the block reads (from the analysis).
- trigger = one of: onClick, onSubmit, onLoad, onChange, onResult, onTimer.
- body = SHORT pseudo-code (1-4 lines) describing the transform or effect, referencing input cells by name. For navigation, body is simply "navigate to <target>".
- output.type = "data" (writes a cell named in output.to) or "page" (navigates to the page id in output.to).
- from = the given arrow id, verbatim.
- If the connection is genuinely ambiguous or cannot be resolved, emit instead:
  {"schema_version":"logic-1.0","block":{"from":"<arrowId>","status":"unresolved","reason":"<why>"}}
Output the JSON object and nothing else.`;

export function buildWireGenerateUser(req: WireRequest, intent: WireIntent): string {
  return [
    `arrow id: ${req.arrowId}`,
    `source element: ${describe(req.source)}`,
    `target element: ${describe(req.target)}`,
    ``,
    `analysis:`,
    `  relation: ${intent.relation}`,
    `  summary: ${intent.summary}`,
    `  trigger: ${intent.trigger}`,
    `  outputType: ${intent.outputType}`,
    `  outputTo: ${intent.outputTo}`,
    `  inputs: ${intent.inputs.length ? intent.inputs.join(", ") : "(none)"}`,
  ].join("\n");
}
