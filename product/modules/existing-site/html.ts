/**
 * Best-effort HTML helpers in the house style of lib/frame/stitch.ts: regex,
 * not a parser; every function catches and returns its input unchanged rather
 * than throwing. Isomorphic (no DOM, no Node APIs).
 */
import type { BaseSite } from './types'

const MAX_HTML_CHARS = 2_000_000

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Inject `<base href>` so the document's relative assets resolve against its origin. */
export function injectBaseHref(html: string, url: string): string {
  try {
    if (/<base\b/i.test(html)) return html
    const u = new URL(url)
    const dir = u.origin + u.pathname.replace(/[^/]*$/, '')
    const tag = `<base href="${escapeAttr(dir)}">`
    const head = html.match(/<head\b[^>]*>/i)
    if (head && head.index !== undefined) {
      const i = head.index + head[0].length
      return html.slice(0, i) + tag + html.slice(i)
    }
    const root = html.match(/<html\b[^>]*>/i)
    if (root && root.index !== undefined) {
      const i = root.index + root[0].length
      return html.slice(0, i) + `<head>${tag}</head>` + html.slice(i)
    }
    return tag + html
  } catch {
    return html
  }
}

export function extractTitle(html: string): string {
  try {
    const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
    return m ? m[1].replace(/\s+/g, ' ').trim() : ''
  } catch {
    return ''
  }
}

/** Drop scripts for the canvas preview: the sandbox already blocks them, this just keeps the srcDoc light. */
export function stripScriptsForPreview(html: string): string {
  try {
    return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  } catch {
    return html
  }
}

/**
 * Shrink a document for the prompt, least-lossy steps first, stopping as soon
 * as it fits. Tags are preserved so the model can echo them back in place.
 */
export function trimHtml(html: string, max = 150_000): string {
  try {
    let out = html
    if (out.length <= max) return out
    const steps: Array<(s: string) => string> = [
      (s) => s.replace(/<!--[\s\S]*?-->/g, ''),
      (s) =>
        s.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_m, attrs: string, body: string) =>
          body.trim() ? `<script${attrs}>/* trimmed */</script>` : `<script${attrs}></script>`
        ),
      (s) => s.replace(/<svg\b([^>]*)>[\s\S]*?<\/svg>/gi, '<svg$1><!-- svg trimmed --></svg>'),
      (s) =>
        s.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, body: string) =>
          body.length > 20_000 ? `<style${attrs}>${body.slice(0, 20_000)}/* trimmed */</style>` : _m
        ),
      (s) => s.replace(/(src|href)=(["'])data:[^"']{2000,}\2/gi, '$1=$2data:trimmed$2')
    ]
    for (const step of steps) {
      out = step(out)
      if (out.length <= max) return out
    }
    return out.slice(0, max) + '\n<!-- truncated -->'
  } catch {
    return html
  }
}

export function makeBaseSite(html: string, url: string | null): BaseSite {
  const doc = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html
  return { url, html: doc, title: extractTitle(doc) || undefined, fetchedAt: new Date().toISOString() }
}
