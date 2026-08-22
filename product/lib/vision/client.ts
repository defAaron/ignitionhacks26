/**
 * Gemini vision client.
 *
 * SHAPES-FIRST (live): `analyzeInkShapes` sends screenshot + stroke manifest
 * to the Gemini REST API (structured output, temperature 0) and returns a
 * validated ShapeDetectionSet (shared/schemas/detection-shapes.json via the
 * zod mirror in types/schemas.ts).
 *
 * LEGACY (pre-pivot, retained for the flash-1784430057 run): `analyzeInk`
 * returns the old component-classifying DetectionSet (detection.json).
 *
 * No SDK dependency: plain fetch against generateContent. On a response that
 * fails validation the call is retried once, then a typed error is thrown.
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL (default gemini-flash-lite-latest).
 */

import {
  detectionSetSchema,
  shapeDetectionSetSchema,
  SHAPE_KINDS,
  type DetectionSet,
  type ShapeDetectionSet,
} from "../../types/schemas";
import { buildShapeVisionPrompt, buildVisionPrompt } from "./prompt";
import { PHASE1_OPS } from "../labeler/labels";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One entry of the stroke manifest ("prompt + points"): id + bbox + point_count
 * (+ optional ink color — ground truth for the vision "colors" field, so
 * near-black hues never get rounded down to black from pixels alone). */
export interface StrokeManifestEntry {
  id: string;
  bbox: { x: number; y: number; width: number; height: number };
  point_count: number;
  /** The stroke's exact ink color (CSS string), when the caller knows it. */
  color?: string;
}

/** Args shared by both analyzers: the ink screenshot + its stroke manifest. */
export interface AnalyzeInkShapesArgs {
  /** Base64-encoded PNG screenshot of the canvas ink (no data: prefix). */
  pngBase64: string;
  /** One entry per stroke, screenshot pixel coordinates. */
  strokeManifest: StrokeManifestEntry[];
  /** Canvas dimensions in px (context for the model). */
  canvas: { width: number; height: number };
}

/** Legacy analyzeInk args: same input plus the active op whitelist. */
export interface AnalyzeInkArgs extends AnalyzeInkShapesArgs {
  /** Active vocabulary; defaults to the wave-1 core 18. */
  opIds?: string[];
}

/** Base class for all vision-layer failures. */
export class VisionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "VisionError";
  }
}

/** The HTTP call itself failed (network, auth, 4xx/5xx, blocked response). */
export class VisionApiError extends VisionError {
  constructor(message: string, readonly status?: number, cause?: unknown) {
    super(message, cause);
    this.name = "VisionApiError";
  }
}

/** Gemini answered, but the JSON failed schema validation twice. */
export class VisionValidationError extends VisionError {
  constructor(message: string, readonly issues: string[], readonly rawText: string) {
    super(message);
    this.name = "VisionValidationError";
  }
}

// ---------------------------------------------------------------------------
// Response schemas (Gemini's OpenAPI-style dialect — no $refs)
// ---------------------------------------------------------------------------

const BBOX_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
  },
  required: ["x", "y", "width", "height"],
  propertyOrdering: ["x", "y", "width", "height"],
} as const;

/** Mirrors shared/schemas/detection-shapes.json (shapes-first, live). */
const SHAPE_DETECTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    detections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stroke_ids: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
          kind: { type: "string", enum: [...SHAPE_KINDS] },
          glyph: { type: "string", nullable: true },
          text: { type: "string", nullable: true },
          colors: { type: "array", items: { type: "string" } },
          gradient_direction: {
            type: "string",
            enum: ["down", "right", "diagonal"],
            nullable: true,
          },
          composite: {
            type: "string",
            enum: ["bar_chart", "pie_chart", "venn_diagram", "timeline", "periodic_table", "atomic_structure"],
            nullable: true,
          },
          confidence: { type: "number" },
          bbox: BBOX_RESPONSE_SCHEMA,
        },
        required: [
          "stroke_ids",
          "kind",
          "glyph",
          "text",
          "colors",
          "gradient_direction",
          "composite",
          "confidence",
          "bbox",
        ],
        propertyOrdering: [
          "stroke_ids",
          "kind",
          "glyph",
          "text",
          "colors",
          "gradient_direction",
          "composite",
          "confidence",
          "bbox",
        ],
      },
    },
  },
  required: ["detections"],
} as const;

