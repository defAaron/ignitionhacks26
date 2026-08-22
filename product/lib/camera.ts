/**
 * The one pan/zoom camera over the infinite plane. Slice 2 replaces native
 * downward-only scroll with a single transformed world container; this module
 * owns every screen<->world<->page-local conversion so no pointer site invents
 * its own math. A single missed conversion lands ink in the wrong place, so all
 * of it funnels through here.
 *
 * Three coordinate spaces:
 *  - screen: viewport pixels (clientX/clientY from a PointerEvent).
 *  - world:  the infinite plane. The camera frames a window onto it.
 *  - local:  page-native coords (page-v1). x measured from the page's top-CENTER
 *            (so x=PAGE_CENTER_X is the middle), y from the page BODY top. This
 *            is the space CommittedElement.rect, sketch strokes and bounds live
 *            in - i.e. the space the whole slice-1 pipeline already speaks.
 *
 * The `.world` DOM node carries `translate(Tx,Ty) scale(zoom)` (see
 * worldTransform); the page BODY sits inside it at world (pageLoc.x -
 * PAGE_CENTER_X, pageLoc.y), so a child positioned at local (lx,ly) renders at
 * world (lx - PAGE_CENTER_X + pageLoc.x, ly + pageLoc.y).
 */

export interface Camera {
  /** World point pinned to the viewport centre. */
  x: number
  y: number
  zoom: number
}

export interface Viewport {
  w: number
  h: number
}

export interface Vec2 {
  x: number
  y: number
}

/** Page body width on the plane. Fixed so the page is a stable object; the
 * focused camera scales it to fill the viewport horizontally. */
export const PAGE_WIDTH = 1200
/** Local x of the page's horizontal centre (page-v1 origin). */
export const PAGE_CENTER_X = PAGE_WIDTH / 2
/** Height of the fixed chrome band (titlebar + tab strip) in focused mode. The
 * page body is inset below it so ink never lands on the chrome. */
export const CHROME_H = 72
/** How far zoomed out the liminal view sits: the page reads as an object. */
export const LIMINAL_ZOOM = 0.5

/* ---------- screen <-> world ---------- */

/** Inverse of the `.world` transform: which world point sits under a pixel. */
export function screenToWorld(sx: number, sy: number, cam: Camera, vp: Viewport): Vec2 {
  return {
    x: (sx - vp.w / 2) / cam.zoom + cam.x,
    y: (sy - vp.h / 2) / cam.zoom + cam.y
  }
}

/** Where a world point lands on screen. */
export function worldToScreen(wx: number, wy: number, cam: Camera, vp: Viewport): Vec2 {
  return {
    x: (wx - cam.x) * cam.zoom + vp.w / 2,
    y: (wy - cam.y) * cam.zoom + vp.h / 2
  }
}

/** Zoom bounds on the plane: far enough out to see a whole site map, close
 * enough in to read a button label. */
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

/** Scale the camera by `factor` about a screen point, keeping the world point
 * under that pixel fixed (so zooming at the cursor feels anchored). */
export function zoomAt(cam: Camera, vp: Viewport, sx: number, sy: number, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor))
  if (zoom === cam.zoom) return cam
  const anchor = screenToWorld(sx, sy, cam, vp)
  return {
    x: anchor.x - (sx - vp.w / 2) / zoom,
    y: anchor.y - (sy - vp.h / 2) / zoom,
    zoom
  }
}

/* ---------- world <-> page-local ---------- */

/** local -> world, given the page's top-centre location on the plane. */
export function localToWorld(lx: number, ly: number, pageLoc: Vec2): Vec2 {
  return { x: lx - PAGE_CENTER_X + pageLoc.x, y: ly + pageLoc.y }
}

/** world -> local (page-native coords the pipeline speaks). */
export function worldToLocal(wx: number, wy: number, pageLoc: Vec2): Vec2 {
  return { x: wx - pageLoc.x + PAGE_CENTER_X, y: wy - pageLoc.y }
}

/* ---------- screen <-> page-local (what pointer sites call) ---------- */

/** THE pointer conversion: a screen pixel to the page-native coord the drawing
 * engine, hit-testing and element placement all use. Every pointer handler
 * routes through this - see the note at the top of the file. */
