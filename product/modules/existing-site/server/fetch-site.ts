import { validatePublicUrl } from './ssrf'

export type SiteFetch =
  | { ok: true; html: string; url: string }
  | { ok: false; reason: string; status: number }

interface Options {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
}

/**
 * Fetch one HTML document with a wall-clock timeout, a byte cap, and manual
 * redirect following so every hop is re-validated against the SSRF rules.
 */
export async function fetchSiteHtml(start: URL, opts: Options = {}): Promise<SiteFetch> {
  const timeoutMs = opts.timeoutMs ?? 10_000
  const maxBytes = opts.maxBytes ?? 2_000_000
  const maxRedirects = opts.maxRedirects ?? 3
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    let url = start
    for (let hop = 0; ; hop++) {
      let res: Response
      try {
        res = await fetch(url, {
          signal: ctrl.signal,
          redirect: 'manual',
          headers: {
            'user-agent': 'baio/1.0 (+site import)',
            accept: 'text/html,application/xhtml+xml'
          }
        })
      } catch (e) {
        const aborted = (e as Error)?.name === 'AbortError'
        return {
          ok: false,
          reason: aborted ? 'timed out fetching the page' : 'could not reach the page',
          status: 502
        }
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc || hop >= maxRedirects) return { ok: false, reason: 'too many redirects', status: 502 }
        const next = await validatePublicUrl(new URL(loc, url).toString())
        if (!next.ok) return { ok: false, reason: `redirect blocked: ${next.reason}`, status: 400 }
        url = next.url
        continue
      }
      if (!res.ok) return { ok: false, reason: `page returned HTTP ${res.status}`, status: 502 }
      const type = res.headers.get('content-type') ?? ''
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
        return { ok: false, reason: 'url is not an HTML page', status: 415 }
      }
      if (!res.body) return { ok: false, reason: 'empty response', status: 502 }

      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > maxBytes) {
          void reader.cancel()
          return { ok: false, reason: 'page larger than 2MB', status: 502 }
        }
        chunks.push(value)
      }
      const buf = new Uint8Array(bytes)
      let off = 0
      for (const c of chunks) {
        buf.set(c, off)
        off += c.byteLength
      }
      return { ok: true, html: new TextDecoder('utf-8').decode(buf), url: url.toString() }
    }
  } finally {
    clearTimeout(timer)
  }
}
