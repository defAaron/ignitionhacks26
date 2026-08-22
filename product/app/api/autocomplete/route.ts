/**
 * POST /api/autocomplete — thin HTTP wrapper over the pipeline core
 * (lib/interpretation/pipeline.ts).
 *
 * Body: { png_base64, canvas: {width, height}, strokes: [...], forced_op? }
 *
 * Status discipline: 4xx is reserved for malformed requests (invalid JSON /
 * zod failure). Model-side issues (vision, builder, validation) are never a
 * 500 — the pipeline degrades and answers 200 { ok: false, reason }.
 */

import { NextRequest, NextResponse } from "next/server";
import { autocompleteBodySchema, runAutocomplete } from "@/lib/interpretation/pipeline";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = autocompleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await runAutocomplete(parsed.data));
  } catch (e) {
    // Belt-and-braces: runAutocomplete degrades internally; anything that
    // still escapes is reported as a degrade, not a 500.
    return NextResponse.json({
      ok: false,
      request_id: "unassigned",
      reason: `pipeline_error: ${(e as Error).message}`,
    });
  }
}