export function screenToLocal(
  sx: number,
  sy: number,
  cam: Camera,
  vp: Viewport,
  pageLoc: Vec2
): Vec2 {
  const w = screenToWorld(sx, sy, cam, vp)
  return worldToLocal(w.x, w.y, pageLoc)
}

/** local -> screen, for overlays that must sit in screen space but track a
 * point on the page (thinking pill, confirm bar). */
export function localToScreen(
  lx: number,
  ly: number,
  cam: Camera,
  vp: Viewport,
  pageLoc: Vec2
): Vec2 {
  const w = localToWorld(lx, ly, pageLoc)
  return worldToScreen(w.x, w.y, cam, vp)
}

/* ---------- CSS transform for the world container ---------- */

/** The `translate() scale()` string that realises a camera. transform-origin
 * must be `0 0` for this to match screenToWorld. */
export function worldTransform(cam: Camera, vp: Viewport): string {
  const tx = vp.w / 2 - cam.x * cam.zoom
  const ty = vp.h / 2 - cam.y * cam.zoom
  return `translate(${tx}px, ${ty}px) scale(${cam.zoom})`
}

/* ---------- framing: build a camera for each mode ---------- */

/** Focused zoom scales the page body to exactly fill the viewport width. */
export function focusedZoom(vp: Viewport): number {
  return vp.w / PAGE_WIDTH
}

/** Topmost focused camera.y: pins the page body top just under the chrome band. */
export function focusedTopY(vp: Viewport, pageLoc: Vec2): number {
  const zoom = focusedZoom(vp)
  return pageLoc.y + (vp.h / 2 - CHROME_H) / zoom
}

/** Focused camera. `scrollY` is the vertical pan (camera.y); defaults to the
 * top. x is locked to the page centre - the page fills the width, so there is
 * nothing to pan horizontally. */
export function focusedCamera(vp: Viewport, pageLoc: Vec2, scrollY?: number): Camera {
  return {
    x: pageLoc.x,
    y: scrollY ?? focusedTopY(vp, pageLoc),
    zoom: focusedZoom(vp)
  }
}

/** Clamp a focused camera.y so you can neither scroll above the page top nor
 * past its floor. */
export function clampFocusedY(
  y: number,
  vp: Viewport,
  pageLoc: Vec2,
  pageHeight: number
): number {
  const zoom = focusedZoom(vp)
  const top = focusedTopY(vp, pageLoc)
  // camera.y that puts the page floor at the bottom edge of the viewport.
  const bottom = pageLoc.y + pageHeight - vp.h / 2 / zoom
  return Math.min(Math.max(y, top), Math.max(top, bottom))
}

/** Liminal camera: zoomed out so the whole page reads as a bordered object,
 * centred horizontally on the page and framing its upper portion. */
export function liminalCamera(vp: Viewport, pageLoc: Vec2, pageHeight: number): Camera {
  const framed = Math.min(pageHeight, (vp.h / LIMINAL_ZOOM) * 0.85)
  return { x: pageLoc.x, y: pageLoc.y + framed / 2, zoom: LIMINAL_ZOOM }
}

/* ---------- liminal ink canvas frame ---------- */

/** Extra slack around the viewport, each side, for the plane ink canvas - so a
 * small pan doesn't reveal its edge before the next redraw. */
const PLANE_INK_MARGIN = 0.3

/**
 * The plane's sketch surface is conceptually infinite, but a canvas is not: an
 * infinite backing store is impossible. So in liminal the ink canvas is a
 * viewport-sized world rect that FOLLOWS the camera - small enough to allocate,
 * re-drawn with this frame's top-left as its origin every time the camera moves.
 * Returns the world-space top-left `(x,y)` and size `(w,h)`; drawing beyond it
 * is not captured, but loose ELEMENTS (real DOM) still render anywhere.
 */
export function planeInkFrame(cam: Camera, vp: Viewport): { x: number; y: number; w: number; h: number } {
  const w = Math.round((vp.w / cam.zoom) * (1 + PLANE_INK_MARGIN * 2))
  const h = Math.round((vp.h / cam.zoom) * (1 + PLANE_INK_MARGIN * 2))
  return { x: Math.round(cam.x - w / 2), y: Math.round(cam.y - h / 2), w, h }
}
