// Logic block v1 — the wiring builder OUTPUT.
// TS mirror of shared/schemas/logic-v1.json. Keep the two structurally identical
// (schema drift is the failure the shared-schema discipline exists to prevent).

export type Trigger =
  | "onClick"
  | "onSubmit"
  | "onLoad"
  | "onChange"
  | "onResult"
  | "onTimer";

export type OutputType = "data" | "page";

export interface BlockOutput {
  /** `data` writes a cell; `page` navigates (the href). */
  type: OutputType;
  /** Cell name (for `data`) or page id/address (for `page`). */
  to: string;
}

/** A stateless function answering one drawn arrow. Reads cells, runs on a trigger, emits one output. */
export interface LogicBlock {
  /** Id of the arrow/connection this block answers (ties output to source, as `from` does in shapes). */
  from: string;
  /** Names of the cells this block reads. */
  inputs: string[];
  trigger: Trigger;
  /** Generated pseudo-code. State lives in cells, never here. */
  body: string;
  output: BlockOutput;
  note?: string;
}

/** Calibrated abstention: Gemini could not resolve what the arrow connects. */
export interface WaitBlock {
  from: string;
  status: "unresolved";
  reason: string;
}

export type WireBlock = LogicBlock | WaitBlock;

export interface WireOutput {
  schema_version: "logic-1.0";
  block: WireBlock;
}

export function isWaitBlock(b: WireBlock): b is WaitBlock {
  return (b as WaitBlock).status === "unresolved";
}

// ---------------------------------------------------------------------------
// The /api/wire contract (request + two-stage pipeline).
// ---------------------------------------------------------------------------

/** A compact view of one element — an arrow endpoint or a nearby element. */
export interface WireEndpoint {
  /** Stable element id (`e_…` / `p_…`); the wire stores these, not geometry. */
  id: string;
  /** ElementKind string (button, form, text, image, page, …). */
  kind: string;
  /** User label/content, when any. */
  text?: string;
}

/** One drawn arrow to be interpreted into a logic block. */
export interface WireRequest {
  /** Id of the drawn arrow this wire answers. */
  arrowId: string;
  source: WireEndpoint;
  target: WireEndpoint;
  /** Nearby elements, for context. */
  neighbors?: WireEndpoint[];
  /** Cell names already on the canvas, so the block can reuse them. */
  cells?: string[];
}

/** Stage 1 (Gemini): what the arrow connects, in plain structured terms. */
export interface WireIntent {
  /** navigate | submit | fetch | store | call-api | compute … */
  relation: string;
  /** Plain-English description of the connection. */
  summary: string;
  trigger: Trigger;
  outputType: OutputType;
  /** Suggested cell name (data) or page id (page). */
  outputTo: string;
  /** Suggested input cell names. */
  inputs: string[];
}

export type WireResponse =
  | { ok: true; output: WireOutput }
  | { ok: false; reason: string };
