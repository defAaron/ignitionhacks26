'use client'

import { useRef } from 'react'
import type { Tool } from '@/lib/types'

/**
 * Nine fixed swatches, keyed 1-9. Muted takes on the spectrum so the ink
 * stays at home on the paper - ink black first because it is the default.
 */
export const PALETTE = [
  { name: 'aubergine', value: '#421040' },
  { name: 'jade', value: '#0b764d' },
  { name: 'mustard', value: '#e3a92b' },
  { name: 'cocoa', value: '#6b3a2a' },
  { name: 'teal', value: '#1f8a8a' },
  { name: 'sky', value: '#3f7fd6' },
  { name: 'violet', value: '#7a4fc9' },
  { name: 'rose', value: '#d04a8a' },
  { name: 'graphite', value: '#5c6275' }
] as const

const TOOLS: { tool: Tool; key: string; title: string }[] = [
  { tool: 'pen', key: 'd', title: 'Draw (d)' },
  { tool: 'eraser', key: 'e', title: 'Erase strokes (e)' },
  { tool: 'text', key: 't', title: 'Add text, click to place (t)' },
  { tool: 'select', key: 'm', title: 'Move, resize & delete elements (m)' }
]

interface Props {
  tool: Tool
  color: string
  brushSize: number
  onTool(tool: Tool): void
  onColor(color: string): void
  onClearSketch(): void
  onClearPage(): void
  onAddSpace(): void
  /** "+ space" grows the page; only meaningful in focused view. Hidden on the
   * plane, where there is no page to grow. */
  canAddSpace: boolean
  /** Count of the ACTIVE store (page elements when focused, loose when liminal)
   * - drives the reset button's disabled state and its label. */
  elementCount: number
  /** Label for the reset button, context-shifted per view. */
  resetLabel: string
}

export function Toolbar({
  tool,
  color,
  brushSize,
  onTool,
  onColor,
  onClearSketch,
  onClearPage,
  onAddSpace,
  canAddSpace,
  elementCount,
  resetLabel
}: Props): React.JSX.Element {
  const picker = useRef<HTMLInputElement | null>(null)
  const isCustom = !PALETTE.some((p) => p.value.toLowerCase() === color.toLowerCase())

  return (
    <div className="toolbar">
      <div className="tool-group">
        {TOOLS.map(({ tool: t, key, title }) => (
          <button
            key={t}
            className={`tool ${tool === t ? 'tool-on' : ''}`}
            onClick={() => onTool(t)}
            title={title}
            aria-label={title}
            aria-pressed={tool === t}
          >
            {t === 'pen' ? (
              <PenIcon />
            ) : t === 'eraser' ? (
              <EraserIcon />
            ) : t === 'text' ? (
              <TextIcon />
            ) : (
              <CursorIcon />
            )}
            <span className="tool-key">{key}</span>
          </button>
        ))}
      </div>

      <span className="tool-sep" />

      <div className="tool-group">
        {PALETTE.map((p, i) => (
          <button
            key={p.value}
            className={`swatch ${color.toLowerCase() === p.value.toLowerCase() ? 'swatch-on' : ''}`}
            style={{ background: p.value }}
            onClick={() => onColor(p.value)}
            title={`${p.name} (${i + 1})`}
            aria-label={`${p.name} ink (${i + 1})`}
            aria-pressed={color.toLowerCase() === p.value.toLowerCase()}
          />
        ))}

        {/* The native picker is the input itself - the swatch just opens it. */}
        <button
          className={`swatch swatch-custom ${isCustom ? 'swatch-on' : ''}`}
          style={isCustom ? { background: color } : undefined}
          onClick={() => picker.current?.click()}
          title="Custom colour"
          aria-label="Custom colour"
        >
          {!isCustom && <span className="swatch-wheel" />}
        </button>
        <input
          ref={picker}
          type="color"
          className="color-input"
          value={color}
          onChange={(e) => onColor(e.target.value)}
          aria-label="Custom colour"
        />
      </div>

      <span className="tool-sep" />

      {/* Display only - w/s drive it. The dot IS the brush, at true size. */}
      <span className="brush-indicator" role="img" aria-label={`Brush size ${brushSize}px`} title={`Brush size ${brushSize}px - w bigger, s smaller`}>
        <span className="brush-dot" style={{ width: brushSize, height: brushSize }} />
      </span>

      <span className="tool-sep" />

      <div className="tool-group">
        {canAddSpace && (
          <button className="text-btn" onClick={onAddSpace} title="Add more canvas below">
            + space
          </button>
        )}
        <button className="text-btn" onClick={onClearSketch} title="Shake off the sketch (Esc)">
          shake
        </button>
        <button
          className="text-btn"
          onClick={onClearPage}
          disabled={elementCount === 0}
          title="Remove every committed element"
        >
          {resetLabel}
        </button>
      </div>
    </div>
  )
}

function PenIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        d="M3 17l1-4 9-9 3 3-9 9-4 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EraserIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        d="M4.2 12.3l6.1-6.1a1.5 1.5 0 0 1 2.1 0l2.9 2.9a1.5 1.5 0 0 1 0 2.1l-4.3 4.3H8.6l-4.4-4.4a1.5 1.5 0 0 1 0-2.1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 15.5h8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function TextIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M4 5h12M10 5v11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CursorIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        d="M5 3l10 6-4.2 1.3L9 15z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