/** Legacy: mirrors shared/schemas/detection.json (pre-pivot). */
const DETECTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    detections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stroke_ids: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
          candidates: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["type", "confidence"],
              propertyOrdering: ["type", "confidence"],
            },
          },
          label_text: { type: "string", nullable: true },
          bbox: BBOX_RESPONSE_SCHEMA,
          style_hints: {
            type: "object",
            nullable: true,
            properties: {
              colors: { type: "array", items: { type: "string" } },
              fill: { type: "string" },
            },
          },
        },
        required: ["stroke_ids", "candidates", "label_text", "bbox"],
        propertyOrdering: ["stroke_ids", "candidates", "label_text", "bbox", "style_hints"],
      },
    },
  },
  required: ["detections"],
} as const;

// ---------------------------------------------------------------------------
// Low-level Gemini call
// ---------------------------------------------------------------------------

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-flash-lite-latest";

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

async function callGeminiOnce(
  prompt: string,
  responseSchema: unknown,
  args: AnalyzeInkShapesArgs
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new VisionApiError("GEMINI_API_KEY not set — add it to product/.env and restart");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const manifestText =
    `CANVAS: ${JSON.stringify(args.canvas)}\n` +
    `STROKE MANIFEST:\n${JSON.stringify(args.strokeManifest)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/png", data: args.pngBase64 } },
          { text: manifestText },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new VisionApiError(
      `Gemini vision call failed: HTTP ${res.status} ${detail.slice(0, 500)}`,
      res.status
    );
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new VisionApiError(`Gemini blocked the request: ${data.promptFeedback.blockReason}`);
  }
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    throw new VisionApiError(
      `Gemini returned no text (finishReason: ${candidate?.finishReason ?? "none"})`
    );
  }
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new VisionApiError(`Gemini finished abnormally: ${candidate.finishReason}`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Parse + retry plumbing (shared by both analyzers)
// ---------------------------------------------------------------------------

type ZodLikeSchema<T> = {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: (string | number)[]; message: string }> } };
};

function tryParse<T>(
  text: string,
  schema: ZodLikeSchema<T>
): { ok: true; value: T } | { ok: false; issues: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: [`JSON parse error: ${(e as Error).message}`] };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

async function callValidated<T>(
  prompt: string,
  responseSchema: unknown,
  zodSchema: ZodLikeSchema<T>,
  args: AnalyzeInkShapesArgs,
  contractName: string
): Promise<T> {
  let lastText = "";
  let lastIssues: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callGeminiOnce(prompt, responseSchema, args);
    const result = tryParse(text, zodSchema);
    if (result.ok) return result.value;
    lastText = text;
    lastIssues = result.issues;
  }
  throw new VisionValidationError(
    `Gemini vision output failed ${contractName} validation after retry: ${lastIssues.join("; ")}`,
    lastIssues,
    lastText
  );
}

// ---------------------------------------------------------------------------
// Public analyzers
// ---------------------------------------------------------------------------

/**
 * Describe the ink (shapes-first): screenshot + stroke manifest -> validated
 * ShapeDetectionSet (kind + glyph + text + colors per stroke cluster).
 *
 * Retries the whole call once if Gemini's JSON fails validation; throws
 * VisionValidationError after the second failure, VisionApiError on transport
 * failure.
 */
export async function analyzeInkShapes(args: AnalyzeInkShapesArgs): Promise<ShapeDetectionSet> {
  return callValidated(
    buildShapeVisionPrompt(),
    SHAPE_DETECTION_RESPONSE_SCHEMA,
    shapeDetectionSetSchema,
    args,
    "shape-detection-set"
  );
}

/**
 * Legacy (pre-pivot): classify the ink into component candidates ->
 * validated DetectionSet. Same retry/typed-error behavior as analyzeInkShapes.
 */
export async function analyzeInk(args: AnalyzeInkArgs): Promise<DetectionSet> {
  return callValidated(
    buildVisionPrompt(args.opIds ?? [...PHASE1_OPS]),
    DETECTION_RESPONSE_SCHEMA,
    detectionSetSchema,
    args,
    "detection-set"
  );
}
