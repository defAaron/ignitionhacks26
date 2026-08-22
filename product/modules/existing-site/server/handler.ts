import { NextResponse } from 'next/server'
import { existingSiteEnabled } from '../flag'
import { extractTitle, injectBaseHref } from '../html'
import type { ImportSiteRequest, ImportSiteResponse } from '../types'
import { fetchSiteHtml } from './fetch-site'
import { validatePublicUrl } from './ssrf'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_HTML_CHARS = 2_000_000

function fail(reason: string, status = 500): NextResponse<ImportSiteResponse> {
  return NextResponse.json({ ok: false as const, reason }, { status })
}

/** POST /api/import-site — `{ url }` fetches a public page; `{ html }` accepts a dropped file. */
export async function POST(req: Request): Promise<NextResponse<ImportSiteResponse>> {
  if (!existingSiteEnabled()) return fail('existing-site module is disabled', 404)

  let body: ImportSiteRequest
  try {
    body = (await req.json()) as ImportSiteRequest
  } catch {
    return fail('invalid JSON body', 400)
  }

  if (typeof body.html === 'string') {
    if (!body.html.trim()) return fail('html is empty', 400)
    const html = body.html.length > MAX_HTML_CHARS ? body.html.slice(0, MAX_HTML_CHARS) : body.html
    return NextResponse.json({ ok: true as const, html, title: extractTitle(html), url: null })
  }

  const check = await validatePublicUrl(body.url)
  if (!check.ok) return fail(check.reason, 400)

  const fetched = await fetchSiteHtml(check.url)
  if (!fetched.ok) return fail(fetched.reason, fetched.status)

  const html = injectBaseHref(fetched.html, fetched.url)
  return NextResponse.json({ ok: true as const, html, title: extractTitle(html), url: fetched.url })
}
