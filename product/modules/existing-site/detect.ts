/**
 * Detect canvas-worthy UI in an imported site: buttons, headings, paragraphs,
 * inputs, images, links, nav bars. Client-only.
 *
 * Positions come from real layout: the document is rendered in a hidden
 * iframe at page width with external CSS allowed but scripts stripped and
 * sandboxed off, then every candidate is measured with getBoundingClientRect.
 * The result maps onto baio's plain UI kinds (the ones RenderedElement draws
 * without the trained builder), so nothing touches the frozen op schema.
 */
import type { ElementKind } from '@/lib/types'
import type { PageElement } from '@/lib/page'
import { newElementId } from '@/lib/page'
import { stripScriptsForPreview } from './html'

export interface DetectedElement {
  /** Stable within one detection run; used for the checkbox list. */
  key: string
  kind: ElementKind
  text: string
  /** Page-local, top-left origin, px at `width`. */
  rect: { x: number; y: number; w: number; h: number }
  color: string
  src: string | null
  /** Shape params for template-drawn kinds (backgrounds: fill / gradient / radius). */
  params?: Record<string, unknown>
  /** Only `pick`ed ones are added. Defaults to true. */
  pick: boolean
}

export interface DetectOptions {
  /** Layout width, should match PAGE_WIDTH. */
  width: number
  /** Viewport height for the measuring render. Must match the preview layer's
   * height so vh-based layouts measure where they are drawn. */
  height: number
  /** Ignore anything whose top is below this. */
  maxY?: number
  /** Cap on results after filtering. */
  limit?: number
  timeoutMs?: number
}

