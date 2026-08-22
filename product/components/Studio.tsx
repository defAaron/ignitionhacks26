'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { dropIn, gentle, pickQuote, popIn, riseIn, spring } from '@/lib/motion'
import { isEmpty, sketchBounds, sketchText, STROKE_OPTIONS } from '@/lib/ink'
import { strokesBounds, strokesToPath } from '@/lib/rasterize'
import { KIND_LABEL, normalizeRect, recognize } from '@/lib/recognize'
import type {
  CommittedElement,
  ElementKind,
  Guess,
  Mode,
  Rect,
  ShapeResult,
  Sketch,
  Stroke,
  TextItem,
  Tool
} from '@/lib/types'
import type { FrameElement } from '@/lib/frame/types'
import type { FrameFile } from '@/lib/frame/app-types'
import type { SealedFrame, FramePage } from '@/lib/frame/space-types'
import { stitchHtmlSite } from '@/lib/frame/stitch'
import { isMeaningful, loadSaved, saveSnapshot } from '@/lib/persist'
import { BaseSiteLayer, BaseSiteRow, ImportSiteControl, applyExtraction, extractionTags, frameBaseSiteField, isHtmlFile, makeBaseSite, readHtmlFile } from '@/modules/existing-site' // [existing-site]
import { mintNames, newElementId, pageToScreen, syncPageElements } from '@/lib/page'
import {
  emptySpace,
  addPage,
  addWire,
  looseToScreen,
  screenElementToLoose,
  type LiminalSpace,
  type Wire
} from '@/lib/space'
import { isWaitBlock } from '@/lib/wire/types'
import type { WireEndpoint, WireResponse } from '@/lib/wire/types'
import {
  clampFocusedY,
  focusedCamera,
  liminalCamera,
  localToWorld,
  planeInkFrame,
  screenToLocal as screenToLocalPt,
  screenToWorld as screenToWorldPt,
  worldTransform,
  focusedZoom,
  zoomAt,
  PAGE_CENTER_X,
  PAGE_WIDTH,
  type Camera,
  type Vec2,
  type Viewport
} from '@/lib/camera'
import { ModeToggle } from './ChromeToggle'
import { EditableElement, type Wash } from './EditableElement'
import { FrameOverlay, FramingVeil } from './FrameOverlay'
import { GlyphBook } from './GlyphBook'
import { LayerRail } from './LayerRail'
import { ElementManager } from './ElementManager'
import { SetupNotice } from './SetupNotice'
import { Lockup } from './Logo'
import { Preloader } from './Preloader'
import { PageChrome } from './PageChrome'
import { RenderedElement, isPictureFrame } from './RenderedElement'
import { SketchLayer } from './SketchLayer'
import { PALETTE, Toolbar } from './Toolbar'

/** The two camera framings. Distinct from browse/edit (Mode): 'focused' is
 * inside the page (fills the viewport, chrome band shown); 'liminal' is zoomed
 * out onto the plane with the page as a bordered object. */
type View = 'focused' | 'liminal'

type Phase = 'sketch' | 'thinking' | 'preview'

const EMPTY_SKETCH: Sketch = { strokes: [], texts: [] }
/** Long enough for the shake to read, short enough not to gate the next mark. */
const SHAKE_MS = 460
/** Whole strokes within this distance of the eraser cursor get removed. */
const ERASE_RADIUS = 16
/** Brush size bounds and step for the w/s keys. */
const BRUSH_MIN = 2
const BRUSH_MAX = 24
const BRUSH_STEP = 2
/** How long the size readout lingers near the toolbar after a w/s press. */
const BRUSH_FLASH_MS = 1000
/** Sketch snapshots kept for Ctrl+Z. */
const HISTORY_CAP = 50
/** The page grows another step once the camera nears its floor (local px). */
const GROW_NEAR = 240
/** Wheel zoom sensitivity on the plane: zoom *= e^(-deltaY * rate). ~100px of
 * wheel is one notch of about 14%. */
const WHEEL_ZOOM_RATE = 0.0015
/** How much height each auto-extend adds, in px. */
const GROW_STEP = 400
/** Starting page body height, in local px. Grows on demand from here. */
const INITIAL_PAGE_HEIGHT = 1400
/**
 * Hard ceiling for the page body height. The sketch canvas backing store is
 * height x devicePixelRatio and browsers silently refuse to allocate a canvas
 * past roughly 16k px on a side - growth just stops here, no fanfare.
 */
const MAX_PAGE_HEIGHT = 15000
/** Camera flight duration for a mode switch, in ms; matches the CSS transition. */
const FLY_MS = 520

/** Most page height the sketch canvas can back without dying. */
function pageHeightCap(): number {
  const dprSafe = Math.floor(16000 / (window.devicePixelRatio || 1))
  return Math.min(MAX_PAGE_HEIGHT, dprSafe)
}

/** Axis-aligned rectangle overlap; merely touching edges doesn't count. */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * Overlap spawns a layer: a rect landing on existing elements goes one above
 * the highest thing it covers; clear ground is layer 0.
 */
function layerFor(existing: CommittedElement[], rect: Rect): number {
  let top = -1
  for (const el of existing) {
    if (rectsOverlap(el.rect, rect)) top = Math.max(top, el.layer ?? 0)
  }
  return top + 1
}

/**
 * Peel-aware commit. Unpeeled, a batch simply stacks against everything.
 * Peeled at layer L the page is SLICED there: new elements stack against the
 * slice (layers <= L) only, and one that lands above it is INSERTED between
 * strata - every layer above L lifts by one to make room. `focus` is where
 * the peel should sit afterwards (the top of what was just added), so the
 * fresh element is the saturated one, not washed out by the strata above.
 */
function insertCommits(
  prev: CommittedElement[],
  batch: CommittedElement[],
  peel: number | null
): { next: CommittedElement[]; focus: number | null } {
  const next = [...prev]
  if (peel === null) {
    for (const el of batch) next.push({ ...el, layer: layerFor(next, el.rect) })
    return { next, focus: null }
  }
  let boundary = peel
  for (const el of batch) {
    const slice = next.filter((e) => (e.layer ?? 0) <= boundary)
    const layer = layerFor(slice, el.rect)
    if (layer > boundary) {
      for (let i = 0; i < next.length; i++) {
        const l = next[i].layer ?? 0
        if (l > boundary) next[i] = { ...next[i], layer: l + 1 }
      }
      boundary = layer
    }
    next.push({ ...el, layer })
  }
  return { next, focus: boundary }
}

/** One blooms over each committed shape - the paint landing on the page. */
const SPLOTCH_SRCS = [
  '/splotches/celadon.svg',
  '/splotches/aubergine.svg'
]

interface Splotch {
  id: string
  rect: Rect
  src: string
}

