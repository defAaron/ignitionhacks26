import type { ElementKind, Guess, Rect, ShapeResult, Sketch } from './types'
import { sketchText } from './ink'
import { renderPngBase64, type RasterStroke } from './rasterize'
import type { AutocompleteResponse } from './interpretation/pipeline'

/**
 * The real recognizer. The sketch's strokes are cropped to their ink bounds,
 * rasterized (colours preserved - they are signal for the vision model), and
 * POSTed to the autocomplete pipeline. Every returned result is translated
 * back into document coordinates and carried on the Guess as `shapes`, so the
 * commit path can land each one as its own element.
 *
 * Typed text is NOT sent: the pipeline speaks strokes, and Studio already
 * extracts labels via sketchText(). A text-only sketch keeps a sliver of the
 * old heuristic so "type a heading, press enter" still works offline.
 */

/** Breathing room around the ink crop - a tight crop starves the model of context. */
const PAD = 24
/** Long-side cap on the raster; enormous sketches scale down before upload. */
const MAX_SIDE = 2000

export async function recognize(sketch: Sketch, rect: Rect): Promise<Guess> {
  if (sketch.strokes.length === 0) {
    const text = sketchText(sketch)
    const kind: ElementKind = text.length > 28 ? 'paragraph' : 'heading'
    const other: ElementKind = kind === 'paragraph' ? 'heading' : 'paragraph'
    return { kind, confidence: 0.9, alternates: [other, 'button'] }
  }

  // Crop to the ink plus padding, in document coordinates. `rect` is already
  // the sketch's bounding box, computed by sketchBounds().
  const ox = rect.x - PAD
  const oy = rect.y - PAD
  const cropW = rect.w + PAD * 2
  const cropH = rect.h + PAD * 2
  const scale = Math.min(1, MAX_SIDE / Math.max(cropW, cropH))
  const width = Math.max(1, Math.round(cropW * scale))
  const height = Math.max(1, Math.round(cropH * scale))

  // Studio strokes -> pipeline strokes, shifted (and maybe scaled) into crop space.
  const strokes: RasterStroke[] = sketch.strokes.map((s) => ({
    id: s.id,
    points: s.points.map((p) => ({ x: (p.x - ox) * scale, y: (p.y - oy) * scale })),
    color: s.color,
    width: 3
  }))

  const png_base64 = await renderPngBase64(strokes, width, height)
  const res = await fetch('/api/autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ png_base64, canvas: { width, height }, strokes })
  })
  if (!res.ok) throw new Error(`autocomplete failed: ${res.status}`)

  const data = (await res.json()) as AutocompleteResponse
  if (!data.ok) throw new Error(data.reason || 'no completion')

  // Back into document coordinates: un-scale, then un-shift.
  const toDoc = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: p.x / scale + ox,
    y: p.y / scale + oy
  })

  const shapes: ShapeResult[] = []
  for (const r of data.results) {
    const cmd = r.command
    // `wait` is a non-op; anything outside KIND_LABEL we can't render anyway.
    if (cmd.op === 'wait') continue
    // GLYPH p -> PAGE: a box + "p" spawns a new page object. This is the whole
    // page repurpose, applied HERE as deterministic post-model normalization
    // keyed on the DETECTION glyph — never on a model-emitted op. Rationale:
    //  - `page` stays OUT of the frozen builder grammar/enums (no retrain, no
    //    grammar break); the model reads "p" as an unknown glyph and emits the
    //    rect/placeholder fallback, and placeholder is already coerced to rect
    //    upstream. We re-tag that result `page` from the glyph.
    //  - SAFETY: only a CLEAN single-letter "p" read becomes a page. Ambiguous
    //    or unreadable ink yields glyph null / multi-char (never "p"), so it can
    //    never spawn a page — it stays the rect it degraded to.
    const glyph = r.detection.glyph?.trim().toLowerCase() ?? null
    const op: ElementKind = glyph === 'p' ? 'page' : (cmd.op as ElementKind)
    if (!(op in KIND_LABEL)) continue
    const b = r.geometry.bbox
    shapes.push({
      op,
      params: cmd.params,
      snap: cmd.snap,
      bbox: {
        x: b.x / scale + ox,
        y: b.y / scale + oy,
        // Snapped lines can collapse to zero height - floor at 1 so the
        // element box and its SVG viewBox stay renderable.
        width: Math.max(b.width / scale, 1),
        height: Math.max(b.height / scale, 1)
      },
      path: r.geometry.path?.map(toDoc),
      tier: r.tier,
      confidence: r.detection.confidence
    })
  }
  if (shapes.length === 0) throw new Error('no usable results')

  const best = shapes.reduce((a, b) => (b.confidence > a.confidence ? b : a))
  return { kind: best.op, confidence: best.confidence, alternates: [], shapes }
}

/** Sensible minimums so a sloppy sketch still commits to a usable element. */
export function normalizeRect(kind: ElementKind, rect: Rect): Rect {
  const min: Partial<Record<ElementKind, { w: number; h: number }>> = {
    button: { w: 96, h: 40 },
    input: { w: 180, h: 42 },
    heading: { w: 120, h: 38 },
    paragraph: { w: 220, h: 52 },
    card: { w: 200, h: 140 },
    checkbox: { w: 22, h: 22 },
    toggle: { w: 52, h: 30 },
    divider: { w: 160, h: 2 },
    image: { w: 140, h: 100 },
    avatar: { w: 56, h: 56 }
  }

  const m = min[kind] ?? { w: 60, h: 32 }
  const w = Math.max(rect.w, m.w)
  const h = kind === 'divider' ? m.h : Math.max(rect.h, m.h)

  // Checkbox, toggle and avatar have fixed proportions - honour the sketch's
  // position but not its shape, or they come out visibly wrong.
  if (kind === 'checkbox') return { x: rect.x, y: rect.y, w: 22, h: 22 }
  if (kind === 'toggle') return { x: rect.x, y: rect.y, w: 52, h: 30 }
  if (kind === 'avatar') {
    const d = Math.max(Math.min(rect.w, rect.h), 44)
    return { x: rect.x, y: rect.y, w: d, h: d }
  }

  return { x: rect.x, y: rect.y, w, h }
}

export const KIND_LABEL: Record<ElementKind, string> = {
  button: 'button',
  input: 'text field',
  heading: 'heading',
  paragraph: 'paragraph',
  card: 'card',
  checkbox: 'checkbox',
  toggle: 'toggle',
  divider: 'divider',
  image: 'image',
  avatar: 'avatar',
  rect: 'rectangle',
  ellipse: 'ellipse',
  line: 'line',
  arrow: 'arrow',
  text: 'text',
  smooth_path: 'ink',
  form: 'form',
  navbar: 'navbar',
  video: 'video',
  placeholder: 'placeholder',
  page: 'page',
  wave_divider: 'wave divider',
  night_sky: 'night sky',
  sparkles: 'sparkles',
  aurora_gradient: 'aurora',
  bar_chart: 'bar chart',
  pie_chart: 'pie chart',
  venn_diagram: 'venn diagram',
  timeline: 'timeline',
  periodic_table: 'periodic table',
  atomic_structure: 'atom'
}
