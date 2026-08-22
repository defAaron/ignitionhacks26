import type { FrameElement } from './types'

/**
 * The "full app" Frame lane. Same input as the HTML lane (the committed
 * wireframe), but the model emits a real, runnable Vite + React + TypeScript
 * project instead of one HTML file. The two lanes run in parallel and race:
 * HTML wins the preview, the project is offered as a downloadable zip.
 */
export interface FrameAppRequest {
  elements: FrameElement[]
  canvas: { width: number; height: number }
}

/** One file in the emitted project, path relative to the project root. */
export interface FrameFile {
  path: string
  content: string
}

export type FrameAppResponse =
  | { ok: true; files: FrameFile[]; entry: string }
  | { ok: false; reason: string }

/**
 * FROZEN wire format between the app-lane prompt and the route.
 *
 * Asking the model for a single JSON blob of many files means escaping every
 * quote and newline inside code strings — fragile and token-heavy. Instead the
 * model emits files as delimited blocks, verbatim:
 *
 *   === FILE: package.json ===
 *   { ...file contents... }
 *   === FILE: src/App.tsx ===
 *   export function App() { ... }
 *
 * The route splits on the delimiter line to recover FrameFile[]. The prompt
 * MUST use this exact delimiter and nothing else (no fences, no prose).
 */
export const FILE_DELIMITER = /^=== FILE: (.+?) ===$/

/** Parse the delimited multi-file stream into FrameFile[]. */
export function parseFrameFiles(raw: string): FrameFile[] {
  const lines = raw.split('\n')
  const files: FrameFile[] = []
  let path: string | null = null
  let buf: string[] = []

  const flush = (): void => {
    if (path !== null) files.push({ path, content: buf.join('\n').replace(/^\n+|\n+$/g, '') + '\n' })
    buf = []
  }

  for (const line of lines) {
    const m = line.match(FILE_DELIMITER)
    if (m) {
      flush()
      path = m[1].trim()
    } else if (path !== null) {
      buf.push(line)
    }
  }
  flush()
  return files
}
