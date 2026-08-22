import { emptyPage, type Page, type PageShape } from './page'
import type { Vec2 } from './camera'
import type { CommittedElement, ElementKind, ShapeResult } from './types'
import type { WireBlock } from './wire/types'

/**
 * The liminal space: the infinite plane that holds the page (and, later, more
 * pages plus loose items). Slice 2 requires only ONE page, but the container is
 * a list so appending pages / loose elements later needs no reshape. The page's
 * own element model (page-v1) is untouched - the space only says WHERE the page
 * sits on the plane.
 *
 * Slice 3 adds `loose`: elements drawn straight onto the plane (not into any
 * page). They are PageElement-shaped but positioned in WORLD coordinates on the
 * plane, so the render/drag code speaks the same CommittedElement it already
 * does - only the coordinate space differs (world, not page-local).
 */

export interface PlacedPage {
  kind: 'page'
  /** Plane location of the page's top-centre (page-v1 origin). */
  location: Vec2
  page: Page
}

/**
 * A loose element on the plane. Same shape as a PageElement, but `location` is
 * the element's top-left in WORLD coordinates (not the page's top-center frame),
 * because it lives on the bare plane, not inside a page.
 */
export interface LooseElement {
  /** Permanent opaque key, generated once at creation. */
  id: string
  kind: ElementKind
  /** Friendly, renamable handle. */
  name: string
  /** Top-left corner in WORLD coordinates on the plane. */
  location: Vec2
  size: { w: number; h: number }
  text: string
  color: string
  /** Image data URL; `image` kind only. */
  src: string | null
  /** Stacking layer; absent means 0. */
  layer?: number
  /** Pipeline result behind this element, or null for a plain UI element. */
  shape: PageShape | null
}

/**
 * A drawn connection between two objects on the plane. `sourceId`/`targetId`
 * reference an element id (`e_…`) OR a page id (`p_…`) — the arrow's tail and
 * tip resolved to whatever they landed on. `block` is the logic the wiring
 * pipeline (/api/wire) built for the connection, or null until it answers.
 */
export interface Wire {
  id: string
  sourceId: string
  targetId: string
  block: WireBlock | null
}

export interface LiminalSpace {
  schema: 'space-v1'
  items: PlacedPage[]
  /** Elements dropped straight onto the plane, in world coordinates. */
  loose: LooseElement[]
  /** Drawn connections between objects (arrow -> logic block). */
  wires: Wire[]
}

/** A fresh space with a single page at the plane origin and no loose elements. */
export function emptySpace(): LiminalSpace {
  return {
    schema: 'space-v1',
    items: [{ kind: 'page', location: { x: 0, y: 0 }, page: emptyPage() }],
    loose: [],
    wires: []
  }
}

/** Append a wire to the space (returns a new space). */
export function addWire(space: LiminalSpace, wire: Wire): LiminalSpace {
  return { ...space, wires: [...space.wires, wire] }
}

/** The single required page and its plane location. Always items[0]; stays
 * valid now that the space holds many pages (the others render alongside it). */
export function primaryPage(space: LiminalSpace): PlacedPage {
  return space.items[0]
}

/**
 * Spawn a NEW page object on the plane at `location` (the page's top-centre, in
 * WORLD coordinates). Committed by drawing a box + p glyph (op `page`). Returns
 * a new space with the page appended; the caller stays in its current view (the
 * page appears on the plane, clicked to enter). Sibling pages only — nested
 * pages are deferred, so a page drawn while focused still lands on the plane.
 */
export function addPage(space: LiminalSpace, location: Vec2): LiminalSpace {
  return { ...space, items: [...space.items, { kind: 'page', location, page: emptyPage() }] }
}

/* ---------- loose-element path normalization ---------- */
// Mirrors page.ts: `path` is stored NORMALIZED (0..1 within the element box) so
// a move or resize needs no path bookkeeping - the box is the single source of
// truth and the silhouette is re-fitted to it on read.

function normalizePath(
  path: { x: number; y: number }[],
  frame: { x: number; y: number; width: number; height: number }
): { x: number; y: number }[] {
  const w = frame.width || 1
  const h = frame.height || 1
  return path.map((p) => ({ x: (p.x - frame.x) / w, y: (p.y - frame.y) / h }))
}

function denormalizePath(
  path: { x: number; y: number }[],
  rect: { x: number; y: number; w: number; h: number }
): { x: number; y: number }[] {
  return path.map((p) => ({ x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h }))
}

/* ---------- CommittedElement <-> LooseElement bridge ---------- */
// A loose element's WORLD top-left IS its screen-space rect origin (the plane
// layer that renders it sits at the world origin), so unlike the page bridge
// there is no top-center shift - `location` and `rect` share the same axes.

/** Screen-space element -> stored loose element. `name` is supplied so a
 * rename/move never regenerates it. Path is normalized against the shape's own
 * bbox (the frame it was drawn in), not the possibly-moved rect. */
export function screenElementToLoose(el: CommittedElement, name: string): LooseElement {
  let shape: PageShape | null = null
  if (el.shape) {
    shape = {
      op: el.shape.op,
      params: el.shape.params ?? {},
      snap: el.shape.snap ?? null,
      path: el.shape.path ? normalizePath(el.shape.path, el.shape.bbox) : undefined
    }
  }
  return {
    id: el.id,
    kind: el.kind,
    name,
    location: { x: el.rect.x, y: el.rect.y },
    size: { w: el.rect.w, h: el.rect.h },
    text: el.text,
    color: el.color,
    src: el.src ?? null,
    layer: el.layer,
    shape
  }
}

/** Stored loose element -> screen-space element the render/drag code speaks.
 * bbox is reconstructed as the world rect; path is denormalized to fill it. */
export function looseElementToScreen(el: LooseElement): CommittedElement {
  const rect = { x: el.location.x, y: el.location.y, w: el.size.w, h: el.size.h }
  let shape: ShapeResult | undefined
  if (el.shape) {
    shape = {
      op: el.shape.op,
      params: el.shape.params,
      snap: el.shape.snap ?? undefined,
      bbox: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
      path: el.shape.path ? denormalizePath(el.shape.path, rect) : undefined,
      tier: 'high',
      confidence: 1
    }
  }
  return {
    id: el.id,
    kind: el.kind,
    rect,
    text: el.text,
    color: el.color,
    src: el.src ?? undefined,
    shape,
    layer: el.layer
  }
}

/** All loose elements as screen-space elements, for rendering and reads. */
export function looseToScreen(space: LiminalSpace): CommittedElement[] {
  return space.loose.map(looseElementToScreen)
}
