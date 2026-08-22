'use client'

import { useCallback, useEffect, useRef } from 'react'
import { newStroke, outlineToPath, strokeOutline } from '@/lib/ink'
import type { InkPoint, Sketch, Stroke, Tool } from '@/lib/types'

interface Props {
  sketch: Sketch
  color: string
  tool: Tool
  /** Brush size for NEW strokes; committed strokes keep the width they were drawn at. */
  brushSize: number
  /** Suppresses input while the mock is thinking or a preview is pending. */
  frozen: boolean
  shaking: boolean
  /** Browse mode - the sketch steps aside entirely. */
  hidden?: boolean
  /** Page body height; changing it re-measures the (now page-sized) canvas. */
  pageHeight?: number
  /**
   * World coord of the canvas's top-left pixel. Strokes are stored in the space
   * `toLocal` produces (page-local when focused, WORLD when on the plane); the
   * canvas draws them 1:1, so its top-left pixel must map to that space's
   * origin. Focused mode leaves this at (0,0) - the page-clip already sits at
   * the local origin. The plane canvas follows the camera, so its top-left is a
   * moving world point and every stroke is drawn shifted by it. Slice 3.
   */
  drawOrigin?: { x: number; y: number }
  /**
   * Screen pixel -> stored coord, via the camera (see lib/camera). The canvas
   * lives inside the scaled/translated world, so a raw clientX - rect.left is
   * screen space, not the coord the strokes are stored in. Every point this
   * layer produces goes through here.
   */
  toLocal(clientX: number, clientY: number): { x: number; y: number }
  onStrokeStart(): void
  onStrokeEnd(stroke: Stroke): void
  onPlaceText(x: number, y: number): void
  /** Eraser drag begins - lets the owner snapshot for undo. */
  onEraseStart(): void
  /** Whole strokes with a point within the eraser radius of (x, y) get removed. */
  onErase(x: number, y: number): void
}

export function SketchLayer({
  sketch,
  color,
  tool,
  brushSize,
  frozen,
  shaking,
  hidden,
  pageHeight,
  drawOrigin,
  toLocal,
  onStrokeStart,
  onStrokeEnd,
  onPlaceText,
  onEraseStart,
  onErase
}: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const active = useRef<Stroke | null>(null)
  const activePointer = useRef<number | null>(null)
  const erasing = useRef(false)
  const frame = useRef<number | null>(null)

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight

    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)

    const ctx = canvas.getContext('2d')
    // setTransform, not scale - idempotent, so repeated resizes don't compound.
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  // Canvas-top-left -> stored-space origin offset. Focused: (0,0). Plane: the
  // camera-following frame's world top-left, so world strokes land on a small
  // canvas that tracks the viewport.
  const ox = drawOrigin?.x ?? 0
  const oy = drawOrigin?.y ?? 0

  const draw = useCallback(() => {
    frame.current = null
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

    // Shift stored points into canvas pixels: a stroke at stored (sx,sy) draws
    // at (sx-ox, sy-oy). Clear stays in untranslated space (full canvas).
    ctx.save()
    ctx.translate(-ox, -oy)
    for (const stroke of sketch.strokes) {
      ctx.fillStyle = stroke.color
      ctx.fill(outlineToPath(strokeOutline(stroke.points, true, stroke.width)))
    }
    if (active.current) {
      ctx.fillStyle = active.current.color
      ctx.fill(outlineToPath(strokeOutline(active.current.points, false, active.current.width)))
    }
    ctx.restore()
  }, [sketch.strokes, ox, oy])

  const scheduleDraw = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(draw)
  }, [draw])

  // pageHeight is a dependency because growing the canvas changes its backing
  // store, which wipes it: it has to be re-measured and redrawn.
  useEffect(() => {
    resize()
    scheduleDraw()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current)
        // Clearing the ref is load-bearing: scheduleDraw gates on it being
        // null, so a stale id would wedge every future draw.
        frame.current = null
      }
    }
  }, [resize, scheduleDraw, pageHeight])

  useEffect(() => {
    scheduleDraw()
  }, [sketch, scheduleDraw])

  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>): InkPoint => {
    // Route through the camera, NOT getBoundingClientRect: the canvas is inside
    // the scaled world, so screen pixels must be un-projected to page-local.
    const p = toLocal(e.clientX, e.clientY)
    return {
      x: p.x,
      y: p.y,
      // Mice report 0.5 when down; pens give real pressure. 0 means "no
      // report", so fall back rather than drawing a zero-width stroke.
      pressure: e.pressure > 0 ? e.pressure : 0.5
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (frozen || e.button !== 0) return

    if (tool === 'text') {
      // Without this the canvas takes focus as the click completes, which
      // blurs the text input we're about to focus - the box commits empty and
      // vanishes before you can type in it.
      e.preventDefault()
      const p = toLocal(e.clientX, e.clientY)
      onPlaceText(p.x, p.y)
      return
    }
    if (tool === 'eraser') {
      e.currentTarget.setPointerCapture(e.pointerId)
      activePointer.current = e.pointerId
      erasing.current = true
      onEraseStart()
      const p = toPoint(e)
      onErase(p.x, p.y)
      return
    }
    if (tool !== 'pen') return

    e.currentTarget.setPointerCapture(e.pointerId)
    activePointer.current = e.pointerId
    active.current = { ...newStroke(color, toPoint(e)), width: brushSize }
    onStrokeStart()
    scheduleDraw()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (activePointer.current !== e.pointerId) return

    if (erasing.current) {
      const p = toPoint(e)
      onErase(p.x, p.y)
      return
    }
    if (!active.current) return

    // Coalesced events recover the full sample rate on high-Hz pens, which is
    // what keeps fast strokes from going polygonal.
    const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? []
    if (coalesced.length > 0) {
      for (const ev of coalesced) {
        const p = toLocal(ev.clientX, ev.clientY)
        active.current.points.push({
          x: p.x,
          y: p.y,
          pressure: ev.pressure > 0 ? ev.pressure : 0.5
        })
      }
    } else {
      active.current.points.push(toPoint(e))
    }
    scheduleDraw()
  }

  const finish = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (activePointer.current !== e.pointerId) return
    const stroke = active.current

    active.current = null
    activePointer.current = null
    erasing.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    if (stroke && stroke.points.length > 0) onStrokeEnd(stroke)
    scheduleDraw()
  }

  return (
    <canvas
      ref={canvasRef}
      className={`sketch-canvas ${shaking ? 'shaking' : ''}`}
      data-tool={tool}
      data-hidden={hidden}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    />
  )
}
