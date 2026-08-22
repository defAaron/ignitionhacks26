/**
 * FreeSolo builder client — the trained Qwen3.5-0.8B LoRA adapter served
 * behind an OpenAI-compatible endpoint (`flash deploy` -> openai_base_url).
 *
 * Coded to the documented contract (ai-pipeline.md §4.4, §7;
 * shared/schemas/README.md enforcement point 3): chat.completions with the
 * frozen schema as per-request `response_format` json_schema — the exact file
 * from shared/schemas/, never an inline copy.
 *
 * SCHEMA CONTRACT (shapes-first pivot, 2026-07-18): the client serves one of
 * two frozen contracts, chosen by constructor arg or SCHEMA_CONTRACT env
 * (legacy|shapes, default shapes):
 *   - "shapes"  -> shared/schemas/shapes-v1.json  via buildShapes()
 *   - "legacy"  -> shared/schemas/components-v1.json via buildComponents()
 *                  (retained for the flash-1784430057 run)
 * Calling the method of the OTHER contract throws: sending the wrong grammar
 * to an adapter trained on the other one would produce garbage silently.
 *
 * Not live until an adapter is deployed; until then any call fails with
 * BuilderError and the fallback wrapper (index.ts) routes to the baseline.
 */

import componentsV1Json from "../../shared/schemas/components-v1.json";
import shapesV3Json from "../../shared/schemas/shapes-v3.json";
import type { ComponentsOutputV1, ShapesOutput } from "../../types/schemas";
import { schemaGate } from "../validate/schema";
import { shapesSchemaGate } from "../validate/shapes";
import {
  BuilderError,
  type BuilderClient,
  type BuilderInput,
  type ShapeBuilderClient,
  type ShapeBuilderInput,
} from "./types";

export type SchemaContract = "legacy" | "shapes";

/**
 * Serving-grammar tightening. The frozen contract keeps `params` an open object
 * (domain validator owns key conventions), but an open object is a HOLE in the
 * guided-decoding grammar: the undertrained model floods it with junk keys and
 * the engine's any-JSON subgrammar occasionally emits malformed output there
 * (verified live: parse failures always inside params). For SERVING ONLY we
 * substitute a closed params schema with the documented conventional keys —
 * same precedent as the Gemini baseline's flattening. The frozen file and the
 * validators are unchanged: anything this grammar permits, the open contract
 * permits too.
 */
const TIGHT_PARAMS = {
  type: "object",
  additionalProperties: false,
  properties: {
    fill: { type: "string" },
    label: { type: "string" },
    text: { type: "string" },
    gradient: {
      type: "object",
      additionalProperties: false,
      properties: {
        colors: { type: "array", items: { type: "string" }, maxItems: 4 },
        direction: { type: "string", enum: ["down", "right", "diagonal", "radial"] },
      },
      required: ["colors", "direction"],
    },
    stroke: {
      type: "object",
      additionalProperties: false,
      properties: { color: { type: "string" }, width: { type: "number" } },
    },
    seed: { type: "number" },
    amplitude: { type: "number" },
    layers: { type: "number" },
    flip: { type: "boolean" },
    density: { type: "number" },
    size_range: { type: "array", items: { type: "number" }, maxItems: 2 },
    cluster_bias: { type: "number" },
    count: { type: "number" },
    spread_zone: { type: "string" },
    palette: { type: "array", items: { type: "string" }, maxItems: 5 },
    blob_count: { type: "number" },
    blur_radius: { type: "number" },
  },
} as const;

/**
 * Best-effort repair of malformed/truncated model JSON: walk back through the
 * text's closing braces and try closing the document at each, keeping the
 * longest prefix that parses. Returns null if nothing salvageable.
 */
function repairShapesJson(text: string): unknown {
  const closers = ["", "}", "}}", "]}", "}]}", "}}]}", '"}]}', '"}}]}'];
  for (let i = text.length; i > 40; i--) {
    const ch = text[i - 1];
    if (ch !== "}" && ch !== '"' && ch !== "]") continue;
    const prefix = text.slice(0, i).replace(/,\s*$/, "");
    for (const suffix of closers) {
      try {
        return JSON.parse(prefix + suffix);
      } catch {
        /* keep walking */
      }
    }
  }
  return null;
}

function tightenedShapesSchema(): unknown {
  // shapes-v3.json (22-op wave-3 grammar, output ≡ v2) defines the command via definitions.shape_command ($ref'd
  // from components.items.anyOf) — params lives there.
  const clone = JSON.parse(JSON.stringify(shapesV3Json)) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
  };
  const cmd = clone.definitions?.["shape_command"];
  if (cmd?.properties && "params" in cmd.properties) cmd.properties.params = TIGHT_PARAMS;
  return clone;
}

/** Contract choice from SCHEMA_CONTRACT env (legacy|shapes). Default: shapes. */
export function resolveSchemaContract(): SchemaContract {
  const raw = (process.env.SCHEMA_CONTRACT || "shapes").toLowerCase();
  if (raw === "legacy") return "legacy";
  if (raw !== "shapes") {
    console.warn(`[models] unknown SCHEMA_CONTRACT "${raw}", using shapes`);
  }
  return "shapes";
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
}

