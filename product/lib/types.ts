export interface InkPoint {
  x: number
  y: number
  /** 0..1 from PointerEvent.pressure; 0.5 for devices that don't report it. */
  pressure: number
}

export interface Stroke {
  id: string
  points: InkPoint[]
  color: string
  /** Brush size at draw time, in px. Old strokes without one use the default. */
  width?: number
}

export interface TextItem {
  id: string
  x: number
  y: number
  text: string
  color: string
}

export interface Sketch {
  strokes: Stroke[]
  texts: TextItem[]
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Everything the recognizer can produce. The first block is the original UI
 * set; the second is the pipeline's shape vocabulary (shapes-v1) - 'button'
 * and 'image' exist in both and are shared rather than duplicated.
 */
export type ElementKind =
  | 'button'
  | 'input'
  | 'heading'
  | 'paragraph'
  | 'card'
  | 'checkbox'
  | 'toggle'
  | 'divider'
  | 'image'
  | 'avatar'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'smooth_path'
  | 'form'
  | 'navbar'
  | 'video'
  | 'placeholder'
  | 'page'
  | 'wave_divider'
  | 'night_sky'
  | 'sparkles'
  | 'aurora_gradient'
  | 'bar_chart'
  | 'pie_chart'
  | 'venn_diagram'
  | 'timeline'
  | 'periodic_table'
  | 'atomic_structure'

/** One pipeline result, already translated into document coordinates. */
export interface ShapeResult {
  op: ElementKind
  params?: Record<string, unknown>
  snap?: string
  bbox: { x: number; y: number; width: number; height: number }
  path?: { x: number; y: number }[]
  tier: 'high' | 'medium' | 'low'
  confidence: number
}

export interface Guess {
  kind: ElementKind
  confidence: number
  /** Ranked runners-up, offered in the preview so a wrong guess is one click to fix. */
  alternates: ElementKind[]
  /** Pipeline results, when the real recognizer answered. Each commits as its own element. */
  shapes?: ShapeResult[]
}

export interface CommittedElement {
  id: string
  kind: ElementKind
  rect: Rect
  text: string
  color: string
  /** Data URL for uploaded images; only meaningful for kind === 'image'. */
  src?: string
  /** The pipeline result behind this element; rendered via the shapes pack. */
  shape?: ShapeResult
  /** Stacking layer, assigned at commit: overlap spawns a layer. Absent means 0. */
  layer?: number
}

export type Tool = 'pen' | 'eraser' | 'text' | 'select'

/**
 * The two faces of the surface. Browse is the default: the page is just a
 * website and every committed control genuinely works. Edit lifts a glaze
 * over it and brings out the sketching tools.
 */
export type Mode = 'browse' | 'edit'
