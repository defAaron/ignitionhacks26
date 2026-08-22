import { BuilderError } from "./types";

// ---------------------------------------------------------------------------
// Shared Gemini structured-output transport — one HTTP path for every
// Gemini-backed builder (legacy components baseline + shapes baseline).
// Same transport, different prompt + grammar.
// ---------------------------------------------------------------------------

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

/** One structured-output Gemini call (temperature 0, JSON mime + responseSchema). */
export async function callGeminiJsonOnce(opts: {
  systemPrompt: string;
  userText: string;
  responseSchema: unknown;
  builderName: string;
}): Promise<string> {
  const { systemPrompt, userText, responseSchema, builderName } = opts;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new BuilderError("GEMINI_API_KEY is not set", builderName);
  const model = process.env.GEMINI_BUILDER_MODEL || DEFAULT_MODEL;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new BuilderError(
      `Gemini ${builderName} builder failed: HTTP ${res.status} ${detail.slice(0, 500)}`,
      builderName
    );
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new BuilderError(`Gemini blocked the request: ${data.promptFeedback.blockReason}`, builderName);
  }
  const candidate = data.candidates?.[0];
  // Check finish_reason before parsing (ai-pipeline.md §4.5 gotcha 6).
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new BuilderError(`Gemini ${builderName} finished abnormally: ${candidate.finishReason}`, builderName);
  }
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new BuilderError(`Gemini ${builderName} returned no text`, builderName);
  return text;
}