const SELECTOR = [
  'nav',
  'header',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'img',
  '[role="button"]'
].join(',')

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (!m) return null
  if (m[4] !== undefined && Number(m[4]) === 0) return null
  const h = (n: string) => Number(n).toString(16).padStart(2, '0')
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`
}

/** True for white or near-white: the studio's paper already is, so skip it. */
function isPaper(hex: string | null): boolean {
  if (!hex) return true
  const n = parseInt(hex.slice(1), 16)
  return (n >> 16) >= 246 && ((n >> 8) & 255) >= 246 && (n & 255) >= 246
}

/** First linear-gradient's colour stops, if the background is one. */
function gradientOf(backgroundImage: string): string[] | null {
  if (!/gradient\(/i.test(backgroundImage)) return null
  const colors = Array.from(backgroundImage.matchAll(/rgba?\([^)]*\)/g))
    .map((c) => rgbToHex(c[0]))
    .filter((c): c is string => !!c)
  return colors.length >= 2 ? colors.slice(0, 4) : null
}

const BG_SELECTOR = 'header, nav, footer, section, main, aside, article, div'

/**
 * Backgrounds: the page's own colour plus any wide band with its own fill
 * (a dark nav, a hero, a footer). Emitted as plain `rect` shapes so they sit
 * under everything else and keep the site's feel once it's in pieces.
 */
function detectBackgrounds(doc: Document, win: Window, width: number, height: number, maxY: number): DetectedElement[] {
  const out: DetectedElement[] = []
  const push = (text: string, rect: DetectedElement['rect'], fill: string | null, gradient: string[] | null, radius: number) => {
    const params: Record<string, unknown> = {}
    if (gradient) params.gradient = { colors: gradient, direction: 'down' }
    else if (fill) params.fill = fill
    if (radius > 0) params.radius = radius
    out.push({ key: `rect-${out.length}`, kind: 'rect', text, rect, color: fill ?? gradient?.[0] ?? '#ffffff', src: null, params, pick: true })
  }

  // Page background: body first, then html (browsers propagate the same way).
  for (const el of [doc.body, doc.documentElement]) {
    if (!el) continue
    const cs = win.getComputedStyle(el)
    const grad = gradientOf(cs.backgroundImage)
    const fill = rgbToHex(cs.backgroundColor)
    if (grad || !isPaper(fill)) {
      push('page background', { x: 0, y: 0, w: width, h: height }, fill, grad, 0)
      break
    }
  }

  // Bands: wide blocks with their own fill. Largest first so a nested strip
  // with the same colour as its parent is dropped as redundant.
  const bands: Array<{ el: Element; r: DOMRect; fill: string | null; grad: string[] | null; radius: number }> = []
  for (const el of Array.from(doc.querySelectorAll(BG_SELECTOR))) {
    const r = el.getBoundingClientRect()
    if (r.width < width * 0.6 || r.height < 40 || r.top > maxY || r.bottom <= 0) continue
    const cs = win.getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    const grad = gradientOf(cs.backgroundImage)
    const fill = rgbToHex(cs.backgroundColor)
    if (!grad && isPaper(fill)) continue
    bands.push({ el, r, fill, grad, radius: parseFloat(cs.borderTopLeftRadius) || 0 })
  }
  bands.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
  const kept: typeof bands = []
  for (const b of bands) {
    const dup = kept.some((k) => k.el.contains(b.el) && k.fill === b.fill && !b.grad && !k.grad)
    if (dup) continue
    kept.push(b)
    if (kept.length >= 12) break
  }
  // Top-to-bottom so the list reads like the page.
  kept.sort((a, b) => a.r.top - b.r.top)
  for (const b of kept) {
    const x = Math.max(0, Math.round(b.r.left + win.scrollX))
    const y = Math.round(b.r.top + win.scrollY)
    const w = Math.round(Math.min(b.r.width, width - x))
    const h = Math.round(b.r.height)
    const tag = b.el.tagName.toLowerCase()
    const label = tag === 'div' || tag === 'main' || tag === 'article' ? 'section' : tag
    push(`${label} background`, { x, y, w, h }, b.fill, b.grad, b.radius)
  }
  return out
}

function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function looksLikeButton(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'button' || el.getAttribute('role') === 'button') return true
  if (tag === 'input') {
    const t = (el.getAttribute('type') ?? '').toLowerCase()
    return t === 'submit' || t === 'button' || t === 'reset'
  }
  if (tag === 'a') {
    const cls = (el.getAttribute('class') ?? '').toLowerCase()
    if (/\b(btn|button|cta)\b/.test(cls)) return true
    const cs = el.ownerDocument.defaultView?.getComputedStyle(el)
    if (!cs) return false
    const bg = rgbToHex(cs.backgroundColor)
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none'
    return !!bg || hasBorder
  }
  return false
}

function classify(el: Element, rect: DOMRect, width: number): ElementKind | null {
  const tag = el.tagName.toLowerCase()
  if (tag === 'nav' || tag === 'header') {
    // A nav with its own fill is already on the canvas as a background band;
    // let its links fall through as text on top of it rather than covering
    // the band with the studio's white nav component.
    const cs = el.ownerDocument.defaultView?.getComputedStyle(el)
    const hasOwnFill = cs ? !isPaper(rgbToHex(cs.backgroundColor)) || /gradient\(/i.test(cs.backgroundImage) : false
    if (hasOwnFill) return null
    const links = el.querySelectorAll('a').length
    return rect.width > width * 0.5 && rect.height < 200 && links >= 2 ? 'navbar' : null
  }
  if (looksLikeButton(el)) return rect.width < width * 0.6 && rect.height < 120 ? 'button' : null
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const t = (el.getAttribute('type') ?? 'text').toLowerCase()
    if (t === 'hidden') return null
    if (t === 'checkbox') return 'checkbox'
    return 'input'
  }
  if (/^h[1-4]$/.test(tag)) return textOf(el) ? 'heading' : null
  if (tag === 'p') return textOf(el).length >= 12 ? 'paragraph' : null
  if (tag === 'img') return rect.width >= 32 && rect.height >= 32 ? 'image' : null
  if (tag === 'a') return textOf(el).length >= 2 && rect.height < 60 ? 'text' : null
  return null
}

function absoluteSrc(img: Element, base: string | null): string | null {
  const raw = img.getAttribute('src') ?? ''
  if (!raw || raw.startsWith('data:')) return raw || null
  try {
    // Relative paths in a dropped file have nothing to resolve against; leave
    // the element as a placeholder frame rather than a broken link.
    if (!base && !/^https?:\/\//i.test(raw)) return null
    return new URL(raw, base ?? undefined).toString()
  } catch {
    return null
  }
}

function mount(html: string, width: number, height: number): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe')
    // Same-origin so we can read layout; no scripts may run (sandbox omits
    // allow-scripts and the markup is stripped of <script> anyway).
    f.setAttribute('sandbox', 'allow-same-origin')
    f.setAttribute('aria-hidden', 'true')
    f.tabIndex = -1
    Object.assign(f.style, {
      position: 'fixed',
      left: '-20000px',
      top: '0',
      width: `${width}px`,
      height: `${height}px`,
      border: '0',
      visibility: 'hidden',
      pointerEvents: 'none'
    })
    f.onload = () => resolve(f)
    f.onerror = () => reject(new Error('could not render the page'))
    f.srcdoc = stripScriptsForPreview(html)
    document.body.appendChild(f)
  })
}

export async function detectSiteElements(
  html: string,
  baseUrl: string | null,
  opts: DetectOptions
): Promise<DetectedElement[]> {
  const { width, height, maxY = 4000, limit = 80, timeoutMs = 10_000 } = opts
  let frame: HTMLIFrameElement | null = null
  try {
    frame = await Promise.race([
      mount(html, width, height),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timed out rendering the page')), timeoutMs))
    ])
    const doc = frame.contentDocument
    const win = frame.contentWindow
    if (!doc || !win) throw new Error('could not read the page')
    // Give late stylesheets/fonts a beat so the layout we measure is settled.
    await new Promise((r) => setTimeout(r, 250))

    const out: DetectedElement[] = detectBackgrounds(doc, win, width, height, maxY)
    const taken: Element[] = []
    const nodes = Array.from(doc.querySelectorAll(SELECTOR))
    for (const el of nodes) {
      if (taken.some((t) => t !== el && t.contains(el))) continue
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8 || r.bottom <= 0 || r.top > maxY) continue
      const cs = win.getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue
      const kind = classify(el, r, width)
      if (!kind) continue

      const x = Math.round(r.left + win.scrollX)
      const y = Math.round(r.top + win.scrollY)
      const w = Math.round(Math.min(r.width, width - x))
      const h = Math.round(r.height)
      if (w < 8 || x >= width) continue

      const textColor = rgbToHex(cs.color) ?? '#1a1a1a'
      const bg = rgbToHex(cs.backgroundColor)
      const bgGrad = gradientOf(cs.backgroundImage)
      const borderW = parseFloat(cs.borderTopWidth) || 0
      const borderColor = borderW > 0 && cs.borderTopStyle !== 'none' ? rgbToHex(cs.borderTopColor) : null
      const fontSize = Math.round(parseFloat(cs.fontSize) || 14)
      const fontWeight = parseInt(cs.fontWeight, 10) || (cs.fontWeight === 'bold' ? 700 : 400)
      const radius = parseFloat(cs.borderTopLeftRadius) || 0
      const color = kind === 'button' ? (bg ?? borderColor ?? textColor) : textColor
      let params: Record<string, unknown> | undefined
      if (kind === 'button') {
        // Copy the real look: fill (solid / gradient / none), label colour,
        // border, corner radius, type size and weight.
        params = { textColor, fontSize, fontWeight, radius }
        if (bgGrad) params.gradient = { colors: bgGrad, direction: 'down' }
        else params.fill = bg ?? 'transparent'
        if (borderColor) params.stroke = { color: borderColor, width: borderW }
      } else if (kind === 'heading' || kind === 'text') {
        params = { fontSize, fontWeight }
      }
      const tag = el.tagName.toLowerCase()
      const text =
        kind === 'image'
          ? (el.getAttribute('alt') ?? '').trim()
          : kind === 'input'
            ? (el.getAttribute('placeholder') ?? el.getAttribute('name') ?? '').trim()
            : kind === 'navbar'
              ? Array.from(el.querySelectorAll('a')).map(textOf).filter(Boolean).slice(0, 6).join(' · ')
              : tag === 'input'
                ? (el.getAttribute('value') ?? '').trim()
                : textOf(el).slice(0, 200)

      out.push({
        key: `${kind}-${out.length}-${taken.length}`,
        kind,
        text,
        rect: { x, y, w, h },
        color,
        src: kind === 'image' ? absoluteSrc(el, baseUrl) : null,
        params,
        pick: true
      })
      taken.push(el)
      if (out.length >= limit) break
    }
    return out
  } finally {
    frame?.remove()
  }
}

/** Turn picked detections into page elements (top-center coordinates). */
export function detectedToPageElements(items: DetectedElement[], centerX: number): PageElement[] {
  return items
    .filter((d) => d.pick)
    .map((d) => ({
      id: newElementId(),
      kind: d.kind,
      name: '', // assigned by applyExtraction against the page's existing names
      location: { x: d.rect.x - centerX, y: d.rect.y },
      size: { w: d.rect.w, h: d.rect.h },
      text: d.text,
      color: d.color,
      src: d.src,
      // Template-drawn kinds carry their look in shape params: `text` its
      // content, `rect` (backgrounds) its fill / gradient / radius.
      shape:
        // Single-line headings and links become exact-size text; a heading
        // that wrapped on the site keeps the wrapping heading component.
        d.kind === 'text' || (d.kind === 'heading' && d.rect.h <= Number(d.params?.fontSize ?? 0) * 1.7)
          ? { op: 'text', params: { text: d.text, fill: d.color, ...(d.params ?? {}) }, snap: null }
          : d.kind === 'button'
            ? { op: 'button', params: { label: d.text, ...(d.params ?? {}) }, snap: null }
            : d.kind === 'rect'
              ? { op: 'rect', params: d.params ?? {}, snap: null }
              : null
    }))
}
