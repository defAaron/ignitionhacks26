'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { KIND_LABEL } from '@/lib/recognize'
import type { CommittedElement } from '@/lib/types'

interface Props {
  open: boolean
  onToggle(): void
  /** Screen-space elements of the focused page, in stacking order. */
  elements: CommittedElement[]
  /** Friendly names by element id (page elements carry a renamable name). */
  names: Record<string, string>
  /** Small tag shown next to an element, e.g. where it came from. */
  tags?: Record<string, string>
  selectedId: string | null
  onSelect(id: string | null): void
  onRename(id: string, name: string): void
  onDelete(id: string): void
  /** Optional row(s) pinned above the list — e.g. an imported site. */
  header?: ReactNode
}

/**
 * The element manager: a docked column at the left edge, in the style of an
 * editor's explorer. It takes real width (the stage shrinks beside it) rather
 * than floating over the canvas. Collapsed, it folds to a thin rail with one
 * button to reopen.
 *
 * Click a row to select (the canvas highlights it), double-click the name to
 * rename, × to delete.
 */
export function ElementManager({ open, onToggle, elements, names, tags, selectedId, onSelect, onRename, onDelete, header }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the selected row in view when the selection comes from the canvas.
  useEffect(() => {
    if (!open || !selectedId) return
    listRef.current?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedId])

  const rows = [...elements].reverse()
  const commit = () => {
    if (editing) {
      const name = draft.trim()
      if (name) onRename(editing, name)
    }
    setEditing(null)
  }

  return (
    <aside className="dock" data-open={open} aria-label="Elements">
      <div className="dock-rail">
        <button
          type="button"
          className="dock-rail-button"
          data-active={open}
          onClick={onToggle}
          title={open ? 'Hide elements' : 'Show elements'}
          aria-label={open ? 'Hide elements' : 'Show elements'}
          aria-expanded={open}
          aria-controls="element-manager"
        >
          <span className="dock-rail-icon" aria-hidden />
          {!open && elements.length > 0 && <span className="dock-rail-count">{elements.length}</span>}
        </button>
      </div>

      {open && (
        <section id="element-manager" className="element-manager">
          <header className="element-manager-head">
            <span className="element-manager-title">Elements</span>
            <span className="elements-count">{elements.length}</span>
          </header>

          {header}

          <div className="element-list" ref={listRef}>
            {rows.length === 0 && <div className="element-empty">Nothing on the page yet. Sketch something or start from a site.</div>}
            {rows.map((el) => {
              const selected = el.id === selectedId
              const name = names[el.id] ?? el.id
              const kind = KIND_LABEL[el.kind] ?? el.kind
              const snippet = el.text?.trim()
              return (
                <div
                  key={el.id}
                  className="element-row"
                  data-id={el.id}
                  data-selected={selected}
                  onClick={() => onSelect(selected ? null : el.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setEditing(el.id)
                    setDraft(name)
                  }}
                >
                  <span className="element-swatch" style={{ background: el.color }} aria-hidden />
                  <div className="element-main">
                    {editing === el.id ? (
                      <input
                        className="element-rename"
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commit()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="element-name" title="Double-click to rename">
                        {name}
                      </span>
                    )}
                    <span className="element-meta">
                      <span className="element-kind">{kind}</span>
                      {tags?.[el.id] && <span className="element-tag">{tags[el.id]}</span>}
                      {(el.layer ?? 0) > 0 && <span className="element-tag">layer {(el.layer ?? 0) + 1}</span>}
                      {snippet && <span className="element-snippet">“{snippet}”</span>}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="element-delete"
                    title="Delete"
                    aria-label={`Delete ${name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(el.id)
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </aside>
  )
}
