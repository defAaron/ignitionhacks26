/**
 * Prompted-baseline builder: Gemini standing in behind the same frozen
 * contract the FreeSolo adapter serves (ai-pipeline.md §7 — "the baseline is
 * the demo" if no adapter wins). Text-only: it receives BuilderInput JSON,
 * never pixels.
 *
 * Structured output via Gemini's responseSchema (OpenAPI-style dialect, no
 * $refs) mirroring shared/schemas/components-v1.json; output is still parsed
 * through schemaGate — the zod mirror is the actual line of defense.
 */

import { OPS_V1, type ComponentsOutputV1 } from "../../types/schemas";
import { schemaGate } from "../validate/schema";
import { callGeminiJsonOnce } from "./geminiTransport";
import { BuilderError, type BuilderClient, type BuilderInput } from "./types";

// ---------------------------------------------------------------------------
// System prompt — the baio builder rules (ai-pipeline.md §3.1, §3.3)
// ---------------------------------------------------------------------------

const BUILDER_SYSTEM_PROMPT = `You are the baio builder ("the hands"). You receive a JSON object:
{"artboard": {width, height}, "tree_summary": [existing components: {id, op, x, y, width, height}], "detections": [{id, type, confidence, alternates?, label_text, bbox}]}
and you emit component commands as JSON: {"schema_version": "1.0", "components": [...]}.

RULES — follow every one:

1. EXACTLY ONE COMMAND PER DETECTION, no exceptions. Every command's "from" is
   the id of the detection it answers. Never invent a command with no source
   detection; never leave a detection unanswered; never answer one detection
   twice. Keep components in the same order as the detections.

2. ABSTAIN WHEN UNSURE: if a detection's confidence is below 0.65, or its type
   conflicts hopelessly with its geometry, emit a wait-command instead of
   guessing: {"op": "wait", "from": "<detection id>", "reason": "low_confidence"}.

3. COPY-THEN-SNAP GEOMETRY: start from the detection's bbox and copy it
   through, then apply disciplined snapping:
   - navbar: x=0, y=0, full artboard width, height ~64 (56-80)
   - footer: x=0, full artboard width, bottom edge at the artboard bottom
   - button: keep x/y/width, snap height to 40, 48, or 56 (always within 24-96)
   - wave_divider and other full-bleed decorative bands: stretch to full width
   - everything must stay inside the artboard: 0 <= x, y and
     x+width <= artboard.width, y+height <= artboard.height
   Small fractional coordinates are fine. Never move a component far from its
   detection bbox except for the snaps above.

4. LABEL ROUTING: when a detection has non-null "label_text" and the op takes
   text, set "label" to exactly that text (button label, heading text,
   text_input placeholder). Omit "label" when label_text is null or the op
   takes no text. Never invent label text.

5. LAYERS: structural ops (navbar, footer, button, heading, paragraph, image,
   hero, form, text_input, card, card_grid, search_bar, dropdown) -> "content".
   Backdrop decoratives (wave_divider, night_sky, blob, aurora_gradient) ->
   "background". Floating accents (sparkles) -> "overlay".

6. TREE AWARENESS: if a command's bbox substantially overlaps an existing
   tree_summary component OF THE SAME OP, set "replaces" to that component's id
   (update, not duplicate). Otherwise omit "replaces". Never reference an id
   that is not in tree_summary.

7. MINIMALITY: emit only what the detections demand — no extra components, no
   decorative flourishes that were not drawn, no params beyond the op's
   conventions. Decorative ops may carry "params" with a numeric "seed" plus
   their documented knobs (wave_divider: amplitude, layers, flip; night_sky:
   density, size_range, cluster_bias; sparkles: count, size_range, spread_zone;
   blob: points, irregularity, fill; aurora_gradient: palette, blob_count,
   blur_radius). Structural ops normally carry no params.

8. Mint each op-command's "id" as a fresh short id ("c1", "c2", ... continuing
   past any ids already in tree_summary).

Output JSON only, exactly matching the schema.`;

// ---------------------------------------------------------------------------
// Response schema — Gemini dialect mirror of shared/schemas/components-v1.json
// ---------------------------------------------------------------------------

/** Open-object `params` flattened to its documented conventional keys (Gemini
 * requires non-empty `properties` for OBJECT schemas; the contract's open
 * object stays open at the zod/JSON-schema level). */
const PARAMS_SCHEMA = {
  type: "object",
  properties: {
    seed: { type: "number" },
    amplitude: { type: "number" },
    layers: { type: "number" },
    flip: { type: "boolean" },
    density: { type: "number" },
    cluster_bias: { type: "number" },
    count: { type: "number" },
    points: { type: "number" },
    irregularity: { type: "number" },
    blob_count: { type: "number" },
    blur_radius: { type: "number" },
    size_range: { type: "array", items: { type: "number" } },
    spread_zone: { type: "string" },
    fill: { type: "string" },
    palette: { type: "string" },
    variant: { type: "string" },
  },
} as const;

const COMPONENTS_V1_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    schema_version: { type: "string", enum: ["1.0"] },
    components: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            properties: {
              op: { type: "string", enum: [...OPS_V1] },
              id: { type: "string" },
              from: { type: "string" },
              layer: { type: "string", enum: ["background", "content", "overlay"] },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              label: { type: "string" },
              params: PARAMS_SCHEMA,
              replaces: { type: "string" },
            },
            required: ["op", "id", "from", "layer", "x", "y", "width", "height"],
            propertyOrdering: [
              "op", "id", "from", "layer", "x", "y", "width", "height",
              "label", "params", "replaces",
            ],
          },
          {
            type: "object",
            properties: {
              op: { type: "string", enum: ["wait"] },
              from: { type: "string" },
              reason: { type: "string" },
            },
            required: ["op", "from", "reason"],
            propertyOrdering: ["op", "from", "reason"],
          },
        ],
      },
    },
  },
  required: ["schema_version", "components"],
  propertyOrdering: ["schema_version", "components"],
} as const;

// ---------------------------------------------------------------------------
// Client (transport shared with baselineShapes.ts via geminiTransport.ts)
// ---------------------------------------------------------------------------

async function callGeminiOnce(input: BuilderInput): Promise<string> {
  return callGeminiJsonOnce({
    systemPrompt: BUILDER_SYSTEM_PROMPT,
    userText: JSON.stringify(input),
    responseSchema: COMPONENTS_V1_RESPONSE_SCHEMA,
    builderName: "baseline",
  });
}

/** Gemini-as-baseline-builder behind the frozen wave-1 contract. */
export class BaselineBuilder implements BuilderClient {
  async buildComponents(input: BuilderInput): Promise<ComponentsOutputV1> {
    let lastIssues = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await callGeminiOnce(input);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        lastIssues = `JSON parse error: ${(e as Error).message}`;
        continue;
      }
      const gated = schemaGate(json, 1);
      if (gated.ok) return gated.output as ComponentsOutputV1;
      lastIssues = gated.issues.map((i) => i.message).join("; ");
    }
    throw new BuilderError(
      `Baseline builder output failed schema gate after retry: ${lastIssues}`,
      "baseline"
    );
  }
}
