'use client'

import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { gentle, settleIn, spring } from '@/lib/motion'
import type { CommittedElement, Rect } from '@/lib/types'
import { RenderedElement, isPictureFrame } from './RenderedElement'

const MIN_W = 24
const MIN_H = 8

/** Peel wash (layer rail): how muted this element renders while a layer is
 * focused. Behind the focused layer = washed; above = extra washed toward
 * invisible; only the focused layer stays interactive. */
export interface Wash {
  opacity: number
  saturate: number
  interactive: boolean
}

interface Props {
  element: CommittedElement
  selected: boolean
  /** Drag/resize only exist in select mode; otherwise this is inert artwork. */
  editable: boolean
  /** Camera zoom: screen-pixel drag deltas divide by this to become page-local. */
  scale?: number
  /** Non-null while a layer is peeled; null renders normally. */
  wash?: Wash | null
  /** Root-level DnD hit-test says a dragged file is over this frame. */
  dropGlow?: boolean
  onSelect(id: string): void
  onChange(id: string, rect: Rect): void
  onDelete(id: string): void
  onUpload(id: string): void
  /** Browse-mode activation (wire navigation). Absent = inert artwork. */
  onActivate?(id: string): void
}

type DragMode = 'move' | 'resize'

export function EditableElement({
  element,
  selected,
  editable,
  scale = 1,
  wash,
  dropGlow,
  onSelect,
  onChange,
  onDelete,
  onUpload,
  onActivate
}: Props): React.JSX.Element {
  // Live drag state in a ref - moving it through React state would re-render
  // on every pointermove and make dragging feel sticky.
  const drag = useRef<{
    mode: DragMode
    startX: number
    startY: number
    origin: Rect
  } | null>(null)

  // Any drawn enclosure is a picture frame (wave3): plain images, boxes,
  // ellipses, image glyphs and closed smooth paths all take a dropped photo.
  const frame = isPictureFrame(element.kind, element.shape)

  // File-drag hover, depth-counted so child enter/leave pairs don't flicker.
  const dragDepth = useRef(0)
  const [dropHover, setDropHover] = useState(false)

  /** Only image files light the frame up; anything else shows nothing. */
  const dragHasImage = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.items).some(
      (item) => item.kind === 'file' && (item.type === '' || item.type.startsWith('image/'))
    )

  const dragEnter = (e: React.DragEvent): void => {
    if (!frame || !dragHasImage(e)) return
    dragDepth.current += 1
    setDropHover(true)
  }

  const dragOver = (e: React.DragEvent): void => {
    if (!frame || !dragHasImage(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const dragLeave = (): void => {
    if (dragDepth.current === 0) return
    dragDepth.current -= 1
    if (dragDepth.current === 0) setDropHover(false)
  }

  const drop = (): void => {
    // The studio root owns the drop end-to-end (it hit-tests frames itself,
    // since DnD events can't reach elements while the page layer is
    // pointer-inert in pen mode). Just clear the local hover state and let
    // the event bubble.
    dragDepth.current = 0
    setDropHover(false)
  }

  const begin = (e: React.PointerEvent, mode: DragMode): void => {
    if (!editable) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...element.rect }
    }
    onSelect(element.id)
  }

  const move = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    // The element lives in the scaled world, so a screen-pixel delta is `scale`
    // times the page-local delta it represents.
    const dx = (e.clientX - d.startX) / scale
    const dy = (e.clientY - d.startY) / scale

    if (d.mode === 'move') {
      onChange(element.id, { ...d.origin, x: d.origin.x + dx, y: d.origin.y + dy })
    } else {
      onChange(element.id, {
        ...d.origin,
        w: Math.max(MIN_W, d.origin.w + dx),
        h: Math.max(MIN_H, d.origin.h + dy)
      })
    }
  }

  const end = (e: React.PointerEvent): void => {
    if (!drag.current) return
    drag.current = null
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }

  return (
    <motion.div
      className={`editable ${editable ? 'editable-on' : ''} ${selected ? 'editable-selected' : ''} ${dropHover || dropGlow ? 'editable-drop' : ''}`}
      style={{
        left: element.rect.x,
        top: element.rect.y,
        width: element.rect.w,
        height: element.rect.h,
        cursor: onActivate && !editable ? 'pointer' : undefined,
        // Saturation lives in style (framer's settleIn never animates filter);
        // the CSS transition on .editable smooths it.
        filter: wash ? `saturate(${wash.saturate})` : undefined,
        pointerEvents: wash && !wash.interactive ? 'none' : undefined
      }}
      variants={settleIn}
      initial="hidden"
      // Opacity is framer-owned (settleIn animates it), so the wash level
      // must go through `animate` rather than style or it gets overwritten.
      animate={wash ? { opacity: wash.opacity, scale: 1 } : 'shown'}
      exit="hidden"
      transition={spring}
      onPointerDown={(e) => {
        if (editable) {
          begin(e, 'move')
          return
        }
        // Browse mode: no drag, but a press still selects - the element
        // manager and the canvas share one selection, so clicking either side
        // highlights the other. Stop here so the page layer doesn't clear it.
        e.stopPropagation()
        onSelect(element.id)
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDragEnter={dragEnter}
      onDragOver={dragOver}
      onDragLeave={dragLeave}
      onDrop={drop}
      onClick={() => {
        if (onActivate && !editable) onActivate(element.id)
      }}
      onDoubleClick={() => {
        if (editable && frame) onUpload(element.id)
      }}
    >
      {/* Rendered at the origin because the wrapper already carries position. */}
      <RenderedElement
        kind={element.kind}
        rect={{ ...element.rect, x: 0, y: 0 }}
        text={element.text}
        color={element.color}
        src={element.src}
        shape={element.shape}
      />

      <AnimatePresence>
        {editable && selected && (
          <>
            <motion.span
              key="handle"
              className="handle handle-se"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={spring}
              onPointerDown={(e) => begin(e, 'resize')}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
            <motion.div
              key="tools"
              className="el-tools"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={gentle}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {frame && (
                <motion.button
                  className="el-tool"
                  onClick={() => onUpload(element.id)}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  transition={spring}
                >
                  {element.src ? 'replace' : 'upload'}
                </motion.button>
              )}
              <motion.button
                className="el-tool el-tool-danger"
                onClick={() => onDelete(element.id)}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                transition={spring}
              >
                delete
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
