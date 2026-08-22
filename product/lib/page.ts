import type { CommittedElement, ElementKind, ShapeResult } from './types'
import { KIND_LABEL } from './recognize'

/**
 * page-v1: the page-native document model. A page is a webpage; its elements
 * live in a top-center coordinate space (see below). This is NOT a wrapper over
 * CommittedElement - it is the source of truth. CommittedElement stays as the
 * screen-space shape the render/drag/pipeline code already speaks, and the two
 * are bridged by the converters at the bottom of this file.
 */

/** A committed pipeline result, stripped for storage. `bbox` is dropped -
 * `location`+`size` is the single source of truth for the box. `path` is kept
 * because its silhouette is not derivable from the box; it is stored NORMALIZED
 * (0..1 within the box) so a move or resize needs no path bookkeeping. */
export interface PageShape {
  op: ElementKind
  params: Record<string, unknown>
  snap: string | null
  /** Silhouette points, normalized to 0..1 within the element box. */
  path?: { x: number; y: number }[]
}

export interface PageElement {
  /** Permanent opaque key, generated once at creation. Never changes on rename. */
  id: string
  kind: ElementKind
  /** Friendly, renamable handle. Default is a random readable key. */
  name: string
  /** Top-left corner, relative to the page origin (top edge, horizontal center). */
  location: { x: number; y: number }
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

export interface Page {
  schema: 'page-v1'
  /** Permanent opaque key, prefixed `p_`. */
  id: string
  kind: 'page'
  name: string
  /** true = webpage (fills whitespace). Nesting deferred; flag kept for later. */
  root: boolean
  origin: 'top-center'
  grow: ('down' | 'left' | 'right')[]
  elements: PageElement[]
  baseSite?: import('@/modules/existing-site/types').BaseSite // [existing-site]
}

/* ---------- id + name ---------- */

/** Permanent opaque element key. Generated once at creation, never derived from name. */
export function newElementId(): string {
  return `e_${crypto.randomUUID()}`
}

/** Permanent opaque page key. */
export function newPageId(): string {
  return `p_${crypto.randomUUID()}`
}

/** Label used for default element names, e.g. `button`, `text field`. */
export function kindLabel(kind: ElementKind): string {
  return KIND_LABEL[kind] ?? kind
}

/**
 * Next free `<label> <n>` given the names already in use: `button 1`,
 * `button 2`, ... Numbers are per label and fill the lowest gap, so deleting
 * `button 2` and adding another button hands that number back out.
 */
export function nextName(label: string, taken: Iterable<string>): string {
  const used = new Set<number>()
  const prefix = `${label.toLowerCase()} `
  for (const t of taken) {
    const t0 = t.trim().toLowerCase()
    if (!t0.startsWith(prefix)) continue
    const rest = t0.slice(prefix.length)
    if (/^\d+$/.test(rest)) used.add(Number(rest))
  }
  let n = 1
  while (used.has(n)) n++
  return `${label} ${n}`
}

/** Sequential default for an element of `kind`, e.g. `button 3`. Renamable anytime. */
export function nextElementName(kind: ElementKind, taken: Iterable<string>): string {
  return nextName(kindLabel(kind), taken)
}

/** Sequential default for a page: `canvas 1`, `canvas 2`, ... */
export function nextPageName(taken: Iterable<string>): string {
  return nextName('canvas', taken)
}

/**
 * Mint names for a batch of elements against an existing pool. Each minted
 * name joins the pool so two new buttons in one batch get distinct numbers.
 */
export function mintNames(kinds: ElementKind[], taken: Iterable<string>): string[] {
  const pool = new Set(taken)
  return kinds.map((k) => {
    const name = nextElementName(k, pool)
    pool.add(name)
    return name
  })
}

/** name -> id index. Names are not guaranteed unique; last wins. */
export function nameIndex(page: Page): Map<string, string> {
  const idx = new Map<string, string>()
  for (const el of page.elements) idx.set(el.name, el.id)
  return idx
}

/** Resolve a friendly name to its permanent id ("summon by name"). */
export function resolveName(page: Page, name: string): string | null {
  return nameIndex(page).get(name) ?? null
}

/* ---------- coordinate transform ---------- */
// Origin (0,0) = top edge, horizontal center. x<0 left, x>0 right, y>0 down.
// screenX = centerX + location.x ; screenY = 0 + location.y (pageTop is 0).

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

/* ---------- CommittedElement <-> PageElement bridge ---------- */

/** Screen-space element -> stored page element. `name` is supplied by the
 * caller so a rename/move never regenerates it. Path is normalized against the
 * shape's own bbox (the frame it was drawn in), not the possibly-moved rect. */
export function screenElementToPage(
  el: CommittedElement,
  centerX: number,
  name: string
): PageElement {
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
    location: { x: el.rect.x - centerX, y: el.rect.y },
    size: { w: el.rect.w, h: el.rect.h },
    text: el.text,
    color: el.color,
    src: el.src ?? null,
    layer: el.layer,
    shape
  }
}

/** Stored page element -> screen-space element the render/drag code speaks.
 * bbox is reconstructed as the screen rect (single source of truth); path is
 * denormalized to fill it, so a moved/resized element renders in lockstep. */
export function pageElementToScreen(el: PageElement, centerX: number): CommittedElement {
  const rect = {
    x: centerX + el.location.x,
    y: el.location.y,
    w: el.size.w,
    h: el.size.h
  }
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

/** The whole page as screen-space elements, for rendering and reads. */
export function pageToScreen(page: Page, centerX: number): CommittedElement[] {
  return page.elements.map((el) => pageElementToScreen(el, centerX))
}

/** Reconcile a new screen-space element list back into page elements, keeping
 * each element's `name` by id and minting one for anything new. */
export function syncPageElements(
  prev: Page,
  nextScreen: CommittedElement[],
  centerX: number
): PageElement[] {
  const nameById = new Map(prev.elements.map((el) => [el.id, el.name]))
  const pool = new Set(prev.elements.map((el) => el.name))
  return nextScreen.map((el) => {
    let name = nameById.get(el.id)
    if (!name) {
      name = nextElementName(el.kind, pool)
      pool.add(name)
    }
    return screenElementToPage(el, centerX, name)
  })
}

/* ---------- construction / migration ---------- */

export function emptyPage(name = 'canvas 1'): Page {
  return {
    schema: 'page-v1',
    id: newPageId(),
    kind: 'page',
    name,
    root: true,
    origin: 'top-center',
    grow: ['down', 'left', 'right'],
    elements: []
  }
}

/** Build a page from the current flat CommittedElement list (migration helper). */
export function pageFromElements(elements: CommittedElement[], centerX: number): Page {
  const page = emptyPage()
  const names = mintNames(elements.map((el) => el.kind), [])
  page.elements = elements.map((el, i) => screenElementToPage(el, centerX, names[i]))
  return page
}