/** OpenAI-compatible chat.completions client for the deployed adapter. */
export class FreesoloBuilder implements BuilderClient, ShapeBuilderClient {
  readonly contract: SchemaContract;

  constructor(contract?: SchemaContract) {
    this.contract = contract ?? resolveSchemaContract();
  }

  /** Legacy components-v1 contract (pre-pivot; flash-1784430057). */
  async buildComponents(input: BuilderInput): Promise<ComponentsOutputV1> {
    if (this.contract !== "legacy") {
      throw new BuilderError(
        'buildComponents called on a "shapes"-contract FreesoloBuilder — construct it with new FreesoloBuilder("legacy") (or SCHEMA_CONTRACT=legacy) for the pre-pivot contract',
        "freesolo"
      );
    }
    const text = await this.complete(JSON.stringify(input), {
      name: "components_v1",
      schema: componentsV1Json,
    });

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new BuilderError(`FreeSolo output is not JSON: ${(e as Error).message}`, "freesolo");
    }
    const gated = schemaGate(json, 1);
    if (!gated.ok) {
      throw new BuilderError(
        `FreeSolo output failed schema gate: ${gated.issues.map((i) => i.message).join("; ")}`,
        "freesolo"
      );
    }
    return gated.output as ComponentsOutputV1;
  }

  /** Shapes-v1 contract (shapes-first pivot) — the live one. */
  async buildShapes(input: ShapeBuilderInput): Promise<ShapesOutput> {
    if (this.contract !== "shapes") {
      throw new BuilderError(
        'buildShapes called on a "legacy"-contract FreesoloBuilder — construct it with new FreesoloBuilder("shapes") (or SCHEMA_CONTRACT=shapes) for the shapes contract',
        "freesolo"
      );
    }
    // The serving stack's guided_json randomly fails to engage on a minority of
    // requests (verified live: 4/5 identical requests clean, 1/5 degenerate until
    // token cap). Truncation/parse/gate failures are therefore transient — retry.
    let lastErr: BuilderError | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      let text: string;
      try {
        text = await this.complete(JSON.stringify(input), {
          name: "shapes_v3",
          schema: tightenedShapesSchema(),
        });
      } catch (e) {
        lastErr = e instanceof BuilderError ? e : new BuilderError(String(e), "freesolo");
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        // The serving stack's guided_json does NOT reliably enforce a grammar
        // (verified live: malformed output with finish_reason=stop). Truncated /
        // unclosed output is repairable: trim back to the last complete command
        // object and close the document. The schema gate still judges the result.
        json = repairShapesJson(text);
        if (json === null) {
          lastErr = new BuilderError(`FreeSolo output is not JSON: ${(e as Error).message}`, "freesolo");
          continue;
        }
      }
      const gated = shapesSchemaGate(json);
      if (!gated.ok) {
        lastErr = new BuilderError(
          `FreeSolo output failed shapes schema gate: ${gated.issues.map((i) => i.message).join("; ")}`,
          "freesolo"
        );
        continue;
      }
      return gated.output;
    }
    throw lastErr ?? new BuilderError("FreeSolo builder failed after retries", "freesolo");
  }

  /** One chat.completions call under the given response_format json_schema. */
  private async complete(
    userContent: string,
    responseFormat: { name: string; schema: unknown }
  ): Promise<string> {
    const baseUrl = process.env.FREESOLO_BASE_URL;
    const apiKey = process.env.FREESOLO_API_KEY;
    const model = process.env.FREESOLO_MODEL; // the deployed run id
    if (!baseUrl) throw new BuilderError("FREESOLO_BASE_URL is not set", "freesolo");
    if (!apiKey) throw new BuilderError("FREESOLO_API_KEY is not set", "freesolo");
    if (!model) throw new BuilderError("FREESOLO_MODEL (run id) is not set", "freesolo");

    const body = {
      model,
      temperature: 0,
      // Training inputs are byte-for-byte the runtime format (rule zero):
      // the serialized builder input IS the user message, no extra prose.
      messages: [{ role: "user", content: userContent }],
      // Per-request grammar constraint. The FreeSolo serving stack (vLLM-based)
      // IGNORES OpenAI-style response_format — and worse, its PRESENCE routes the
      // request down the unconstrained path even when guided_json is also set
      // (verified live: guided_json alone → finish=stop, schema-clean, ~2s;
      // guided_json + response_format → degenerate until token cap, ~13s).
      // So: vLLM's guided_json ONLY, no response_format on this endpoint.
      guided_json: responseFormat.schema,
      max_tokens: 1600,
    };

    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new BuilderError(
        `FreeSolo builder failed: HTTP ${res.status} ${detail.slice(0, 500)}`,
        "freesolo"
      );
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const choice = data.choices?.[0];
    // Check finish_reason before parsing (ai-pipeline.md §4.5 gotcha 6).
    if (choice?.finish_reason === "length") {
      throw new BuilderError("FreeSolo output truncated (finish_reason=length)", "freesolo");
    }
    const text = choice?.message?.content ?? "";
    if (!text) throw new BuilderError("FreeSolo returned no content", "freesolo");
    return text;
  }
}
