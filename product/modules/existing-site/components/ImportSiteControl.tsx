'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PageElement } from '@/lib/page'
import { existingSiteEnabled } from '../flag'
import { makeBaseSite } from '../html'
import { detectSiteElements, detectedToPageElements, type DetectedElement } from '../detect'
import type { BaseSite, ImportSiteResponse } from '../types'

interface Props {
  /** Same condition as the Seal button: a focused page in browse mode. */
  visible: boolean
  baseSite: BaseSite | undefined
  onChange: (next: BaseSite | undefined) => void
  /** Replace the current extraction with these elements (empty list clears it). */
  onExtract: (elements: PageElement[]) => void
  /** Layout size of the page (PAGE_WIDTH × current page height). */
  pageWidth: number
  pageHeight: number
}

/** `.html` files dropped or picked in the studio become a base site instead of an image. */
export function isHtmlFile(file: File): boolean {
  return file.type === 'text/html' || /\.html?$/i.test(file.name)
}

export function readHtmlFile(file: File): Promise<string> {
  return file.text()
}

const KIND_LABEL: Record<string, string> = {
  rect: 'Backgrounds',
  navbar: 'Nav bar',
  heading: 'Headings',
  paragraph: 'Paragraphs',
  button: 'Buttons',
  input: 'Inputs',
  checkbox: 'Checkboxes',
  image: 'Images',
  text: 'Links'
}
const KIND_ORDER = Object.keys(KIND_LABEL)

/* ---------- styles (inline so removing the module removes its CSS) ---------- */

const panel: CSSProperties = {
  position: 'fixed',
  top: 60,
  right: 106,
  zIndex: 60,
  width: 360,
  maxHeight: 'calc(100vh - 80px)',
  overflowY: 'auto',
  padding: 14,
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  borderRadius: 14,
  font: 'inherit',
  fontSize: 13,
  color: 'var(--ink)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10
}
const h: CSSProperties = { fontSize: 14, fontWeight: 700, margin: 0 }
const muted: CSSProperties = { color: 'var(--muted)', fontSize: 12.5 }
const ellipsis: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 10px',
  font: 'inherit',
  fontSize: 13,
  border: '1px solid var(--line)',
  borderRadius: 9,
  background: 'transparent',
  color: 'var(--ink)'
}
const btn: CSSProperties = {
  padding: '7px 12px',
  font: 'inherit',
  fontSize: 12.5,
  fontWeight: 600,
  border: '1px solid var(--line)',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--ink)',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
}
const primary: CSSProperties = { ...btn, background: 'var(--accent)', borderColor: 'var(--accent)' }
const link: CSSProperties = { ...btn, border: 0, padding: '4px 6px', fontWeight: 500, color: 'var(--muted)' }
const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '12px 14px',
  border: '1px solid var(--line)',
  borderRadius: 12,
  background: 'transparent',
  color: 'var(--ink)',
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit'
}
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const divider: CSSProperties = { borderTop: '1px solid var(--line)', margin: '2px 0' }