export function Studio(): React.JSX.Element {
  const [sketch, setSketch] = useState<Sketch>(EMPTY_SKETCH)
  // The liminal space is the root: it holds the page as one placed item on the
  // plane (more pages / loose items append later). The page's own element model
  // is untouched - the space only records WHERE it sits.
  const [space, setSpace] = useState<LiminalSpace>(() => emptySpace())
  // Which of space.items is the ACTIVE (focused) page. Liminal renders every
  // page as an object on the plane; clicking one makes it active. items[0] stays
  // valid (primaryPage) but is no longer the only page rendered.
  const [focusedIdx, setFocusedIdx] = useState(0)
  const focusedIdxRef = useRef(focusedIdx)
  focusedIdxRef.current = focusedIdx
  const placed = space.items[focusedIdx] ?? space.items[0]
  const page = placed.page
  const pageLoc: Vec2 = placed.location
  const setPage = useCallback((update: SetStateAction<typeof page>) => {
    setSpace((prev) => {
      const idx = focusedIdxRef.current
      const cur = prev.items[idx] ?? prev.items[0]
      const nextPage =
        typeof update === 'function'
          ? (update as (p: typeof cur.page) => typeof cur.page)(cur.page)
          : update
      return {
        ...prev,
        items: prev.items.map((it, i) => (i === idx ? { ...it, page: nextPage } : it))
      }
    })
  }, [])
  /** Page origin's local x = the page's horizontal centre. Constant now that
   * the camera (not this value) frames the page on screen. */
  const centerX = PAGE_CENTER_X
  const [phase, setPhase] = useState<Phase>('sketch')
  const [guess, setGuess] = useState<Guess | null>(null)
  const [kind, setKind] = useState<ElementKind | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState<string>(PALETTE[0].value)
  const [brushSize, setBrushSize] = useState<number>(STROKE_OPTIONS.size)
  const [sizeFlash, setSizeFlash] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [splotches, setSplotches] = useState<Splotch[]>([])
  /** Splotches for loose commits, rendered on the plane in world coords (the
   * `splotches` above live in the page-clip, page-local). */
  const [planeSplotches, setPlaneSplotches] = useState<Splotch[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Browse by default: the page is just a website until you ask to edit it. */
  const [mode, setMode] = useState<Mode>('browse')
  const [quote, setQuote] = useState<string>('')
  const [framing, setFraming] = useState(false)
  const [framedHtml, setFramedHtml] = useState<string | null>(null)
  const [frameError, setFrameError] = useState<string | null>(null)
  /** The slower "full app" lane, filling in behind the preview: the runnable
   * project's files and its entry path, both null until that lane lands. */
  const [frameFiles, setFrameFiles] = useState<FrameFile[] | null>(null)
  const [frameEntry, setFrameEntry] = useState<string | null>(null)
  /**
   * Per-page Seal cache, keyed by page id. A page is SEALED once its entry here
   * carries html — that presence is what earns the green border and feeds the
   * liminal-level Frame. The two lanes fill it in place: the HTML lane sets
   * html, the app lane sets files/entry, and input holds the exact wireframe
   * they were sealed from so the global lane can never drift from it.
   */
  const [seals, setSeals] = useState<Record<string, SealedFrame>>({})
  /**
   * Element signatures captured at seal time, keyed by page id. An edit to a
   * sealed page changes its signature; the unseal effect below compares against
   * this and drops the stale seal. A ref, not state — pure bookkeeping that must
   * never itself provoke a render.
   */
  const sealSigs = useRef<Record<string, string>>({})
  /** Liminal-level Frame: the space lanes, mirroring the page lanes above. The
   * deterministic stitch fills the site instantly; /api/frame-space fills the
   * routed project behind the open overlay. */
  const [framingSpace, setFramingSpace] = useState(false)
  const [spaceSite, setSpaceSite] = useState<{ files: FrameFile[]; entry: string } | null>(null)
  const [spaceApp, setSpaceApp] = useState<{ files: FrameFile[]; entry: string } | null>(null)
  const [spaceError, setSpaceError] = useState<string | null>(null)
  /** The stitched-site overlay is up. */
  const [spaceOpen, setSpaceOpen] = useState(false)
  /** Page body height, in local px. Grows on demand as the camera nears the floor. */
  const [pageHeight, setPageHeight] = useState(INITIAL_PAGE_HEIGHT)

  // Autosave. Restore once after mount (storage is client-only, so this can't
  // run during render without a hydration mismatch), then snapshot on every
  // change, debounced so a drag doesn't write on every frame.
  const restored = useRef(false)
  useEffect(() => {
    const saved = loadSaved()
    if (saved && isMeaningful(saved.space)) {
      setSpace(saved.space)
      setPageHeight(saved.pageHeight)
    }
    restored.current = true
  }, [])
  useEffect(() => {
    if (!restored.current) return
    const t = setTimeout(() => saveSnapshot(space, pageHeight), 400)
    return () => clearTimeout(t)
  }, [space, pageHeight])
  /** Peel: show only layers at or below this one; null shows everything. */
  const [peelLayer, setPeelLayer] = useState<number | null>(null)
  /** Big center Edit invitation, shown once when arriving from the landing page. */
  const [welcome, setWelcome] = useState(false)
  /** Camera framing: start inside the page (a new project opens focused). */
  const [view, setView] = useState<View>('focused')
  /** Viewport size in screen px; drives every camera conversion. Measured post-mount. */
  const [viewport, setViewport] = useState<Viewport>({ w: 1200, h: 800 })
  /** The one pan/zoom camera. Initialised properly once the viewport is measured. */
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  /** True during a mode-switch camera flight, so the world eases (pans/zooms
   * are instant otherwise). */
  const [flying, setFlying] = useState(false)

  const drawing = useRef(false)
  const editInput = useRef<HTMLInputElement | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  /** Which element an upload is destined for; null means "create a new one". */
  const uploadTarget = useRef<string | null>(null)
  /** Sketch snapshots, one per drawing/erasing action, popped by Ctrl+Z. */
  const past = useRef<Sketch[]>([])
  /** Snapshot taken when an eraser drag starts; pushed once it removes something. */
  const pendingErase = useRef<Sketch | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Live mirrors for the pointer/wheel handlers, which read the freshest camera
  // without re-subscribing. Every screen->world conversion goes through these.
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  // The stage is the studio's own box, not the window: a docked panel beside
  // it (the element manager) takes real width, so every screen->world
  // conversion subtracts the stage's left edge and sizes against the stage.
  const stageRef = useRef<HTMLDivElement>(null)
  const stageLeft = useRef(0)
  // Open by default on wide windows; folded on narrow ones so the 1200px page
  // still fits beside it.
  const [dockOpen, setDockOpen] = useState(true)
  useEffect(() => {
    if (window.innerWidth < 1280) setDockOpen(false)
  }, [])
  const viewRef = useRef(view)
  viewRef.current = view
  const pageLocRef = useRef(pageLoc)
  pageLocRef.current = pageLoc
  // Live space mirror, so enterFocused can read a clicked page's plane location
  // without re-subscribing.
  const spaceRef = useRef(space)
  spaceRef.current = space
  const pageHeightRef = useRef(pageHeight)
  pageHeightRef.current = pageHeight
  const flyingRef = useRef(flying)
  flyingRef.current = flying
  /** Framed real-site overlay is up: pause camera panning underneath it. */
  const framedRef = useRef<string | null>(framedHtml)
  framedRef.current = framedHtml
  /** Liminal background drag-pan anchor, in screen px; null when not panning. */
  const panning = useRef<{ x: number; y: number } | null>(null)

  // The page (top-center coords) is the source of truth. The render, drag and
  // pipeline code all speak screen-space CommittedElement, so derive that view
  // from the page and funnel every edit back through the same converter, which
  // keeps each element's name by id across the round trip.
  const elements = useMemo(() => pageToScreen(page, centerX), [page, centerX])
  const setElements = useCallback((update: SetStateAction<CommittedElement[]>) => {
    setPage((prev) => {
      const prevScreen = pageToScreen(prev, PAGE_CENTER_X)
      const next =
        typeof update === 'function'
          ? (update as (p: CommittedElement[]) => CommittedElement[])(prevScreen)
          : update
      return { ...prev, elements: syncPageElements(prev, next, PAGE_CENTER_X) }
    })
  }, [setPage])

  // Loose elements: the plane's own store (space.loose), in WORLD coords. Same
  // screen-space CommittedElement the render/drag code speaks, derived from the
  // world-positioned store and funnelled back through the loose converter. This
  // is the liminal counterpart of `elements`/`setElements` above.
  const looseElements = useMemo(() => looseToScreen(space), [space])
  /** Move/resize a loose element: write its new world rect back to the store. */
  const moveLoose = useCallback((id: string, rect: Rect) => {
    setSpace((prev) => ({
      ...prev,
      loose: prev.loose.map((l) =>
        l.id === id ? { ...l, location: { x: rect.x, y: rect.y }, size: { w: rect.w, h: rect.h } } : l
      )
    }))
  }, [])
  /** Commit a batch of world-space elements as loose elements on the plane. */
  const commitLoose = useCallback((batch: CommittedElement[]) => {
    setSpace((prev) => {
      const names = mintNames(batch.map((el) => el.kind), prev.loose.map((l) => l.name))
      return { ...prev, loose: [...prev.loose, ...batch.map((el, i) => screenElementToLoose(el, names[i]))] }
    })
  }, [])

  /**
   * Resolve an arrow endpoint (a point in the active view's coord space) to the
   * object it landed on, as a WireEndpoint the /api/wire contract speaks. On the
   * plane: loose elements first (topmost wins), then whole page objects by their
   * world rect. Focused: the active page's own elements only. Null = it hit bare
   * space, so the arrow is not a connection.
   */
  const resolveEndpoint = useCallback((pt: Vec2, onPlane: boolean): WireEndpoint | null => {
    const inRect = (r: Rect): boolean =>
      pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h
    const sp = spaceRef.current
    if (onPlane) {
      const loose = looseToScreen(sp)
      for (let i = loose.length - 1; i >= 0; i--) {
        const el = loose[i]
        if (inRect(el.rect)) return { id: el.id, kind: el.kind, text: el.text || undefined }
      }
      for (let i = sp.items.length - 1; i >= 0; i--) {
        const it = sp.items[i]
        const r: Rect = { x: it.location.x - PAGE_WIDTH / 2, y: it.location.y, w: PAGE_WIDTH, h: INITIAL_PAGE_HEIGHT }
        if (inRect(r)) return { id: it.page.id, kind: 'page', text: it.page.name }
      }
      return null
    }
    const active = sp.items[focusedIdxRef.current] ?? sp.items[0]
    const els = pageToScreen(active.page, PAGE_CENTER_X)
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]
      if (inRect(el.rect)) return { id: el.id, kind: el.kind, text: el.text || undefined }
    }
    return null
  }, [])

  /**
   * P3 — turn a resolved connecting arrow into a wire. Add it immediately with a
   * null block (the ink is already consumed), then ask /api/wire to interpret the
   * connection and write the returned block onto it. A failure surfaces via the
   * frame-error toast and removes the dangling wire. Auto-accepted for this slice:
   * a visible "accept with Enter" gate is deferred (see build-plan.md).
   */
  const createWire = useCallback((source: WireEndpoint, target: WireEndpoint) => {
    const wireId = `w_${crypto.randomUUID()}`
    const wire: Wire = { id: wireId, sourceId: source.id, targetId: target.id, block: null }
    setSpace((prev) => addWire(prev, wire))
    void (async () => {
      try {
        const res = await fetch('/api/wire', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ arrowId: wireId, source, target, cells: [] })
        })
        const json = (await res.json()) as WireResponse
        if (json.ok) {
          setSpace((prev) => ({
            ...prev,
            wires: prev.wires.map((w) => (w.id === wireId ? { ...w, block: json.output.block } : w))
          }))
        } else {
          setFrameError(json.reason || 'wiring failed')
          setSpace((prev) => ({ ...prev, wires: prev.wires.filter((w) => w.id !== wireId) }))
        }
      } catch (e) {
        setFrameError(`wiring failed — ${e instanceof Error ? e.message : 'network error'}`)
        setSpace((prev) => ({ ...prev, wires: prev.wires.filter((w) => w.id !== wireId) }))
      }
    })()
  }, [])

  /** Wire lines to draw on the plane: each connection as a world-space segment
   * between its endpoints' centres (a loose element's rect, or a page object's
   * world rect). Endpoints that no longer resolve are dropped. */
  const wireLines = useMemo(() => {
    const centerOf = (id: string): Vec2 | null => {
      const le = looseElements.find((e) => e.id === id)
      if (le) return { x: le.rect.x + le.rect.w / 2, y: le.rect.y + le.rect.h / 2 }
      const it = space.items.find((p) => p.page.id === id)
      if (it) return { x: it.location.x, y: it.location.y + INITIAL_PAGE_HEIGHT / 2 }
      return null
    }
    return space.wires
      .map((w) => ({ id: w.id, a: centerOf(w.sourceId), b: centerOf(w.targetId) }))
      .filter((l): l is { id: string; a: Vec2; b: Vec2 } => !!l.a && !!l.b)
  }, [space.wires, space.items, looseElements])

  const bounds = useMemo(() => sketchBounds(sketch), [sketch])
  /** Distinct layers on the page, ascending. The rail only shows for two or more. */
  const layers = useMemo(() => {
    const distinct = new Set(elements.map((el) => el.layer ?? 0))
    return [...distinct].sort((a, b) => a - b)
  }, [elements])
  /** What the current peel leaves legible (focused layer + washed ones below).
   * Frame captures this same set — near-invisible layers above stay out. */
  const visibleElements = useMemo(
    () => (peelLayer === null ? elements : elements.filter((el) => (el.layer ?? 0) <= peelLayer)),
    [elements, peelLayer]
  )

  /** Which frame is under a file being dragged (root-level DnD hit-test). */
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  /** Topmost droppable frame under a document-space point, respecting the peel
   * (a washed-away stratum shouldn't catch a photo). */
  const findFrameAt = useCallback(
    (x: number, y: number): CommittedElement | null => {
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i]
        if (peelLayer !== null && (el.layer ?? 0) > peelLayer) continue
        const { rect } = el
        if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) continue
        if (isPictureFrame(el.kind, el.shape)) return el
      }
      return null
    },
    [elements, peelLayer]
  )

  /** Loose-frame hit-test for liminal DnD/paste: same job as findFrameAt but
   * over the plane store (world coords, no peel). */
  const findLooseFrameAt = useCallback(
    (x: number, y: number): CommittedElement | null => {
      for (let i = looseElements.length - 1; i >= 0; i--) {
        const el = looseElements[i]
        const { rect } = el
        if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) continue
        if (isPictureFrame(el.kind, el.shape)) return el
      }
      return null
    },
    [looseElements]
  )

  /** The peel wash ladder: focused layer saturated, layers behind washed,
   * layers above extra-washed toward invisible as their distance grows. */
  const washFor = (el: CommittedElement): Wash | null => {
    if (peelLayer === null) return null
    const delta = (el.layer ?? 0) - peelLayer
    if (delta === 0) return { opacity: 1, saturate: 1.15, interactive: true }
    if (delta < 0) return { opacity: 0.72, saturate: 0.4, interactive: false }
    return { opacity: Math.max(0.07, 0.26 - 0.1 * (delta - 1)), saturate: 0.12, interactive: false }
  }
  const previewRect: Rect | null = useMemo(
    () => (kind && bounds ? normalizeRect(kind, bounds) : null),
    [kind, bounds]
  )

  // Mirrors state for the key handler, which is bound once.
  const latest = useRef({ sketch, phase, bounds, kind, guess, editing, selectedId, mode })
  latest.current = { sketch, phase, bounds, kind, guess, editing, selectedId, mode }

  // Peel mirror for the commit paths (their useCallbacks would close over a
  // stale value otherwise).
  const peelRef = useRef(peelLayer)
  peelRef.current = peelLayer

  /**
   * Every element-creating path funnels here so peel-slicing (insertCommits)
   * applies uniformly. When a peeled commit inserts a stratum, the peel
   * follows it - queued as a microtask because updaters must stay pure.
   */
  const commitElements = useCallback((batch: CommittedElement[]) => {
    setElements((prev) => {
      const { next, focus } = insertCommits(prev, batch, peelRef.current)
      if (focus !== null && focus !== peelRef.current) {
        queueMicrotask(() => setPeelLayer(focus))
      }
      return next
    })
  }, [])

  /**
   * Browse is the page as a website: sketch and chrome step aside and the
   * committed elements become genuinely interactive, so what's left is the
   * page you built plus a quote. Edit lifts the glaze and brings the tools out.
   */
  const toggleMode = useCallback(() => {
    setMode((prev) => {
      if (prev === 'edit') {
        setQuote((q) => pickQuote(q))
        setSelectedId(null)
        return 'browse'
      }
      return 'edit'
    })
  }, [])

  // Arriving from the landing page (?welcome=1): offer one oversized Edit
  // button front and center. The param is stripped immediately so a refresh
  // or a shared URL doesn't re-invite.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('welcome')) {
      url.searchParams.delete('welcome')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
      setWelcome(true)
    }
  }, [])

  // Entering edit by any route (big button, the pill, H) consumes the invitation.
  useEffect(() => {
    if (mode === 'edit') setWelcome(false)
  }, [mode])

  /**
   * Peeling is a view, not an edit context: hidden elements unmount, new
   * commits still stack against everything. Clearing the selection matters -
   * a peeled-away element must not stay selected, or Delete would reach
   * through the peel.
   */
  const peelTo = useCallback((layer: number | null) => {
    setPeelLayer(layer)
    setSelectedId(null)
  }, [])

  // A one-layer page has nothing to peel; snap back to showing everything.
  useEffect(() => {
    if (layers.length < 2) setPeelLayer(null)
  }, [layers.length])

  /**
   * Seal: the page-level anti-edit. Send the committed page to Claude, get the
   * real site back — AND cache it against this page's id, so the page locks with
   * a green border and stands ready to join the liminal-level Frame. Same two
   * racing lanes as before; the cache is written in place as each one lands.
   */
  async function seal(): Promise<void> {
    if (framing || visibleElements.length === 0) return
    // Bind the target page NOW: async lanes must write to the page that was
    // sealed even if focus wanders to another before they land.
    const id = page.id
    setFraming(true)
    setFrameError(null)
    // A fresh seal starts with an empty project; the app lane refills it.
    setFrameFiles(null)
    setFrameEntry(null)

    // Peeled-away elements stay out of the seal: you seal what you see.
    const payload: FrameElement[] = visibleElements.map((el) => ({
      kind: el.kind,
      rect: el.rect,
      text: el.text || undefined,
      src: el.src,
      shape: el.shape ? { op: el.shape.op, params: el.shape.params } : undefined
    }))
    const canvas = { width: PAGE_WIDTH, height: pageHeight }
    // One body feeds both lanes: element rects are page-local; the canvas is the
    // page body itself.
    const body = JSON.stringify({ elements: payload, canvas })
    const bodyHtml = JSON.stringify({ elements: payload, canvas, ...frameBaseSiteField(page) }) // [existing-site]
    // Open the cache entry now (html still null → not yet sealed) and record the
    // wireframe's signature, so an edit after this can tell the seal is stale.
    setSeals((s) => ({ ...s, [id]: { input: { elements: payload, canvas, ...frameBaseSiteField(page) }, html: null, files: null, entry: null } })) // [existing-site]
    sealSigs.current[id] = JSON.stringify(page.elements)

    const post = (path: string): Promise<Response> =>
      fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: path === '/api/frame' ? bodyHtml : body }) // [existing-site]

    // Two lanes leave the gate together and race. The HTML lane paints the
    // preview the instant it lands; the app lane keeps building behind the open
    // overlay and offers a downloadable project when it's ready. Neither waits
    // on the other.
    const htmlLane = post('/api/frame')
    const appLane = post('/api/frame-app')

    // The app lane is fire-and-forget: it can win, lose, or fail without ever
    // touching the preview. A failure here is a missing download, not a broken
    // seal, so it stays out of frameError and only whispers to the console.
    appLane
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) {
          setFrameFiles(json.files)
          setFrameEntry(json.entry)
          // Cache the project against the page it was sealed from.
          setSeals((s) => (s[id] ? { ...s, [id]: { ...s[id], files: json.files, entry: json.entry } } : s))
        } else {
          console.warn('Seal app lane declined:', json.reason)
        }
      })
      .catch((err) => console.warn('Seal app lane failed:', err))

    // The HTML lane owns the veil and the overlay: framing stays true until it
    // settles, so the veil lifts exactly when there's something to show. Its
    // html is also what locks the page (green border) and feeds the global stitch.
    try {
      const json = await (await htmlLane).json()
      if (json.ok) {
        setFramedHtml(json.html)
        setSeals((s) => (s[id] ? { ...s, [id]: { ...s[id], html: json.html } } : s))
      } else {
        setFrameError(json.reason ?? 'Seal failed')
      }
    } catch {
      setFrameError('Seal failed - network error')
    } finally {
      setFraming(false)
    }
  }

  /**
   * Unseal on edit: a sealed page whose wireframe changes is no longer the page
   * that was sealed, so its lock drops. Only the FOCUSED page's elements can
   * change, so we watch that one — comparing its live signature against the one
   * banked at seal time. The seal's own landing render matches (sealSigs was set
   * from the same elements), so sealing never immediately unseals itself.
   */
  useEffect(() => {
    const id = page.id
    if (!seals[id]) return
    const sig = JSON.stringify(page.elements)
    if (sealSigs.current[id] === sig) return
    delete sealSigs.current[id]
    setSeals((s) => {
      if (!s[id]) return s
      const n = { ...s }
      delete n[id]
      return n
    })
  }, [page.id, page.elements, seals])

  /** Sealed pages available to the liminal-level Frame (html landed). */
  const sealedCount = useMemo(
    () => Object.values(seals).filter((s) => s?.html).length,
    [seals]
  )

  /**
   * Frame the space: gather every sealed page and connect them into one
   * multi-page site. Two lanes, like Seal — but the HTML lane is a PURE,
   * deterministic stitch of the pages' cached html (no network), so the site is
   * ready instantly; /api/frame-space fills the routed project behind the open
   * overlay. Connections are empty for now (Phase 3 derives them from arrows).
   */
  function frameSpace(): void {
    // Build one FramePage per sealed page, reusing its sealed-from wireframe and
    // its plane name; skip any that lost their html.
    const pages: FramePage[] = []
    for (const it of spaceRef.current.items) {
      const sealed = seals[it.page.id]
      if (!sealed?.html) continue
      pages.push({
        id: it.page.id,
        name: it.page.name,
        elements: sealed.input.elements,
        canvas: sealed.input.canvas
      })
    }
    if (pages.length === 0) return

    setFramingSpace(true)
    setSpaceError(null)
    setSpaceApp(null)

    // HTML lane — instant: stitch the cached page documents into a linked site.
    const site = stitchHtmlSite(
      pages.map((p) => ({ id: p.id, name: p.name, html: seals[p.id].html! })),
      []
    )
    setSpaceSite(site)
    setSpaceOpen(true)
    setFramingSpace(false)

    // App lane — fire-and-forget, isolated: a failure is a missing project
    // download, never a broken site, so it only softens spaceError + warns.
    fetch('/api/frame-space', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pages, connections: [] })
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) setSpaceApp({ files: json.files, entry: json.entry })
        else {
          console.warn('Frame-space app lane declined:', json.reason)
          setSpaceError(json.reason ?? null)
        }
      })
      .catch((err) => {
        console.warn('Frame-space app lane failed:', err)
        setSpaceError('project lane unavailable')
      })
  }

  // Frame errors read once, then clear themselves.
  useEffect(() => {
    if (!frameError) return
    const t = setTimeout(() => setFrameError(null), /API_KEY/.test(frameError) ? 9000 : 4000)
    return () => clearTimeout(t)
  }, [frameError])

  // Landing in browse means the quote is on screen from the first frame, but
  // picking it during render would trip a hydration mismatch - so post-mount.
  useEffect(() => {
    setQuote((q) => q || pickQuote())
  }, [])

  /** THE pointer conversion, bound to the live camera. Screen pixel ->
   * page-local coord; every drop/paste/hit-test site routes through it, and
   * SketchLayer takes it as `toLocal`. */
  const screenToLocal = useCallback((clientX: number, clientY: number): Vec2 => {
    return screenToLocalPt(clientX - stageLeft.current, clientY, cameraRef.current, viewportRef.current, pageLocRef.current)
  }, [])

  /**
   * The liminal pointer conversion: screen pixel -> WORLD coord on the plane.
   * The plane sketch surface and every loose-element hit-test route through it,
   * exactly as focused sites route through `screenToLocal`. Branching lives at
   * the call sites (page SketchLayer gets `screenToLocal`, plane SketchLayer
   * gets this), so a single gesture never mixes the two spaces - the CRITICAL
   * one-space-per-gesture invariant.
   */
  const toWorld = useCallback((clientX: number, clientY: number): Vec2 => {
    return screenToWorldPt(clientX - stageLeft.current, clientY, cameraRef.current, viewportRef.current)
  }, [])

  /** Move the camera to `target` with an eased flight (mode switches only). */
  const flyTo = useCallback((target: Camera) => {
    setFlying(true)
    setCamera(target)
    if (flyTimer.current) clearTimeout(flyTimer.current)
    flyTimer.current = setTimeout(() => setFlying(false), FLY_MS)
  }, [])

  /** Enter a SPECIFIC page (its location becomes the focused pageLoc): make it
   * active, fly in and frame it to fill the viewport. Called with the clicked
   * page's index, so any page on the plane can be entered. */
  const enterFocused = useCallback((idx: number) => {
    const loc = spaceRef.current.items[idx]?.location
    if (!loc) return
    if (idx !== focusedIdxRef.current) {
      setFocusedIdx(idx)
      // A different page has its own body; start it at the base height (per-page
      // grown heights are not persisted — nested/multi-page growth is deferred).
      setPageHeight(INITIAL_PAGE_HEIGHT)
      pageHeightRef.current = INITIAL_PAGE_HEIGHT
    }
    pageLocRef.current = loc
    if (viewRef.current === 'focused' && idx === focusedIdxRef.current) return
    setView('focused')
    flyTo(focusedCamera(viewportRef.current, loc))
  }, [flyTo])

  /** Escape the page: drop edit affordances and zoom out to the plane. Wired to
   * the red close light, NOT Esc (Esc stays for selection/sketch/browse). */
  const escapeToLiminal = useCallback(() => {
    if (viewRef.current === 'liminal') return
    setSelectedId(null)
    setView('liminal')
    flyTo(liminalCamera(viewportRef.current, pageLocRef.current, pageHeightRef.current))
  }, [flyTo])

  /**
   * P4 — a click in browse mode activates any wire whose SOURCE is this object.
   * A wire whose block navigates (output.type 'page') flies into the target page
   * (matched by page id in space.items). Other wires are stored but inert here.
   */
  const activateElement = useCallback((id: string) => {
    const sp = spaceRef.current
    for (const w of sp.wires) {
      const block = w.block
      if (w.sourceId !== id || !block || isWaitBlock(block)) continue
      if (block.output.type !== 'page') continue
      const idx = sp.items.findIndex((it) => it.page.id === block.output.to)
      if (idx >= 0) {
        enterFocused(idx)
        return
      }
    }
  }, [enterFocused])

  // Viewport size drives every camera conversion. Measured post-mount (window
  // is client-only) and on resize, re-framing the page for the current mode.
  useEffect(() => {
    const measure = (): void => {
      const box = stageRef.current?.getBoundingClientRect()
      stageLeft.current = box?.left ?? 0
      const vp: Viewport = { w: box?.width || window.innerWidth, h: box?.height || window.innerHeight }
      setViewport(vp)
      setCamera((cam) =>
        viewRef.current === 'focused'
          ? focusedCamera(
              vp,
              pageLocRef.current,
              clampFocusedY(cam.y, vp, pageLocRef.current, pageHeightRef.current)
            )
          : liminalCamera(vp, pageLocRef.current, pageHeightRef.current)
      )
    }
    measure()
    window.addEventListener('resize', measure)
    // The dock opening/closing resizes the stage without a window resize.
    const ro = stageRef.current ? new ResizeObserver(measure) : null
    if (stageRef.current) ro?.observe(stageRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [])

  // Leaving select mode drops the selection, so handles can't linger over a
  // drawing you've moved on to.
  useEffect(() => {
    if (tool !== 'select') setSelectedId(null)
  }, [tool])

  /** "+ space": grow the page a screenful and pan down to it. */
  const addSpace = useCallback(() => {
    const vp = viewportRef.current
    const loc = pageLocRef.current
    const zoom = focusedZoom(vp)
    const grow = Math.round(vp.h / zoom)
    const nextHeight = Math.min(pageHeightRef.current + grow, pageHeightCap())
    setPageHeight(nextHeight)
    setCamera((c) => ({ ...c, y: clampFocusedY(c.y + (vp.h * 0.8) / zoom, vp, loc, nextHeight) }))
  }, [])

  // Free 2D pan replaces native downward-only scroll. In focused the wheel
  // scrolls the page vertically (camera.y) and the page grows as its floor
  // nears; in liminal the wheel pans the plane freely. rAF-throttled. Paused
  // during a mode flight and while the framed real-site overlay is up.
  useEffect(() => {
    let raf = 0
    let ax = 0
    let ay = 0
    let sx = 0
    let sy = 0
    const flush = (): void => {
      raf = 0
      const cam = cameraRef.current
      const vp = viewportRef.current
      const loc = pageLocRef.current
      if (viewRef.current === 'focused') {
        const zoom = focusedZoom(vp)
        const y = clampFocusedY(cam.y + ay / zoom, vp, loc, pageHeightRef.current)
        setCamera({ x: loc.x, y, zoom })
        // Grow when the viewport's bottom edge nears the page floor (world y).
        const viewportBottom = y + vp.h / 2 / zoom
        const floor = loc.y + pageHeightRef.current
        if (floor - viewportBottom < GROW_NEAR) {
          setPageHeight((p) => Math.min(p + GROW_STEP, pageHeightCap()))
        }
      } else {
        // Plane: the wheel zooms about the cursor (so the point under it stays
        // put); horizontal wheel / shift-wheel still slides sideways.
        const zoomed = ay ? zoomAt(cam, vp, sx, sy, Math.exp(-ay * WHEEL_ZOOM_RATE)) : cam
        setCamera(ax ? { ...zoomed, x: zoomed.x + ax / zoomed.zoom } : zoomed)
      }
      ax = 0
      ay = 0
    }
    const onWheel = (e: WheelEvent): void => {
      if (flyingRef.current || framedRef.current) return
      // Ctrl+wheel is the browser's own page zoom (and trackpad pinch); keep it
      // for the studio. Other wheel events were already passive-safe.
      if (e.ctrlKey) e.preventDefault()
      sx = e.clientX - stageLeft.current
      sy = e.clientY
      if (viewRef.current === 'focused' || !e.shiftKey) {
        ax += e.deltaX
        ay += e.deltaY
      } else {
        ax += e.deltaY
      }
      if (!raf) raf = requestAnimationFrame(flush)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', onWheel)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Middle-mouse drag pans in both views. Captured on the window before any
  // React handler so neither the sketch layer nor an element sees the press;
  // preventDefault also stops the browser's autoscroll cursor. Focused stays
  // vertical-only and clamped to the page, exactly like the wheel.
  useEffect(() => {
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent): void => {
      if (e.button !== 1 || flyingRef.current || framedRef.current) return
      e.preventDefault()
      e.stopPropagation()
      last = { x: e.clientX, y: e.clientY }
      document.body.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent): void => {
      if (!last) return
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      const cam = cameraRef.current
      if (viewRef.current === 'focused') {
        const vp = viewportRef.current
        const loc = pageLocRef.current
        const y = clampFocusedY(cam.y - dy / cam.zoom, vp, loc, pageHeightRef.current)
        setCamera({ ...cam, y })
      } else {
        setCamera({ ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom })
      }
    }
    const up = (e: PointerEvent): void => {
      if (!last || e.button !== 1) return
      last = null
      document.body.style.cursor = ''
      e.preventDefault()
      e.stopPropagation()
    }
    // Middle-click also fires auxclick (and would paste on Linux); swallow it.
    const aux = (e: MouseEvent): void => {
      if (e.button === 1) e.preventDefault()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('auxclick', aux, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('auxclick', aux, true)
      document.body.style.cursor = ''
    }
  }, [])

  const clearSketch = useCallback((withShake = true) => {
    // A shaken-off sketch is gone for good - undo should not resurrect ink
    // from before a commit.
    past.current = []
    pendingErase.current = null
    if (withShake) {
      setShaking(true)
      window.setTimeout(() => {
        setSketch(EMPTY_SKETCH)
        setShaking(false)
      }, SHAKE_MS)
    } else {
      setSketch(EMPTY_SKETCH)
    }
    setPhase('sketch')
    setGuess(null)
    setKind(null)
    setEditing(null)
  }, [])

  // A gesture never spans views: crossing focused<->liminal drops any pending
  // sketch/preview, so world coords can't leak into a page-local gesture (or
  // vice versa). Skipped on the first render so a fresh mount keeps its state.
  const firstViewRun = useRef(true)
  useEffect(() => {
    if (firstViewRun.current) {
      firstViewRun.current = false
      return
    }
    clearSketch(false)
    setSelectedId(null)
  }, [view, clearSketch])

  /** First Enter: ask the mock what this is. */
  const runGuess = useCallback(async () => {
    const cur = latest.current
    if (cur.phase !== 'sketch' || isEmpty(cur.sketch) || !cur.bounds) return
    // The space a gesture speaks is fixed by its view. recognize() is async, so
    // a focused<->liminal crossing mid-flight would let a stale result land in
    // the wrong space (world-coord shapes stamped into the page preview, or the
    // reverse). Capture the view now; drop the result if it changed on return.
    const startView = viewRef.current

    setPhase('thinking')
    try {
      const result = await recognize(cur.sketch, cur.bounds)
      if (viewRef.current !== startView) return
      setGuess(result)
      setKind(result.kind)
      setPhase('preview')
    } catch (e) {
      if (viewRef.current !== startView) return
      setPhase('sketch') // ink is preserved, user can retry with Enter
      // Never fail silently - "nothing happened" reads as broken recognition
      // when it is usually quota or network. The pill says so.
      const msg = e instanceof Error ? e.message : ''
      setFrameError(
        /429|quota|rate/i.test(msg)
          ? 'recognizer is rate-limited — wait ~30s, then Enter again (ink kept)'
          : /API_KEY/.test(msg)
            ? `${msg} — ink kept`
            : `recognition failed — ink kept, press Enter to retry${msg ? ` (${msg.slice(0, 80)})` : ''}`
      )
    }
  }, [])

  /** Second Enter: commit it to the page and shake the sketch away. */
  const confirm = useCallback(() => {
    const cur = latest.current
    if (cur.phase !== 'preview' || !cur.kind || !cur.bounds) return

    // The gesture's coords already sit in the active view's space (page-local
    // when focused, world when liminal - see toWorld/screenToLocal), so the
    // element rects below are ready for whichever store we land them in.
    const onPlane = viewRef.current !== 'focused'

    const shapes = cur.guess?.shapes

    // P2/P3 — a CONNECTING arrow becomes a wire, not a shape. Detect it before the
    // normal commit path: the guess resolved to op `arrow` (a plain arrow guess or
    // a lone arrow shape). Endpoints come from the RAW sketch — the stroke with the
    // most points, tail = first point, tip = last — already in the active view's
    // coord space. Both must land on DISTINCT objects, or it is just a drawn arrow
    // and we fall through to the normal shape/element commit below.
    const isArrow =
      cur.kind === 'arrow' ||
      cur.guess?.kind === 'arrow' ||
      (!!shapes && shapes.length === 1 && shapes[0].op === 'arrow')
    if (isArrow && cur.sketch.strokes.length > 0) {
      const stroke = cur.sketch.strokes.reduce((a, b) =>
        b.points.length > a.points.length ? b : a
      )
      if (stroke.points.length >= 2) {
        const tail = stroke.points[0]
        const tip = stroke.points[stroke.points.length - 1]
        const source = resolveEndpoint({ x: tail.x, y: tail.y }, onPlane)
        const target = resolveEndpoint({ x: tip.x, y: tip.y }, onPlane)
        if (source && target && source.id !== target.id) {
          createWire(source, target)
          clearSketch(true)
          return
        }
      }
    }

    if (shapes && shapes.length > 0) {
      // Page glyph (box + p -> op `page`): SPAWN a new page object in the liminal
      // space rather than commit an element. Ambiguous ink can never reach here —
      // placeholder is coerced to rect upstream, and only glyph p maps to page.
      // Nested pages are deferred, so a page drawn while focused still lands on
      // the PLANE (lift its page-local box to world coords). We do NOT auto-enter
      // it: it appears on the plane for the user to click.
      const pageShapes = shapes.filter((s) => s.op === 'page')
      const elementShapes = shapes.filter((s) => s.op !== 'page')

      if (pageShapes.length > 0) {
        setSpace((prev) => {
          let next = prev
          for (const s of pageShapes) {
            const cx = s.bbox.x + s.bbox.width / 2 // box centre-x
            const top = s.bbox.y // box top-y
            // Draw coords are world when liminal, page-local when focused — lift
            // local -> world so the page always lands on the plane.
            const loc = onPlane ? { x: cx, y: top } : localToWorld(cx, top, pageLocRef.current)
            next = addPage(next, loc)
          }
          return next
        })
        // A watercolor splotch blooms over each spawned page box, as usual, in
        // whichever space the gesture ran in.
        const pageBloom = (prev: Splotch[]): Splotch[] => [
          ...prev,
          ...pageShapes.map((s, i) => ({
            id: newElementId(),
            rect: { x: s.bbox.x, y: s.bbox.y, w: s.bbox.width, h: s.bbox.height },
            src: SPLOTCH_SRCS[(prev.length + i) % SPLOTCH_SRCS.length]
          }))
        ]
        if (onPlane) setPlaneSplotches(pageBloom)
        else setSplotches(pageBloom)
      }

      if (elementShapes.length > 0) {
        // Pipeline guesses commit EVERY (non-page) result as its own element,
        // each individually movable, with a splotch of paint blooming over it.
        const text = sketchText(cur.sketch)
        const committed: CommittedElement[] = elementShapes.map((shape) => ({
          id: newElementId(),
          kind: shape.op,
          rect: { x: shape.bbox.x, y: shape.bbox.y, w: shape.bbox.width, h: shape.bbox.height },
          text,
          color,
          shape
        }))
        const splotchesOf = (prev: Splotch[]): Splotch[] => [
          ...prev,
          ...committed.map((el, i) => ({
            id: el.id,
            rect: el.rect,
            src: SPLOTCH_SRCS[(prev.length + i) % SPLOTCH_SRCS.length]
          }))
        ]
        if (onPlane) {
          // Loose commit: land on the plane in world coords, splotch in world coords.
          commitLoose(committed)
          setPlaneSplotches(splotchesOf)
        } else {
          // Layers assigned sequentially (batch shapes stack on each other too);
          // peel-aware, so committing into a slice inserts between strata.
          commitElements(committed)
          setSplotches(splotchesOf)
        }
      }
      clearSketch(true)
      return
    }

    const rect = normalizeRect(cur.kind as ElementKind, cur.bounds as Rect)
    const one: CommittedElement[] = [
      {
        id: newElementId(),
        kind: cur.kind as ElementKind,
        rect,
        text: sketchText(cur.sketch),
        color
      }
    ]
    if (onPlane) commitLoose(one)
    else commitElements(one)
    clearSketch(true)
  }, [color, clearSketch, commitElements, commitLoose, resolveEndpoint, createWire])

  /**
   * "Keep as drawn": swap every pipeline result for the raw ink - one
   * smooth_path per stroke, in document coordinates, colours preserved.
   */
  const keepAsDrawn = useCallback(() => {
    const cur = latest.current
    if (!cur.guess?.shapes || cur.sketch.strokes.length === 0) return

    const shapes: ShapeResult[] = cur.sketch.strokes.map((s) => {
      const raster = { id: s.id, points: s.points, color: s.color, width: 3 }
      const path = strokesToPath([raster])
      while (path.length < 3) path.push({ ...path[path.length - 1] }) // template needs >=3 points; dots stay dots
      const b = strokesBounds([raster]) ?? { x: path[0].x, y: path[0].y, w: 1, h: 1 }
      return {
        op: 'smooth_path' as const,
        params: { stroke: { color: s.color, width: 3 } },
        bbox: { x: b.x, y: b.y, width: b.w, height: b.h },
        path,
        tier: 'high' as const,
        confidence: 1
      }
    })
    setGuess((prev) => (prev ? { ...prev, shapes } : prev))
    setKind('smooth_path')
  }, [])

  const pushHistory = useCallback((snap: Sketch) => {
    past.current.push(snap)
    if (past.current.length > HISTORY_CAP) past.current.shift()
  }, [])

  const handleStrokeEnd = useCallback(
    (stroke: Stroke) => {
      drawing.current = false
      pushHistory(latest.current.sketch)
      setSketch((prev) => ({ ...prev, strokes: [...prev.strokes, stroke] }))
    },
    [pushHistory]
  )

  const placeText = useCallback(
    (x: number, y: number) => {
      const item: TextItem = { id: crypto.randomUUID(), x, y, text: '', color }
      pushHistory(latest.current.sketch)
      setSketch((prev) => ({ ...prev, texts: [...prev.texts, item] }))
      setEditing(item.id)
    },
    [color, pushHistory]
  )

  const updateText = useCallback((id: string, text: string) => {
    setSketch((prev) => ({
      ...prev,
      texts: prev.texts.map((t) => (t.id === id ? { ...t, text } : t))
    }))
  }, [])

  const commitText = useCallback((id: string) => {
    setEditing(null)
    // Drop empties so a stray click doesn't leave an invisible text item that
    // still counts toward the bounding box.
    setSketch((prev) => ({ ...prev, texts: prev.texts.filter((t) => t.id !== id || t.text.trim()) }))
  }, [])

  const moveElement = useCallback((id: string, rect: Rect) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, rect } : el)))
  }, [])

  // Delete reaches into whichever store holds the id - a selection is a single
  // id shared across page and loose elements, so one handler serves both views.
  const deleteElement = useCallback((id: string) => {
    setElements((prev) => (prev.some((el) => el.id === id) ? prev.filter((el) => el.id !== id) : prev))
    setSpace((prev) =>
      prev.loose.some((l) => l.id === id) ? { ...prev, loose: prev.loose.filter((l) => l.id !== id) } : prev
    )
    setSelectedId(null)
  }, [])

  const readImage = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Could not read that file'))
      reader.readAsDataURL(file)
    })
  }, [])

  /** Opens the picker for an existing image element. */
  const requestUpload = useCallback((id: string) => {
    uploadTarget.current = id
    fileInput.current?.click()
  }, [])

  const handleFile = useCallback(
    async (file: File, at?: { x: number; y: number }) => {
      if (isHtmlFile(file)) { const html = await readHtmlFile(file); setPage((p) => ({ ...p, baseSite: { ...makeBaseSite(html, null), extractedIds: p.baseSite?.extractedIds } })); return } // [existing-site]
      if (!file.type.startsWith('image/')) return
      const src = await readImage(file)

      const target = uploadTarget.current
      uploadTarget.current = null

      if (target) {
        // Fill whichever store owns the target frame (page or loose).
        setElements((prev) => prev.map((el) => (el.id === target ? { ...el, src } : el)))
        setSpace((prev) =>
          prev.loose.some((l) => l.id === target)
            ? { ...prev, loose: prev.loose.map((l) => (l.id === target ? { ...l, src } : l)) }
            : prev
        )
        return
      }

      // Dropped onto empty space: size the new element to the image's own
      // aspect so it doesn't land distorted.
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => resolve({ w: 240, h: 180 })
        img.src = src
      })
      const scale = Math.min(280 / dims.w, 280 / dims.h, 1)
      const w = Math.max(Math.round(dims.w * scale), 80)
      const h = Math.max(Math.round(dims.h * scale), 60)

      const id = newElementId()
      const rect: Rect = { x: (at?.x ?? 120) - w / 2, y: (at?.y ?? 120) - h / 2, w, h }
      const el: CommittedElement = { id, kind: 'image', rect, text: file.name, color, src }
      // `at` already sits in the active view's space (world when liminal,
      // page-local when focused - the caller picked the conversion), so land the
      // new frame in the matching store: loose on the plane, page when focused.
      if (viewRef.current !== 'focused') commitLoose([el])
      else commitElements([el])
      setSelectedId(id)
      setTool('select')
    },
    [readImage, color, commitElements, commitLoose]
  )

  // Cmd/Ctrl+V: paste an image from the clipboard - into the selected frame
  // if one is selected, otherwise a new frame lands mid-viewport. Same
  // machinery as drag-and-drop (handleFile), different doorway.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (!file) return
      e.preventDefault()
      // View picks the store and the coordinate space: liminal pastes land on
      // the plane (world coords, loose store), focused into the page.
      const onPlane = viewRef.current !== 'focused'
      const store = onPlane ? looseElements : elements
      const sel = store.find((el) => el.id === selectedId)
      if (sel && isPictureFrame(sel.kind, sel.shape)) uploadTarget.current = sel.id
      const cx = stageLeft.current + viewportRef.current.w / 2
      const cy = viewportRef.current.h / 2
      const at = onPlane ? toWorld(cx, cy) : screenToLocal(cx, cy)
      void handleFile(file, at)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [elements, looseElements, selectedId, handleFile, screenToLocal, toWorld])

  /** Ctrl+Z: rewind one action - a stroke, a placed text, or an erase drag. */
  const undo = useCallback(() => {
    const snap = past.current.pop()
    if (snap) setSketch(snap)
  }, [])

  /** An eraser drag starts: remember the sketch so the whole drag undoes as one. */
  const eraseStart = useCallback(() => {
    pendingErase.current = latest.current.sketch
  }, [])

  const eraseAt = useCallback(
    (x: number, y: number) => {
      const rr = ERASE_RADIUS * ERASE_RADIUS
      setSketch((prev) => {
        // Whole-stroke erase: one touched point takes the entire stroke out.
        const strokes = prev.strokes.filter(
          (s) => !s.points.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= rr)
        )
        // Typed labels go too. Same approximate box as sketchBounds uses,
        // inflated by the eraser radius.
        const texts = prev.texts.filter((t) => {
          const w = Math.max(t.text.length * 9, 40)
          const h = 22
          return !(
            x >= t.x - ERASE_RADIUS &&
            x <= t.x + w + ERASE_RADIUS &&
            y >= t.y - ERASE_RADIUS &&
            y <= t.y + h + ERASE_RADIUS
          )
        })
        if (strokes.length === prev.strokes.length && texts.length === prev.texts.length) {
          return prev
        }
        // First removal of the drag banks the snapshot; nulling it makes the
        // push idempotent under StrictMode's double-invoked updaters.
        if (pendingErase.current) {
          pushHistory(pendingErase.current)
          pendingErase.current = null
        }
        return { strokes, texts }
      })
    },
    [pushHistory]
  )

  const bumpBrush = useCallback((delta: number) => {
    setBrushSize((s) => Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, s + delta)))
    setSizeFlash(true)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setSizeFlash(false), BRUSH_FLASH_MS)
  }, [])

  useEffect(() => {
    if (!editing) return
    // Focus on the next frame, after the placing click has fully settled -
    // focusing synchronously races the browser's own focus handling.
    const id = requestAnimationFrame(() => editInput.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [editing])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const cur = latest.current
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // While typing in the sketch's text box, the keyboard belongs to that
      // box. Enter commits it rather than triggering the guess, or you could
      // never type a label without immediately submitting.
      if (cur.editing) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          commitText(cur.editing)
        }
        return
      }

      // Any other focused field - a committed input in browse mode, the
      // custom colour picker - also owns its keys. Without this, typing "h"
      // into a form you built would flip the whole surface into edit mode.
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }

      // H toggles browse/edit from either side, so it comes before the
      // browse-mode bail-out below.
      if (!ctrl && key === 'h') {
        e.preventDefault()
        toggleMode()
        return
      }
      // Everything else is inert while browsing - the page is just a website.
      if (cur.mode === 'browse') return

      if (e.key === 'Enter') {
        e.preventDefault()
        if (drawing.current) return
        if (cur.phase === 'sketch') void runGuess()
        else if (cur.phase === 'preview') confirm()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (cur.selectedId) {
          e.preventDefault()
          deleteElement(cur.selectedId)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        // Esc peels back one layer at a time: drop a selection first, then
        // shake off a pending sketch or preview, and only when nothing is in
        // flight step back out to browse.
        if (cur.selectedId) setSelectedId(null)
        else if (cur.phase !== 'sketch' || !isEmpty(cur.sketch)) clearSketch(true)
        else toggleMode()
        return
      }
      if (ctrl && key === 'z') {
        e.preventDefault()
        if (cur.phase === 'sketch') undo()
        return
      }
      if (ctrl) return

      // Tool letters.
      if (key === 'd') setTool('pen')
      if (key === 'e') setTool('eraser')
      if (key === 't') setTool('text')
      if (key === 'm') setTool('select')
      // Ink colours, 1-9 across the palette.
      if (/^[1-9]$/.test(e.key)) {
        const swatch = PALETTE[Number(e.key) - 1]
        if (swatch) setColor(swatch.value)
      }
      // Brush size.
      if (key === 'w') bumpBrush(BRUSH_STEP)
      if (key === 's') bumpBrush(-BRUSH_STEP)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [runGuess, confirm, clearSketch, undo, commitText, deleteElement, toggleMode, bumpBrush])

  const empty = isEmpty(sketch)
  const browse = mode === 'browse'
  const focused = view === 'focused'
  /** The plane's camera-following ink frame (world rect). Recomputed as the
   * camera moves so a small canvas always covers the viewport (see planeInkFrame). */
  const planeInk = planeInkFrame(camera, viewport)
  /** Active store's element count + reset label, context-shifted per view. */
  const activeCount = focused ? elements.length : looseElements.length

  // Liminal drag-pan: dragging the empty plane moves the camera. Content should
  // follow the cursor, so the camera moves opposite to the drag (÷ zoom to turn
  // a screen delta into a world delta).
  const beginPan = (e: React.PointerEvent): void => {
    if (viewRef.current !== 'focused') {
      e.currentTarget.setPointerCapture(e.pointerId)
      panning.current = { x: e.clientX, y: e.clientY }
    }
  }
  const movePan = (e: React.PointerEvent): void => {
    const p = panning.current
    if (!p) return
    const cam = cameraRef.current
    const dx = (e.clientX - p.x) / cam.zoom
    const dy = (e.clientY - p.y) / cam.zoom
    panning.current = { x: e.clientX, y: e.clientY }
    setCamera((c) => ({ ...c, x: c.x - dx, y: c.y - dy }))
  }
  const endPan = (e: React.PointerEvent): void => {
    panning.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div className="studio-shell">
      <SetupNotice />
      <ElementManager
        open={dockOpen}
        onToggle={() => setDockOpen((o) => !o)}
        elements={elements}
        names={Object.fromEntries(page.elements.map((el) => [el.id, el.name]))}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRename={(id, name) => setPage((p) => ({ ...p, elements: p.elements.map((el) => (el.id === id ? { ...el, name } : el)) }))}
        onDelete={deleteElement}
        tags={extractionTags(page.baseSite)} // [existing-site]
        header={<BaseSiteRow baseSite={page.baseSite} onChange={(b) => setPage((p) => ({ ...p, baseSite: b }))} />} // [existing-site]
      />
    <div
      ref={stageRef}
      className="studio"
      data-tool={tool}
      data-phase={phase}
      data-mode={mode}
      data-view={view}
      onDragOver={(e) => {
        // Without preventDefault the browser navigates to the dropped file.
        e.preventDefault()
        // The root owns drag-and-drop entirely (elements can't receive DnD
        // events while the page layer is pointer-inert in pen mode): hit-test
        // for a frame under the cursor so it can glow. Branch by view: liminal
        // drops land on the plane (world coords, loose frames), focused into the
        // page (page-local, page frames).
        const onPlane = viewRef.current !== 'focused'
        const at = onPlane ? toWorld(e.clientX, e.clientY) : screenToLocal(e.clientX, e.clientY)
        const frame = onPlane ? findLooseFrameAt(at.x, at.y) : findFrameAt(at.x, at.y)
        setDropTargetId(frame?.id ?? null)
      }}
      onDragLeave={() => setDropTargetId(null)}
      onDrop={(e) => {
        e.preventDefault()
        setDropTargetId(null)
        const file = e.dataTransfer.files?.[0]
        if (!file || !(file.type.startsWith('image/') || isHtmlFile(file))) return // [existing-site]
        // Same view branch as onDragOver: the drop coord and the target frame
        // must come from the store handleFile will commit into.
        const onPlane = viewRef.current !== 'focused'
        const at = onPlane ? toWorld(e.clientX, e.clientY) : screenToLocal(e.clientX, e.clientY)
        // Dropped on a frame -> the picture goes INTO it (irregular frames
        // crop via their clip path). Anywhere else -> auto-make a frame here.
        const frame = onPlane ? findLooseFrameAt(at.x, at.y) : findFrameAt(at.x, at.y)
        if (frame) uploadTarget.current = frame.id
        void handleFile(file, at)
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          // Reset so picking the same file twice still fires onChange.
          e.target.value = ''
        }}
      />
      {/* Liminal background: catches drags on the empty plane to pan the camera.
          Behind the world (which is pointer-inert except the page object). */}
      {!focused && (
        <div
          className="liminal-backdrop"
          onPointerDown={beginPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        />
      )}

      {/* ONE transformed world: the camera (translate + scale) frames the whole
          plane. Everything on the plane lives inside, so a single screen->world
          conversion (screenToLocal) covers every pointer site. */}
      <div
        className="world"
        data-flying={flying}
        style={{ transform: worldTransform(camera, viewport), transformOrigin: '0 0' }}
      >
        {/* The plane's own surface: a sibling of the page object inside the SAME
            world, so one camera transform covers both. Anchored at the world
            origin - every child reads WORLD coords 1:1. Drawn BEFORE the page
            object so the page paints on top (focused mode hides the plane behind
            the full-bleed page; liminal shows the page as the focal object with
            loose work behind it). Loose elements persist and pan with the plane.
            The whole gesture here runs in WORLD space (toWorld), never mixing
            with the page's local space. */}
        <div className="plane-layer">
          {/* Loose elements: selectable/draggable like page elements, but on the
              bare plane (space.loose) in world coords. Editable only in liminal
              select mode; inert (and occluded) when focused. */}
          <div
            className="page-layer"
            data-interactive={((tool === 'select' && !browse) || browse) && !focused}
          >
            <AnimatePresence>
              {looseElements.map((el) => (
                <EditableElement
                  key={el.id}
                  element={el}
                  selected={selectedId === el.id}
                  editable={tool === 'select' && !browse && !focused}
                  scale={camera.zoom}
                  onSelect={setSelectedId}
                  onChange={moveLoose}
                  onDelete={deleteElement}
                  onUpload={requestUpload}
                  onActivate={browse && !focused ? activateElement : undefined}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Wires: thin dashed segments between connected objects, so a drawn
              connection stays visible on the plane. Pointer-inert overlay; only
              shown in liminal where the whole plane (and its wires) reads. */}
          {!focused && wireLines.length > 0 && (
            <svg
              className="wire-layer"
              width="0"
              height="0"
              style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
            >
              {wireLines.map((l) => (
                <line
                  key={l.id}
                  x1={l.a.x}
                  y1={l.a.y}
                  x2={l.b.x}
                  y2={l.b.y}
                  stroke="var(--accent-ink)"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                />
              ))}
            </svg>
          )}

          {/* Ghost preview of a pending plane commit, in world coords. Gated on
              !focused so a world-coord preview never renders in the page's local
              space (and vice versa). */}
          <AnimatePresence>
            {phase === 'preview' && kind && previewRect && !browse && !focused && (
              <motion.div
                className="page-layer preview-layer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={gentle}
              >
                {guess?.shapes && guess.shapes.length > 0 ? (
                  guess.shapes.map((shape, i) => (
                    <RenderedElement
                      key={i}
                      kind={shape.op}
                      rect={{ x: shape.bbox.x, y: shape.bbox.y, w: shape.bbox.width, h: shape.bbox.height }}
                      text={sketchText(sketch)}
                      color={color}
                      shape={shape}
                      preview
                    />
                  ))
                ) : (
                  <RenderedElement
                    kind={kind}
                    rect={previewRect}
                    text={sketchText(sketch)}
                    color={color}
                    preview
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* The plane's ink surface: a camera-following canvas (planeInkFrame)
              positioned at its world frame, drawing world strokes shifted by
              drawOrigin. z-index 10 puts it above loose elements and below the
              text/preview layers, matching the focused stack so a placed text
              input and the confirm bar stay clickable over the ink. */}
          <div
            className="plane-ink"
            style={{ left: planeInk.x, top: planeInk.y, width: planeInk.w, height: planeInk.h }}
          >
            <SketchLayer
              sketch={sketch}
              color={color}
              tool={tool}
              brushSize={brushSize}
              frozen={phase !== 'sketch' || browse || focused}
              shaking={shaking}
              hidden={browse || focused}
              pageHeight={planeInk.h}
              drawOrigin={{ x: planeInk.x, y: planeInk.y }}
              toLocal={toWorld}
              onStrokeStart={() => {
                drawing.current = true
              }}
              onStrokeEnd={handleStrokeEnd}
              onPlaceText={placeText}
              onEraseStart={eraseStart}
              onErase={eraseAt}
            />
          </div>

          {/* Plane text items (world coords). Only rendered in liminal so the
              shared sketch/editing state never renders twice. */}
          <div className={`text-layer plane-text ${shaking ? 'shaking' : ''}`} data-hidden={browse || focused}>
            {!focused &&
              sketch.texts.map((t) =>
                editing === t.id ? (
                  <input
                    key={t.id}
                    ref={editInput}
                    className="text-item text-item-editing"
                    style={{ left: t.x, top: t.y, color: t.color }}
                    value={t.text}
                    placeholder="type…"
                    onChange={(e) => updateText(t.id, e.target.value)}
                    onBlur={() => commitText(t.id)}
                  />
                ) : (
                  <span
                    key={t.id}
                    className="text-item"
                    style={{ left: t.x, top: t.y, color: t.color }}
                    onDoubleClick={() => setEditing(t.id)}
                  >
                    {t.text}
                  </span>
                )
              )}
          </div>

          {/* Paint splotches for loose commits, in world coords. */}
          <div className="page-layer" style={{ zIndex: 20 }}>
            <AnimatePresence>
              {planeSplotches.map((s) => (
                <motion.img
                  key={s.id}
                  src={s.src}
                  alt=""
                  style={{
                    position: 'absolute',
                    left: s.rect.x,
                    top: s.rect.y,
                    width: s.rect.w,
                    height: s.rect.h,
                    objectFit: 'contain',
                    pointerEvents: 'none'
                  }}
                  initial={{ scale: 0.8, opacity: 0.9 }}
                  animate={{ scale: 1.15, opacity: 0 }}
                  transition={{ ...gentle, duration: 0.7 }}
                  onAnimationComplete={() =>
                    setPlaneSplotches((prev) => prev.filter((p) => p.id !== s.id))
                  }
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Thinking + confirm, anchored to the world sketch bounds. */}
          <AnimatePresence>
            {phase === 'thinking' && bounds && !browse && !focused && (
              <motion.div
                className="thinking"
                style={{ left: bounds.x, top: bounds.y + bounds.h + 12 }}
                variants={popIn}
                initial="hidden"
                animate="shown"
                exit="hidden"
                transition={spring}
              >
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
                <span className="thinking-label">reading your sketch</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === 'preview' && guess && kind && previewRect && !browse && !focused && (
              <motion.div
                className="confirm-bar"
                style={{ left: previewRect.x, top: previewRect.y + previewRect.h + 14 }}
                variants={popIn}
                initial="hidden"
                animate="shown"
                exit="hidden"
                transition={spring}
              >
                <span className="confirm-guess">
                  {KIND_LABEL[kind]}
                  <span className="confirm-confidence">{Math.round(guess.confidence * 100)}%</span>
                </span>

                {guess.shapes && guess.shapes.length > 0
                  ? kind !== 'smooth_path' && (
                      <span className="confirm-alts">
                        <motion.button
                          className="alt"
                          onClick={keepAsDrawn}
                          whileHover={{ scale: 1.06 }}
                          whileTap={{ scale: 0.95 }}
                          transition={spring}
                        >
                          keep as drawn
                        </motion.button>
                      </span>
                    )
                  : guess.alternates.length > 0 && (
                      <span className="confirm-alts">
                        {guess.alternates.map((alt) => (
                          <motion.button
                            key={alt}
                            className="alt"
                            onClick={() => setKind(alt)}
                            whileHover={{ scale: 1.06 }}
                            whileTap={{ scale: 0.95 }}
                            transition={spring}
                          >
                            {KIND_LABEL[alt]}
                          </motion.button>
                        ))}
                      </span>
                    )}

                <motion.button
                  className="confirm-btn"
                  onClick={confirm}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={spring}
                >
                  confirm <kbd>↵</kbd>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Every OTHER page in the space, rendered as a read-only object at its
            plane location (the active page is drawn on top, below). Click one to
            make it active and fly in (enterFocused). Only interesting in liminal;
            in focused the active page fills the view and these sit off-screen.
            Their elements render read-only via RenderedElement — no sketch,
            preview or drag machinery, which belongs to the active page alone. */}
        {space.items.map((it, i) =>
          i === focusedIdx ? null : (
            <div
              key={it.page.id}
              className={`page-object${seals[it.page.id]?.html ? ' page-sealed' : ''}`}
              style={{
                left: it.location.x - PAGE_CENTER_X,
                top: it.location.y,
                width: PAGE_WIDTH,
                height: INITIAL_PAGE_HEIGHT
              }}
              onClick={!focused && browse ? () => enterFocused(i) : undefined}
            >
              <div className="page-object-titlebar">
                <span className="traffic-lights">
                  <span className="traffic-light traffic-light-close" aria-hidden="true" />
                  <span className="traffic-light traffic-light-min" aria-hidden="true" />
                  <button
                    type="button"
                    className="traffic-light traffic-light-max is-toggle"
                    onClick={(e) => {
                      e.stopPropagation()
                      enterFocused(i)
                    }}
                    aria-label="Enter this page"
                    title="Enter this page"
                  />
                </span>
                <span className="page-object-name" suppressHydrationWarning>
                  {it.page.name}
                </span>
              </div>
              <div className="page-clip">
                {it.page.baseSite && <BaseSiteLayer base={it.page.baseSite} width={PAGE_WIDTH} height={INITIAL_PAGE_HEIGHT} />} {/* [existing-site] */}
                <div className="page-layer">
                  {pageToScreen(it.page, PAGE_CENTER_X).map((el) => (
                    <RenderedElement
                      key={el.id}
                      kind={el.kind}
                      rect={el.rect}
                      text={el.text}
                      color={el.color}
                      src={el.src}
                      shape={el.shape}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        )}

        {/* The active page as one object at its plane location. Liminal: a
            bordered object you click to enter. Focused: it fills the view and the
            chrome shows as a fixed band. */}
        <div
          className={`page-object${seals[page.id]?.html ? ' page-sealed' : ''}`}
          data-view={view}
          style={{
            left: pageLoc.x - PAGE_CENTER_X,
            top: pageLoc.y,
            width: PAGE_WIDTH,
            height: pageHeight
          }}
          onClick={!focused && browse ? () => enterFocused(focusedIdx) : undefined}
        >
          {/* In liminal the object wears its own little titlebar; in focused the
              fixed chrome band replaces it. */}
          {!focused && (
            <div className="page-object-titlebar">
              <span className="traffic-lights">
                <span className="traffic-light traffic-light-close" aria-hidden="true" />
                <span className="traffic-light traffic-light-min" aria-hidden="true" />
                <button
                  type="button"
                  className="traffic-light traffic-light-max is-toggle"
                  onClick={(e) => {
                    e.stopPropagation()
                    enterFocused(focusedIdx)
                  }}
                  aria-label="Enter full screen"
                  title="Enter full screen"
                />
              </span>
              <span className="page-object-name" suppressHydrationWarning>
                {page.name}
              </span>
            </div>
          )}

          {/* The clip: ink, elements and the glaze are inset to the page BODY and
              clipped to it, so drawing never escapes onto the chrome. */}
          <div className="page-clip">
            {page.baseSite && <BaseSiteLayer base={page.baseSite} width={PAGE_WIDTH} height={pageHeight} />} {/* [existing-site] */}
            <div
              className="page-layer"
              data-interactive={(tool === 'select' || browse) && focused}
              onPointerDown={() => setSelectedId(null)}
            >
              {/* Peel is a saturation ladder, not a curtain: the focused layer pops,
                  layers behind it wash out, layers above wash toward invisible —
                  everything stays mounted so the strata read as depth. */}
              <AnimatePresence>
                {elements.map((el) => {
                  const w = washFor(el)
                  return (
                    <EditableElement
                      key={el.id}
                      element={el}
                      selected={selectedId === el.id}
                      editable={tool === 'select' && !browse && focused && (w?.interactive ?? true)}
                      scale={camera.zoom}
                      wash={w}
                      dropGlow={dropTargetId === el.id}
                      onSelect={setSelectedId}
                      onChange={moveElement}
                      onDelete={deleteElement}
                      onUpload={requestUpload}
                    />
                  )
                })}
              </AnimatePresence>
            </div>

            {/* The glaze: a sheet of white lifted over the page while editing, so
                the ink reads above the site it is drawn on. Sits between the page
                and the sketch canvas and never takes pointer events. */}
            <div className="edit-glaze" aria-hidden="true" />

      <AnimatePresence>
        {phase === 'preview' && kind && previewRect && !browse && focused && (
          <motion.div
            className="page-layer preview-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={gentle}
          >
            {guess?.shapes && guess.shapes.length > 0 ? (
              // Pipeline ghosts: one per result, exactly where each will land.
              guess.shapes.map((shape, i) => (
                <RenderedElement
                  key={i}
                  kind={shape.op}
                  rect={{ x: shape.bbox.x, y: shape.bbox.y, w: shape.bbox.width, h: shape.bbox.height }}
                  text={sketchText(sketch)}
                  color={color}
                  shape={shape}
                  preview
                />
              ))
            ) : (
              <RenderedElement
                kind={kind}
                rect={previewRect}
                text={sketchText(sketch)}
                color={color}
                preview
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The splotch beat: a blot of paint blooms over each landing element,
          then unmounts. Purely decorative, so it never takes pointer events. */}
      <div className="page-layer" style={{ zIndex: 20 }}>
        <AnimatePresence>
          {splotches.map((s) => (
            <motion.img
              key={s.id}
              src={s.src}
              alt=""
              style={{
                position: 'absolute',
                left: s.rect.x,
                top: s.rect.y,
                width: s.rect.w,
                height: s.rect.h,
                objectFit: 'contain',
                pointerEvents: 'none'
              }}
              initial={{ scale: 0.8, opacity: 0.9 }}
              animate={{ scale: 1.15, opacity: 0 }}
              transition={{ ...gentle, duration: 0.7 }}
              onAnimationComplete={() =>
                setSplotches((prev) => prev.filter((p) => p.id !== s.id))
              }
            />
          ))}
        </AnimatePresence>
      </div>

            <SketchLayer
              sketch={sketch}
              color={color}
              tool={tool}
              brushSize={brushSize}
              frozen={phase !== 'sketch' || browse || !focused}
              shaking={shaking}
              hidden={browse || !focused}
              pageHeight={pageHeight}
              toLocal={screenToLocal}
              onStrokeStart={() => {
                drawing.current = true
              }}
              onStrokeEnd={handleStrokeEnd}
              onPlaceText={placeText}
              onEraseStart={eraseStart}
              onErase={eraseAt}
            />

            {/* Text items live in the DOM, not the canvas, so they stay editable. */}
            <div
              className={`text-layer ${shaking ? 'shaking' : ''}`}
              data-hidden={browse || !focused}
            >
              {focused &&
                sketch.texts.map((t) =>
                editing === t.id ? (
                  <input
                    key={t.id}
                    ref={editInput}
                    className="text-item text-item-editing"
                    style={{ left: t.x, top: t.y, color: t.color }}
                    value={t.text}
                    placeholder="type…"
                    onChange={(e) => updateText(t.id, e.target.value)}
                    onBlur={() => commitText(t.id)}
                  />
                ) : (
                  <span
                    key={t.id}
                    className="text-item"
                    style={{ left: t.x, top: t.y, color: t.color }}
                    onDoubleClick={() => setEditing(t.id)}
                  >
                    {t.text}
                  </span>
                )
              )}
            </div>
          </div>
          {/* /page-clip. Thinking + confirm anchor to page-local sketch coords,
              so they ride the world (tracking the ink) but sit OUTSIDE the clip
              so they are never cut off at the page edge. */}

          <AnimatePresence>
            {phase === 'thinking' && bounds && !browse && focused && (
          <motion.div
            className="thinking"
            style={{ left: bounds.x, top: bounds.y + bounds.h + 12 }}
            variants={popIn}
            initial="hidden"
            animate="shown"
            exit="hidden"
            transition={spring}
          >
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="thinking-label">reading your sketch</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'preview' && guess && kind && previewRect && !browse && focused && (
          <motion.div
            className="confirm-bar"
            style={{ left: previewRect.x, top: previewRect.y + previewRect.h + 14 }}
            variants={popIn}
            initial="hidden"
            animate="shown"
            exit="hidden"
            transition={spring}
          >
            <span className="confirm-guess">
              {KIND_LABEL[kind]}
              <span className="confirm-confidence">{Math.round(guess.confidence * 100)}%</span>
            </span>

            {guess.shapes && guess.shapes.length > 0
              ? kind !== 'smooth_path' && (
                  <span className="confirm-alts">
                    <motion.button
                      className="alt"
                      onClick={keepAsDrawn}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.95 }}
                      transition={spring}
                    >
                      keep as drawn
                    </motion.button>
                  </span>
                )
              : guess.alternates.length > 0 && (
                  <span className="confirm-alts">
                    {guess.alternates.map((alt) => (
                      <motion.button
                        key={alt}
                        className="alt"
                        onClick={() => setKind(alt)}
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.95 }}
                        transition={spring}
                      >
                        {KIND_LABEL[alt]}
                      </motion.button>
                    ))}
                  </span>
                )}

            <motion.button
              className="confirm-btn"
              onClick={confirm}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={spring}
            >
              confirm <kbd>↵</kbd>
            </motion.button>
          </motion.div>
        )}
          </AnimatePresence>
        </div>
      </div>
      {/* /world */}

      {/* Focused-mode window chrome: a FIXED band (titlebar + inert tab strip)
          outside the world, so it never scales. The red light escapes to liminal. */}
      {focused && <PageChrome name={page.name} onWindowed={escapeToLiminal} />}

      {/* The toolbar is GLOBAL: mounted whenever editing (edit mode), in BOTH
          views, at viewport level so it never scales. It is context-shifted -
          docked near the page chrome when focused, floated bottom-centre on the
          plane - and its actions target the ACTIVE store (page.elements when
          focused, space.loose when liminal). */}
      <AnimatePresence>
        {!browse && (
          // The slot stays static and owns the centering; only the inner node
          // animates, or Framer's transform would replace translateX(-50%).
          <div className="toolbar-slot" data-view={view} key="toolbar">
            <motion.div
              variants={dropIn}
              initial="hidden"
              animate="shown"
              exit="hidden"
              transition={spring}
            >
              <Toolbar
                tool={tool}
                color={color}
                brushSize={brushSize}
                onTool={setTool}
                onColor={setColor}
                onClearSketch={() => clearSketch(true)}
                onClearPage={() =>
                  focused ? setElements([]) : setSpace((prev) => ({ ...prev, loose: [] }))
                }
                onAddSpace={addSpace}
                canAddSpace={focused}
                elementCount={activeCount}
                resetLabel={focused ? 'reset page' : 'clear plane'}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fleeting size readout under the toolbar while w/s are being tapped. */}
      <AnimatePresence>
        {!browse && focused && sizeFlash && (
          <div className="brush-flash-slot" key="brush-flash">
            <motion.div
              className="brush-flash"
              variants={popIn}
              initial="hidden"
              animate="shown"
              exit="hidden"
              transition={spring}
            >
              <span className="brush-dot" style={{ width: brushSize, height: brushSize }} />
              <span>{brushSize}px</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {empty && elements.length === 0 && phase === 'sketch' && !browse && focused && (
          <div className="hint-slot">
            <motion.div
              className="hint"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={gentle}
            >
              <div className="hint-title">scribble a UI element</div>
              <div className="hint-sub">
                draw a box, type a label on it, then press <kbd>enter</kbd> twice
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!browse && focused && (
          <div className="statusbar-slot" key="statusbar">
            <motion.div
              variants={riseIn}
              initial="hidden"
              animate="shown"
              exit="hidden"
              transition={spring}
              className="statusbar"
            >
              <kbd>enter</kbd>
              <span>{phase === 'preview' ? 'confirm' : 'guess'}</span>
              <span className="statusbar-sep" />
              <kbd>esc</kbd>
              <span>shake off</span>
              <span className="statusbar-sep" />
              <kbd>d</kbd>
              <kbd>e</kbd>
              <kbd>t</kbd>
              <kbd>m</kbd>
              <span>tools</span>
              <span className="statusbar-sep" />
              <kbd>1-9</kbd>
              <span>colour</span>
              <span className="statusbar-sep" />
              <kbd>w</kbd>
              <kbd>s</kbd>
              <span>size</span>
              <span className="statusbar-sep" />
              <kbd>h</kbd>
              <span>done</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Browse: the page, a quote, and the Edit button to get back in. */}
      <AnimatePresence>
        {browse && focused && quote && (
          <div className="quote-slot">
            <motion.p
              key="quote"
              className="quote"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ ...gentle, duration: 0.5, delay: 0.15 }}
            >
              {quote}
            </motion.p>
          </div>
        )}
      </AnimatePresence>

      {/* Watermark. Steps out in browse along with everything else, so the
          page really is just the page. */}
      <AnimatePresence>
        {!browse && focused && (
          <motion.div
            key="watermark"
            className="watermark"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={gentle}
          >
            <Lockup size={15} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Landing-page arrival: THE edit toggle itself starts oversized in the
          center (the corner pill doesn't render), then morphs into the corner
          via the shared layoutId when clicked. The wrap is pointer-inert so
          the page underneath stays browsable. */}
      {/* Edit/browse toggle: alive in BOTH views (edit must be reachable on the
          plane too, to draw loose elements). The oversized landing welcome is
          focused-only; everywhere else it's the corner pill. */}
      {welcome && browse && focused ? (
        <div className="welcome-cta-wrap">
          <motion.button
            className="welcome-cta"
            layoutId="edit-toggle"
            onClick={toggleMode}
            aria-label="Edit the page"
            transition={spring}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">
              <path
                d="M3 17l1-4 9-9 3 3-9 9-4 1z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span>Edit the page</span>
          </motion.button>
          <motion.p
            className="welcome-hint"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={gentle}
          >
            draw anywhere, press Enter — it becomes real
          </motion.p>
        </div>
      ) : (
        <ModeToggle mode={mode} onToggle={toggleMode} />
      )}

      {/* The book: a draggable index of everything baio understands. */}
      <AnimatePresence>{!browse && focused && <GlyphBook />}</AnimatePresence>

      {/* Overlap spawned layers; the rail lists them topmost-first and peels. */}
      {focused && <LayerRail layers={layers} peel={peelLayer} onPeel={peelTo} />}

      {/* Seal: the page-level lock, only offered in browse - you seal a page
          you're done editing. It freezes the page as a real website and marks
          it with the green border. */}
      <ImportSiteControl visible={browse && focused} baseSite={page.baseSite} pageWidth={PAGE_WIDTH} pageHeight={pageHeight} onExtract={(els) => setPage((p) => applyExtraction(p, els))} onChange={(b) => { setPage((p) => ({ ...p, baseSite: b })); delete sealSigs.current[page.id]; setSeals((s) => { const n = { ...s }; delete n[page.id]; return n }) }} /> {/* [existing-site] */}
      <AnimatePresence>
        {browse && focused && elements.length > 0 && (
          <motion.button
            key="seal"
            className="frame-toggle seal-toggle"
            onClick={() => void seal()}
            disabled={framing}
            title="Seal this page — freeze it as a real website"
            aria-label="Seal the page"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            transition={spring}
          >
            <FrameIcon />
            <span>Seal</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Frame: the plane-level primary action, offered only in liminal — takes
          every SEALED page and connects them into one multi-page site. Green to
          echo the sealed pages it gathers; dark until at least one page is sealed. */}
      <AnimatePresence>
        {!focused && (
          <motion.button
            key="frame-space"
            className="space-frame-toggle"
            onClick={frameSpace}
            disabled={framingSpace || sealedCount === 0}
            title={
              sealedCount === 0
                ? 'Seal at least one page first'
                : 'Frame the space — connect every sealed page into one site'
            }
            aria-label="Frame the space"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            transition={spring}
          >
            <FrameIcon />
            <span>Frame</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {frameError && (
          <motion.div
            key="frame-error"
            className="frame-error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={gentle}
          >
            {frameError}
          </motion.div>
        )}
      </AnimatePresence>

      {(framing || framingSpace) && <FramingVeil />}
      {framedHtml && (
        <FrameOverlay
          html={framedHtml}
          files={frameFiles}
          entry={frameEntry}
          onClose={() => {
            setFramedHtml(null)
            setFrameFiles(null)
            setFrameEntry(null)
          }}
        />
      )}

      {/* The liminal-level site overlay: the stitched site shows instantly, the
          routed project (spaceApp) fills its download button behind it. */}
      {spaceOpen && spaceSite && (
        <FrameOverlay
          site={spaceSite}
          files={spaceApp?.files ?? null}
          entry={spaceApp?.entry ?? null}
          onClose={() => {
            setSpaceOpen(false)
            setSpaceSite(null)
            setSpaceApp(null)
            setSpaceError(null)
          }}
        />
      )}

      <Preloader />
    </div>
    </div>
  )
}

function FrameIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
      <rect
        x="3.5"
        y="3.5"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3.5 7.5h13" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="5.5" r="0.75" fill="currentColor" />
    </svg>
  )
}
