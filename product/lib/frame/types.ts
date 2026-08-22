import type { ElementKind } from '@/lib/types'

/** Axis-aligned box in document (canvas) coordinates. */
export interface FrameRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * The wire shape a shape-element carries into Frame: the recognizer op plus
 * its params (fill / gradient / palette / density...), so the model knows what
 * the decorative actually looks like without seeing the SVG.
 */
export interface FrameShape {
  op: ElementKind
  params?: Record<string, unknown>
}

/**
 * One page element as sent to /api/frame. Derivable from a CommittedElement:
 *   { kind, rect, text: text || undefined, src, shape: shape && { op, params } }
 * Only what the model needs survives — ids, colors-as-strokes, paths and
 * confidence tiers stay behind in the studio.
 */
export interface FrameElement {
  kind: ElementKind
  rect: FrameRect
  /** User-entered label/content, when any. */
  text?: string
  /** Data URL of an uploaded image; only meaningful for kind === 'image'. */
  src?: string
  /** Present for pipeline shape elements (rect fills, night_sky, wave_divider...). */
  shape?: FrameShape
}

export interface FrameRequest {
  elements: FrameElement[]
  canvas: { width: number; height: number }
}

export type FrameResponse = { ok: true; html: string } | { ok: false; reason: string }
