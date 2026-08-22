import { NextResponse } from 'next/server'
import { FRAME_APP_SYSTEM_PROMPT, buildFrameAppUserMessage } from '@/lib/frame/app-prompt'
import { parseFrameFiles } from '@/lib/frame/app-types'
import type { FrameAppRequest, FrameAppResponse } from '@/lib/frame/app-types'

/** Full-project generation can take a while; give the route room on hosts that enforce it. */
export const maxDuration = 300

const API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-5'
/**
 * A whole project is many files; 64k leaves headroom for the model's (adaptive)
 * thinking plus every file's source. Outputs this large require streaming to
 * avoid request timeouts, so the call streams SSE and the route accumulates the
 * text server-side.
 */
const MAX_TOKENS = 64_000

function fail(reason: string, status = 500): NextResponse<FrameAppResponse> {
  return NextResponse.json({ ok: false as const, reason }, { status })
}

export async function POST(req: Request): Promise<NextResponse<FrameAppResponse>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fail('ANTHROPIC_API_KEY not set', 503)

  let body: FrameAppRequest
  try {
    body = (await req.json()) as FrameAppRequest
  } catch {
    return fail('invalid JSON body', 400)
  }
  if (!Array.isArray(body.elements) || body.elements.length === 0) {
    return fail('elements must be a non-empty array', 400)
  }
  const canvas =
    body.canvas && Number.isFinite(body.canvas.width) && Number.isFinite(body.canvas.height)
      ? body.canvas
      : { width: 1440, height: 900 }

  const { message, images } = buildFrameAppUserMessage(body.elements, canvas)

  let res: Response
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.FRAME_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        // No temperature: current models (claude-sonnet-5 and newer) reject
        // non-default sampling params; the prompt does the steering.
        system: FRAME_APP_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }]
      })
    })
  } catch (err) {
    return fail(`could not reach the Claude API: ${err instanceof Error ? err.message : String(err)}`, 502)
  }

  if (!res.ok) {
    let reason = `Claude API error (HTTP ${res.status})`
    try {
      const errJson = (await res.json()) as { error?: { message?: string } }
      if (errJson.error?.message) reason = `Claude API error: ${errJson.error.message}`
    } catch {
      /* non-JSON error body; keep the status-based reason */
    }
    return fail(reason, 502)
  }
  if (!res.body) return fail('Claude API returned an empty response body', 502)

  let text: string
  let stopReason: string | null
  try {
    ;({ text, stopReason } = await consumeStream(res.body))
  } catch (err) {
    return fail(`stream error: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (stopReason === 'max_tokens') {
    return fail('the project was cut off (max_tokens reached) — try a simpler page')
  }
  if (stopReason === 'refusal') {
    return fail('the model declined to generate this project')
  }

  // Drop any accidental prose before the first delimiter, then split into files.
  const files = parseFrameFiles(stripLeadingProse(text))
  if (files.length === 0) {
    return fail('the model did not return any project files')
  }

  // Substitute the real image data URLs back into every file's content.
  for (const file of files) {
    for (const [token, dataUrl] of Object.entries(images)) {
      file.content = file.content.split(token).join(dataUrl)
    }
  }

  // Prefer index.html as the entry, otherwise fall back to the first file.
  const entry = files.find((f) => f.path === 'index.html')?.path ?? files[0].path

  return NextResponse.json({ ok: true as const, files, entry })
}

/**
 * Accumulate assistant text from the Messages API SSE stream and capture the
 * final stop reason (arrives on message_delta).
 */
async function consumeStream(
  body: ReadableStream<Uint8Array>
): Promise<{ text: string; stopReason: string | null }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let stopReason: string | null = null

  const handle = (data: string): void => {
    if (data === '[DONE]') return
    let event: {
      type?: string
      delta?: { type?: string; text?: string; stop_reason?: string }
      error?: { message?: string }
    }
    try {
      event = JSON.parse(data)
    } catch {
      return
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      text += event.delta.text ?? ''
    } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
      stopReason = event.delta.stop_reason
    } else if (event.type === 'error') {
      throw new Error(event.error?.message ?? 'unknown streaming error')
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE events are separated by a blank line; the tail stays in the buffer.
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const chunk of events) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) handle(line.slice(6))
      }
    }
  }
  for (const line of buffer.split('\n')) {
    if (line.startsWith('data: ')) handle(line.slice(6))
  }

  return { text, stopReason }
}

/**
 * The prompt forbids prose, but strip it anyway: drop everything before the
 * first `=== FILE:` delimiter line so parseFrameFiles sees a clean stream.
 */
function stripLeadingProse(raw: string): string {
  const s = raw.replace(/^﻿/, '')
  const match = s.match(/^=== FILE: .+? ===$/m)
  if (!match || match.index === undefined) return s
  return s.slice(match.index)
}