function Section({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
}

/**
 * "Start from a site" pill + a small guided popover:
 *   1. paste a URL (or drop an .html file)
 *   2. choose: sketch on top of it (guide) or turn it into editable elements
 *   3. a status card with only the actions that fit the choice
 */
export function ImportSiteControl({ visible, baseSite, onChange, onExtract, pageWidth, pageHeight }: Props) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [picker, setPicker] = useState<DetectedElement[] | null>(null)

  // A site arriving from a file drop should open the panel so the next step
  // is in view instead of silently attaching.
  const hadSite = useRef(!!baseSite)
  useEffect(() => {
    if (baseSite && !hadSite.current) setOpen(true)
    hadSite.current = !!baseSite
  }, [baseSite])

  if (!existingSiteEnabled() || !visible) return null

  const host = baseSite?.url ? new URL(baseSite.url).host : null
  const label = baseSite ? baseSite.title || host || 'Uploaded page' : null
  const count = baseSite?.extractedIds?.length ?? 0

  const importUrl = async () => {
    const target = url.trim()
    if (!target || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/import-site', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: /^https?:\/\//i.test(target) ? target : `https://${target}` })
      })
      const json = (await res.json()) as ImportSiteResponse
      if (!json.ok) {
        setError(json.reason)
        return
      }
      // Keep the previous extraction's ids so the next extract replaces it.
      onChange({ ...makeBaseSite(json.html, json.url), title: json.title || undefined, extractedIds: baseSite?.extractedIds })
      setPicker(null)
      setUrl('')
    } catch {
      setError("couldn't reach that page")
    } finally {
      setBusy(false)
    }
  }

  const detect = async (): Promise<DetectedElement[] | null> => {
    if (!baseSite || detecting) return null
    setDetecting(true)
    setError(null)
    try {
      const items = await detectSiteElements(baseSite.html, baseSite.url, { width: pageWidth, height: pageHeight })
      if (items.length === 0) setError('Nothing recognisable on this page — try sketching on top instead.')
      return items
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't read the page")
      return null
    } finally {
      setDetecting(false)
    }
  }

  /** One click: detect everything and put it on the canvas. */
  const extractAll = async () => {
    const items = await detect()
    if (!items || items.length === 0) return
    onExtract(detectedToPageElements(items, pageWidth / 2))
    setPicker(null)
  }

  const openPicker = async () => {
    const items = await detect()
    if (items && items.length) setPicker(items)
  }

  const applyPicker = () => {
    if (!picker) return
    onExtract(detectedToPageElements(picker, pageWidth / 2))
    setPicker(null)
  }

  const useAsGuide = () => {
    if (!baseSite) return
    onExtract([]) // clears any previous extraction
    onChange({ ...baseSite, mode: 'guide', hidden: false, extractedIds: [] })
  }

  const remove = () => {
    onExtract([])
    onChange(undefined)
    setPicker(null)
  }

  const picked = picker ? picker.filter((d) => d.pick).length : 0
  const kinds = picker ? KIND_ORDER.filter((k) => picker.some((d) => d.kind === k)) : []

  return (
    <>
      <button
        type="button"
        className="frame-toggle"
        style={{ right: 300, maxWidth: 220 }}
        onClick={() => setOpen((o) => !o)}
        title={baseSite ? `Working from ${label}` : 'Start from an existing website'}
        aria-label="Import site"
        aria-expanded={open}
      >
        <span style={ellipsis}>{baseSite ? `✓ ${label}` : 'Start from a site'}</span>
      </button>

      {open && (
        <div style={panel} role="dialog" aria-label="Start from a site">
          {/* ---------- step 1: nothing attached yet ---------- */}
          {!baseSite && (
            <Section>
              <p style={h}>Start from an existing website</p>
              <div style={row}>
                <input
                  style={input}
                  type="url"
                  placeholder="https://…"
                  value={url}
                  disabled={busy}
                  autoFocus
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void importUrl()
                  }}
                />
                <button type="button" style={primary} onClick={() => void importUrl()} disabled={busy || !url.trim()}>
                  {busy ? 'Loading…' : 'Import'}
                </button>
              </div>
              <div style={muted}>Or drop an .html file anywhere on the page.</div>
              {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
            </Section>
          )}

          {/* ---------- step 2: attached, choose how to use it ---------- */}
          {baseSite && !baseSite.mode && !picker && (
            <Section>
              <div style={{ ...row, justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, ...ellipsis }}>{label}</div>
                  {host && <div style={{ ...muted, ...ellipsis }}>{host}</div>}
                </div>
                <button type="button" style={link} onClick={remove}>
                  Remove
                </button>
              </div>
              <div style={divider} />
              <p style={h}>How do you want to use it?</p>
              <button type="button" style={card} onClick={useAsGuide}>
                <span style={{ fontWeight: 700 }}>Sketch on top</span>
                <span style={muted}>Shows the page faintly under your ink as a guide. Seal edits the real site with what you draw.</span>
              </button>
              <button type="button" style={card} onClick={() => void extractAll()} disabled={detecting}>
                <span style={{ fontWeight: 700 }}>{detecting ? 'Reading the page…' : 'Turn into elements'}</span>
                <span style={muted}>Pulls its backgrounds, buttons, text, inputs, images and nav onto the canvas as editable pieces. The guide hides so nothing doubles up.</span>
              </button>
              {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
            </Section>
          )}

          {/* ---------- step 3: status + actions for the chosen mode ---------- */}
          {baseSite && baseSite.mode && !picker && (
            <Section>
              <div style={{ ...row, justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, ...ellipsis }}>{label}</div>
                  <div style={muted}>
                    {baseSite.mode === 'guide'
                      ? baseSite.hidden
                        ? 'Guide hidden'
                        : 'Shown as a guide under your ink'
                      : `${count} element${count === 1 ? '' : 's'} on the canvas`}
                  </div>
                </div>
                <button type="button" style={link} onClick={remove}>
                  Remove
                </button>
              </div>
              <div style={divider} />
              <div style={{ ...row, flexWrap: 'wrap' }}>
                <button type="button" style={btn} onClick={() => onChange({ ...baseSite, hidden: !baseSite.hidden })}>
                  {baseSite.hidden ? 'Show guide' : 'Hide guide'}
                </button>
                {baseSite.mode === 'guide' ? (
                  <button type="button" style={btn} onClick={() => void extractAll()} disabled={detecting}>
                    {detecting ? 'Reading…' : 'Turn into elements'}
                  </button>
                ) : (
                  <>
                    <button type="button" style={btn} onClick={() => void openPicker()} disabled={detecting}>
                      {detecting ? 'Reading…' : 'Choose elements…'}
                    </button>
                    <button type="button" style={btn} onClick={useAsGuide}>
                      Back to guide
                    </button>
                  </>
                )}
              </div>
              {baseSite.mode === 'elements' && (
                <div style={muted}>Elements are redrawn in the studio&apos;s style; move, resize or delete them like anything you sketched.</div>
              )}
              {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
            </Section>
          )}

          {/* ---------- picker: choose which elements to keep ---------- */}
          {baseSite && picker && (
            <Section>
              <div style={{ ...row, justifyContent: 'space-between' }}>
                <p style={h}>Choose elements</p>
                <span style={muted}>
                  {picked} of {picker.length}
                </span>
              </div>
              {kinds.map((kind) => {
                const group = picker.filter((d) => d.kind === kind)
                const allOn = group.every((d) => d.pick)
                return (
                  <div key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <label style={{ ...row, fontWeight: 700, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={allOn}
                        onChange={() => setPicker((d) => d && d.map((it) => (it.kind === kind ? { ...it, pick: !allOn } : it)))}
                      />
                      {KIND_LABEL[kind]} <span style={muted}>({group.length})</span>
                    </label>
                    {group.map((d) => (
                      <label key={d.key} style={{ ...row, paddingLeft: 20, cursor: 'pointer', opacity: d.pick ? 1 : 0.5 }}>
                        <input
                          type="checkbox"
                          checked={d.pick}
                          onChange={() => setPicker((p) => p && p.map((it) => (it.key === d.key ? { ...it, pick: !it.pick } : it)))}
                        />
                        <span style={ellipsis}>{d.text || (d.kind === 'image' ? d.src?.split('/').pop() : '') || `${d.rect.w}×${d.rect.h}`}</span>
                      </label>
                    ))}
                  </div>
                )
              })}
              <div style={divider} />
              <div style={{ ...row, justifyContent: 'flex-end' }}>
                <button type="button" style={link} onClick={() => setPicker(null)}>
                  Cancel
                </button>
                <button type="button" style={primary} onClick={applyPicker} disabled={picked === 0}>
                  Use {picked} element{picked === 1 ? '' : 's'}
                </button>
              </div>
            </Section>
          )}
        </div>
      )}
    </>
  )
}
