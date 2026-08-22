import type { StitchPage, FrameConnection, StitchHtmlSite } from './space-types'
import type { FrameFile } from './app-types'

/**
 * space-frame HTML lane, deterministic half: stitch already-sealed single-page
 * HTML documents into one linked multi-page static site. PURE — no network, no
 * model call, no filesystem; same input always yields the same bytes.
 *
 * What it does, and ONLY this:
 *   1. names each page a `<slug>.html` file (unique, derived from page.name);
 *   2. injects one shared top-bar <nav> (+ scoped <style>) into every page,
 *      right after <body>, marking the current page active;
 *   3. best-effort rewrites placeholder anchors (href "#"/empty/missing) whose
 *      visible text matches a page name so they link to that page;
 *   4. duplicates the entry page (named home/index, else the first) as
 *      index.html and reports entry = 'index.html'.
 * The sealed page markup/CSS/JS is preserved verbatim apart from the injection.
 *
 * Sanity (informal — no test framework in this repo):
 *   stitchHtmlSite([{id:'p1',name:'Home',html:'<body><a href="#">About</a></body>'},
 *                   {id:'p2',name:'About Us',html:'<body>hi</body>'}], [])
 *     -> files: home.html, about-us.html, index.html (copy of home.html)
 *        home.html body starts with <nav>…</nav>; its <a> now href="about-us.html"
 *        (text "About" is NOT a page name, so it stays "#"; had it said
 *        "About Us" it would be rewritten). entry === 'index.html'.
 *   stitchHtmlSite([], []) -> { files: [], entry: 'index.html' }.
 */

/** href values we treat as unlinked placeholders and are free to rewrite. */
const PLACEHOLDER_HREFS = new Set(['', '#', 'javascript:void(0)', 'javascript:void(0);'])

/**
 * Turn a page name into a safe file slug: lowercase, spaces/underscores → '-',
 * drop anything outside [a-z0-9-], collapse and trim '-'. Empty → page-<index>.
 */
function slugify(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-') // spaces + underscores become hyphens
    .replace(/[^a-z0-9-]/g, '') // strip everything else
    .replace(/-+/g, '-') // collapse repeats
    .replace(/^-|-$/g, '') // trim leading/trailing hyphen
  return slug || `page-${index}`
}

/** HTML-escape text for use inside nav element content / double-quoted attrs. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Minimal, neutral, scoped styling for the injected bar — kept inline so the
 * stitched site stays fully self-contained (no external deps, no CDN). Class is
 * namespaced (`frame-nav`) to minimise collisions with the sealed page's CSS. */
const NAV_STYLE = `<style>
.frame-nav{display:flex;flex-wrap:wrap;gap:.25rem;align-items:center;
padding:.5rem .75rem;background:#111;font:14px/1.4 system-ui,sans-serif;
border-bottom:1px solid #000;position:sticky;top:0;z-index:2147483647}
.frame-nav a{color:#bbb;text-decoration:none;padding:.25rem .6rem;border-radius:4px}
.frame-nav a:hover{color:#fff;background:#222}
.frame-nav a.active{color:#fff;background:#333;font-weight:600}
</style>`

/**
 * Build the shared nav for one current page. Lists EVERY page (connections do
 * not prune the menu); the active page is flagged with `aria-current` + class.
 */
function buildNav(pages: StitchPage[], slugs: string[], currentIndex: number): string {
  const links = pages
    .map((p, i) => {
      const active = i === currentIndex
      const cls = active ? ' class="active"' : ''
      const cur = active ? ' aria-current="page"' : ''
      return `<a href="${slugs[i]}.html"${cls}${cur}>${escapeHtml(p.name)}</a>`
    })
    .join('')
  return `${NAV_STYLE}<nav class="frame-nav">${links}</nav>`
}

