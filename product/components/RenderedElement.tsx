'use client'

import { useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import { diagramsPack } from '@/lib/packs/diagrams/registry'
import { shapesPack } from '@/lib/packs/shapes/registry'
import { RADIUS, STROKE, num, shapeUid, smoothPath } from '@/lib/packs/shapes/types'
import type { ElementKind, Rect, ShapeResult } from '@/lib/types'

/** The ops whose enclosure can hold a dropped picture (wave3 "picture frames"). */
const FRAME_OPS: ReadonlySet<string> = new Set(['rect', 'ellipse', 'smooth_path', 'image'])

/**
 * Mirrors smooth_path.tsx's closing heuristic: the curve closes when the
 * endpoints land within max(12, 12% of the ink diagonal) of each other. Only
 * closed silhouettes are frames - open paths stay plain strokes.
 */
export function isClosedSmoothPath(shape: ShapeResult): boolean {
  const pts = shape.path ?? []
  if (pts.length < 3) return false
  const first = pts[0]
  const last = pts[pts.length - 1]
  const diag = Math.hypot(shape.bbox.width, shape.bbox.height) || 1
  return Math.hypot(last.x - first.x, last.y - first.y) < Math.max(12, diag * 0.12)
}

/**
 * Any drawn enclosure is a picture frame: plain image elements, boxes,
 * ellipses, image glyphs and closed smooth paths all accept a dropped photo.
 */
export function isPictureFrame(kind: ElementKind, shape?: ShapeResult): boolean {
  if (!shape) return kind === 'image'
  if (!FRAME_OPS.has(shape.op)) return false
  return shape.op !== 'smooth_path' || isClosedSmoothPath(shape)
}

interface Props {
  kind: ElementKind
  rect: Rect
  text: string
  color: string
  /** Uploaded image data URL, when kind === 'image'. */
  src?: string
  /** Pipeline result; when present the shapes pack renders it as SVG. */
  shape?: ShapeResult
  /** Ghost styling for the not-yet-confirmed preview. */
  preview?: boolean
}

/**
 * The single place a guess becomes real markup. Absolutely positioned from the
 * sketch's bounding box, so the element lands exactly where it was drawn.
 */
export function RenderedElement({ kind, rect, text, color, src, shape, preview }: Props): React.JSX.Element {
  const style: CSSProperties = {
    position: 'absolute',
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: kind === 'paragraph' || kind === 'heading' ? undefined : rect.h,
    minHeight: kind === 'paragraph' || kind === 'heading' ? rect.h : undefined
  }

  // Shape elements: the pack template draws at the bbox's absolute document
  // coordinates, so the viewBox is that bbox - the SVG fills the element and
  // resizing simply rescales it (preserveAspectRatio="none"). A dropped
  // picture rides the same coordinate space: the clipPath (userSpaceOnUse,
  // the default) and the <image> both live in bbox coords, so resizing the
  // element rescales photo and clip together, never out of step.
  const template = shape ? (shapesPack[shape.op] ?? diagramsPack[shape.op]) : undefined
  if (shape && template) {
    const framed = src !== undefined && isPictureFrame(kind, shape)
    const clipId = framed ? `${shapeUid(shape.op, shape)}-frame` : undefined
    return (
      <div className={`el el-${kind} ${preview ? 'el-preview' : ''}`} style={style}>
        <svg
          width="100%"
          height="100%"
          viewBox={`${shape.bbox.x} ${shape.bbox.y} ${Math.max(shape.bbox.width, 1)} ${Math.max(shape.bbox.height, 1)}`}
          preserveAspectRatio="none"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {framed && clipId ? (
            <>
              <defs>
                <clipPath id={clipId}>{frameClip(shape)}</clipPath>
              </defs>
              {/* Cover the bbox, cut to the drawn silhouette. Keyed on the
                  src so a replacement settles in again. */}
              <motion.image
                key={src}
                href={src}
                x={shape.bbox.x}
                y={shape.bbox.y}
                width={shape.bbox.width}
                height={shape.bbox.height}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={spring}
              />
              {/* The original stroke redrawn over the photo, so the frame
                  still reads as hand-drawn ink. */}
              {frameOutline(shape)}
            </>
          ) : (
            template({ bbox: shape.bbox, path: shape.path, params: shape.params })
          )}
        </svg>
      </div>
    )
  }

  return (
    <div className={`el el-${kind} ${preview ? 'el-preview' : ''}`} style={style}>
      {body(kind, text, color, rect, src)}
    </div>
  )
}

/**
 * The clip silhouette for a framed picture, in the same absolute bbox coords
 * the templates draw in - the viewBox maps them onto the element box, so no
 * extra transform is needed and resize keeps photo and clip in lockstep.
 */
function frameClip(shape: ShapeResult): React.JSX.Element {
  const { x, y, width: w, height: h } = shape.bbox
  switch (shape.op) {
    case 'ellipse':
      return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />
    case 'smooth_path':
      // The same closed Catmull-Rom curve the template strokes.
      return <path d={smoothPath((shape.path ?? []).map((p) => [p.x, p.y] as [number, number]), true)} />
    case 'rect': {
      // Same radius read as rect.tsx, so picture and outline agree.
      const r = Math.max(0, Math.min(num(shape.params, 'radius', 0), Math.min(w, h) / 2))
      return <rect x={x} y={y} width={w} height={h} rx={r} />
    }
    default: {
      // 'image' glyph: the web-ui placeholder frame's rounded rect.
      const r = Math.min(RADIUS, w / 4, h / 4)
      return <rect x={x} y={y} width={w} height={h} rx={r} />
    }
  }
}

/** The frame's own stroke, drawn on top of the dropped picture. */
function frameOutline(shape: ShapeResult): React.JSX.Element | null {
  if (shape.op === 'image') {
    // The placeholder art (sun + mountains) would sit on the photo, so keep
    // only its subtle frame stroke.
    const { x, y, width: w, height: h } = shape.bbox
    const r = Math.min(RADIUS, w / 4, h / 4)
    return <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={STROKE} strokeWidth={1} />
  }
  const template = shapesPack[shape.op] ?? diagramsPack[shape.op]
  if (!template) return null
  // Redraw the shape without its fill/gradient: resolvePaint falls back to
  // "none", which flips the templates to their plain ink outline.
  const params = { ...shape.params }
  delete params.fill
  delete params.gradient
  return template({ bbox: shape.bbox, path: shape.path, params })
}

function body(
  kind: ElementKind,
  text: string,
  color: string,
  rect: Rect,
  src?: string
): React.JSX.Element {
  switch (kind) {
    case 'button':
      return (
        <motion.button
          type="button"
          className="ui-button"
          style={{ background: color }}
          whileHover={{ filter: 'brightness(1.08)' }}
          whileTap={{ scale: 0.97 }}
          transition={spring}
        >
          {text || 'Button'}
        </motion.button>
      )

    case 'input':
      return (
        <input
          className="ui-input"
          placeholder={text || 'Enter text'}
          style={{ ['--accent' as string]: color }}
        />
      )

    case 'heading':
      return (
        <h2 className="ui-heading" style={{ color }}>
          {text || 'Heading'}
        </h2>
      )

    case 'paragraph':
      return (
        <p className="ui-paragraph">
          {text || 'Body text goes here, wrapping naturally across the width you drew.'}
        </p>
      )

    case 'card':
      return (
        <div className="ui-card" style={{ ['--accent' as string]: color }}>
          <span className="ui-card-bar" style={{ background: color }} />
          {text ? <span className="ui-card-title">{text}</span> : null}
        </div>
      )

    case 'checkbox':
      return <Checkbox color={color} />

    case 'toggle':
      return <Toggle color={color} />

    case 'divider':
      return <span className="ui-divider" style={{ background: color }} />

    case 'image':
      if (src) {
        // eslint-disable-next-line @next/next/no-img-element -- user upload, data URL
        return <img className="ui-image-uploaded" src={src} alt={text || 'Uploaded image'} />
      }
      return (
        <span className="ui-image" style={{ ['--accent' as string]: color }}>
          <svg viewBox="0 0 24 24" aria-hidden="true" width="28" height="28">
            <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke={color} strokeWidth="1.6" />
            <circle cx="8.5" cy="10" r="1.6" fill={color} />
            <path d="M5 17l4.5-4.5 3 3L16 12l3 3.5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )

    case 'avatar':
      return (
        <span className="ui-avatar" style={{ background: color, fontSize: rect.w * 0.4 }}>
          {(text.trim()[0] ?? 'A').toUpperCase()}
        </span>
      )

    default:
      // Shape kinds normally arrive with a `shape` payload and never reach
      // here; without one there is nothing to draw, so fall back to a card.
      return <div className="ui-card" style={{ ['--accent' as string]: color }} />
  }
}

/**
 * State lives locally rather than in the element model: it is view state, not
 * part of the design, and it should survive a drag without the page having to
 * store a value for every control on it.
 */
function Checkbox({ color }: { color: string }): React.JSX.Element {
  const [checked, setChecked] = useState(true)

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className="ui-checkbox"
      style={{ ['--accent' as string]: color, borderColor: color }}
      onClick={() => setChecked((v) => !v)}
      whileTap={{ scale: 0.88 }}
      transition={spring}
    >
      <motion.svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        initial={false}
        animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.5 }}
        transition={spring}
      >
        <path
          d="M3.5 8.5l3 3 6-7"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </motion.button>
  )
}

function Toggle({ color }: { color: string }): React.JSX.Element {
  const [on, setOn] = useState(true)

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={on}
      className="ui-toggle"
      onClick={() => setOn((v) => !v)}
      style={{ justifyContent: on ? 'flex-end' : 'flex-start' }}
      animate={{ backgroundColor: on ? color : 'rgba(38, 36, 32, 0.18)' }}
      whileTap={{ scale: 0.94 }}
      transition={spring}
    >
      {/* justify-content flips on click; `layout` turns that jump into a slide. */}
      <motion.span className="ui-toggle-knob" layout transition={spring} />
    </motion.button>
  )
}
