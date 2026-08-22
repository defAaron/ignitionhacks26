import { NextResponse } from "next/server";
import { callGeminiJsonOnce } from "@/lib/models/geminiTransport";
import {
  WIRE_ANALYZE_SYSTEM,
  WIRE_GENERATE_SYSTEM,
  WIRE_INTENT_SCHEMA,
  buildWireAnalyzeUser,
  buildWireGenerateUser,
} from "@/lib/wire/prompt";
import { validateWireOutput } from "@/lib/wire/validate";
import type { WireIntent, WireRequest, WireResponse } from "@/lib/wire/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

/**
 * A wire suggestion is like autocomplete: model failures are NOT server errors,
 * they return 200 `{ ok:false, reason }` so the client degrades quietly. Only a
 * missing key (503) or a malformed body (400) is a real HTTP error.
 */
function fail(reason: string, status = 200): NextResponse<WireResponse> {
  return NextResponse.json({ ok: false as const, reason }, { status });
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function POST(req: Request): Promise<NextResponse<WireResponse>> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return fail("ANTHROPIC_API_KEY not set", 503);
  if (!process.env.GEMINI_API_KEY) return fail("GEMINI_API_KEY not set", 503);

  let body: WireRequest;
  try {
    body = (await req.json()) as WireRequest;
  } catch {
    return fail("invalid JSON body", 400);
  }
  if (!body?.arrowId || !body?.source?.id || !body?.target?.id) {
    return fail("arrowId, source.id and target.id are required", 400);
  }

  // Stage 1 — Gemini analyzes what the arrow connects.
  let intent: WireIntent;
  try {
    const intentText = await callGeminiJsonOnce({
      systemPrompt: WIRE_ANALYZE_SYSTEM,
      userText: buildWireAnalyzeUser(body),
      responseSchema: WIRE_INTENT_SCHEMA,
      builderName: "wire-analyze",
    });
    intent = JSON.parse(intentText) as WireIntent;
  } catch (e) {
    return fail(`analysis failed: ${errMsg(e)}`);
  }

  // Stage 2 — Haiku writes the logic block.
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.WIRE_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: WIRE_GENERATE_SYSTEM,
        messages: [{ role: "user", content: buildWireGenerateUser(body, intent) }],
      }),
    });
  } catch (e) {
    return fail(`could not reach the Claude API: ${errMsg(e)}`);
  }

  if (!res.ok) {
    let reason = `Claude API error (HTTP ${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) reason = `Claude API error: ${j.error.message}`;
    } catch {
      /* keep status-based reason */
    }
    return fail(reason);
  }

  let data: { content?: Array<{ type?: string; text?: string }>; stop_reason?: string };
  try {
    data = (await res.json()) as typeof data;
  } catch (e) {
    return fail(`could not parse the Claude response: ${errMsg(e)}`);
  }
  if (data.stop_reason === "max_tokens") {
    return fail("logic block was cut off (max_tokens) — try a simpler connection");
  }
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  if (!text) return fail("the model returned no logic block");

  const parsed = validateWireOutput(text);
  if (!parsed.ok) return fail(parsed.reason);
  return NextResponse.json({ ok: true as const, output: parsed.output });
}