/**
 * Best-effort placeholder-anchor rewrite. LIMITS (by design — this is a
 * convenience, not a parser): a single non-greedy regex per <a>…</a>, so it
 * mishandles nested/unclosed anchors and anchor text containing markup beyond
 * simple inline tags; it only ever touches anchors whose href is a placeholder
 * (see PLACEHOLDER_HREFS) or absent, never real links; matching is on the
 * anchor's plain visible text (tags stripped) exactly equal, case-insensitively,
 * to a known page name. It never throws — worst case it changes nothing.
 */
function rewriteAnchors(html: string, nameToSlug: Map<string, string>): string {
  try {
    // Capture: (1) attributes before '>', (2) inner text up to the next </a>.
    return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs: string, inner: string) => {
      // Visible text = inner with any tags stripped, trimmed, lowercased.
      const text = inner.replace(/<[^>]*>/g, '').trim().toLowerCase()
      const slug = nameToSlug.get(text)
      if (!slug) return whole // text is not a page name → leave untouched

      // Read the current href (double/single-quoted or bare) if present.
      const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
      const href = hrefMatch ? (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '') : ''
      const isPlaceholder = !hrefMatch || PLACEHOLDER_HREFS.has(href.trim().toLowerCase())
      if (!isPlaceholder) return whole // a real link already → don't clobber it

      const target = `${slug}.html`
      const newAttrs = hrefMatch
        ? attrs.replace(hrefMatch[0], `href="${target}"`) // swap the placeholder
        : `${attrs} href="${target}"` // no href at all → add one
      return `<a${newAttrs}>${inner}</a>`
    })
  } catch {
    return html // never throw on malformed html
  }
}

/**
 * Inject markup right after the opening <body …> tag (case-insensitive). If the
 * sealed document has no <body> (fragments etc.), defensively prepend instead so
 * the nav is still present. The rest of the document is copied verbatim.
 */
function injectAfterBody(html: string, markup: string): string {
  const bodyOpen = /<body\b[^>]*>/i.exec(html)
  if (bodyOpen) {
    const at = bodyOpen.index + bodyOpen[0].length
    return html.slice(0, at) + markup + html.slice(at)
  }
  return markup + html // no <body> → wrap defensively
}

export const stitchHtmlSite: StitchHtmlSite = (
  pages: StitchPage[],
  connections: FrameConnection[]
): { files: FrameFile[]; entry: string } => {
  const entry = 'index.html'
  if (pages.length === 0) return { files: [], entry } // caller guards; be safe

  // 1. Unique slug per page.
  const used = new Set<string>()
  const slugs = pages.map((p, i) => {
    let slug = slugify(p.name, i)
    if (used.has(slug)) {
      let n = 2
      while (used.has(`${slug}-${n}`)) n++
      slug = `${slug}-${n}`
    }
    used.add(slug)
    return slug
  })

  // Map lowercased page name → slug, for anchor text matching. First name wins.
  const nameToSlug = new Map<string, string>()
  pages.forEach((p, i) => {
    const key = p.name.trim().toLowerCase()
    if (key && !nameToSlug.has(key)) nameToSlug.set(key, slugs[i])
  })
  // Connections express intended edges; every connection target is a page whose
  // name is already in nameToSlug, so name-matching alone covers both the
  // "connections present" and "connections empty" cases. We reference the list
  // only to stay honest about intent — no separate rewrite path is needed.
  void connections

  // Entry page = first named home/index (case-insensitive), else the first page.
  const entryIndex = Math.max(
    0,
    pages.findIndex((p) => {
      const n = p.name.trim().toLowerCase()
      return n === 'home' || n === 'index'
    })
  )

  // 2. + 3. Rewrite placeholder anchors, then inject the nav, per page.
  const rendered = pages.map((p, i) => {
    const rewritten = rewriteAnchors(p.html, nameToSlug)
    return injectAfterBody(rewritten, buildNav(pages, slugs, i))
  })

  const files: FrameFile[] = pages.map((_, i) => ({ path: `${slugs[i]}.html`, content: rendered[i] }))
  // 4. Duplicate the entry page as index.html (its nav already marks it active).
  files.push({ path: entry, content: rendered[entryIndex] })

  return { files, entry }
}
