'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { dropIn, gentle, pickQuote, QUOTES } from '@/lib/motion'
import type { FrameFile } from '@/lib/frame/app-types'

/* Studio design language (app/studio/studio.css palette), inlined so the
   overlay is self-contained wherever it mounts. */
const PAPER = 'var(--paper)'
const INK = 'var(--ink)'
const MUTED = 'var(--ink-soft)'
const LINE = 'var(--ink-faint)'
const ACCENT = 'var(--accent-ink)'
const FONT = 'var(--font-ui)'

const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px',
  background: PAPER,
  color: INK,
  borderBottom: `1px solid ${LINE}`,
  fontFamily: FONT
}

const buttonStyle: CSSProperties = {
  appearance: 'none',
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  background: PAPER,
  color: INK,
  font: 'inherit',
  fontSize: 13,
  padding: '6px 12px',
  cursor: 'pointer'
}

interface FrameOverlayProps {
  /** Page-Seal case: one self-contained document. Absent in the site case. */
  html?: string | null
  /** The full-app lane's project files; null/empty while that lane still races. */
  files?: FrameFile[] | null
  /** The project's entry path, when the app lane has landed. */
  entry?: string | null
  /**
   * Space-Frame case: the deterministic multi-page site (one file per page plus
   * an injected nav). When present the overlay drops into SITE mode — a page
   * switcher replaces the single document, and "Download HTML" gives way to
   * "Download site (.zip)".
   */
  site?: { files: FrameFile[]; entry: string } | null
  onClose: () => void
}

/**
 * Full-screen viewer for the framed site: slim studio-style top bar over a
 * sandboxed iframe rendering the generated document. Serves two shapes — a
 * single sealed page (html) and a stitched multi-page site (site) — the latter
 * carrying a switcher across its .html files.
 */
export function FrameOverlay({ html, files, site, onClose }: FrameOverlayProps): React.JSX.Element {
  const siteMode = !!site
  // In site mode the switcher walks the .html files; the entry opens first.
  const pages = site ? site.files.filter((f) => f.path.endsWith('.html')) : []
  const [current, setCurrent] = useState<string | null>(site?.entry ?? null)
  // A fresh site (or a switch back to page mode) resets the viewer to its entry.
  useEffect(() => {
    setCurrent(site?.entry ?? null)
  }, [site])

  // What the iframe shows: the selected site page in site mode, else the sealed
  // page's own document.
  const shown = siteMode ? site!.files.find((f) => f.path === current)?.content ?? '' : html ?? ''

  const download = (): void => {
    const blob = new Blob([html ?? ''], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'baio-site.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Zip a bundle of files under a chosen name (the site, or the app project).
  // JSZip is heavy and only ever needed on this click, so it rides in on a
  // dynamic import instead of the studio's main bundle.
  const zipDownload = async (bundle: FrameFile[], name: string): Promise<void> => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    for (const file of bundle) zip.file(file.path, file.content)
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  // The project arrives on the slower lane, so the button waits: pending until
  // files land, then it's the real artifact you take home.
  const projectReady = !!files && files.length > 0
  const downloadProject = async (): Promise<void> => {
    if (!projectReady) return
    await zipDownload(files!, 'baio-app.zip')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={gentle}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        background: PAPER
      }}
    >
      <motion.div variants={dropIn} initial="hidden" animate="shown" transition={gentle} style={barStyle}>
        <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.01em' }}>
          {siteMode ? 'Site' : 'Framed'}
        </span>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: ACCENT }} aria-hidden />
        {/* Page switcher: srcDoc is sandboxed, so an in-page <a href> to another
            file can't resolve in the preview — this row IS how you move between
            pages. The downloaded zip is the real, linked site. */}
        {siteMode &&
          pages.map((f) => {
            const label = f.path.replace(/\.html$/, '') || f.path
            const on = f.path === current
            return (
              <button
                key={f.path}
                type="button"
                style={{
                  ...buttonStyle,
                  padding: '4px 10px',
                  fontSize: 12,
                  borderColor: on ? ACCENT : LINE,
                  background: on ? 'rgba(255, 178, 77, 0.18)' : PAPER,
                  color: on ? INK : MUTED,
                  fontWeight: on ? 600 : 400
                }}
                onClick={() => setCurrent(f.path)}
              >
                {label}
              </button>
            )
          })}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          style={{
            ...buttonStyle,
            borderColor: ACCENT,
            background: projectReady ? ACCENT : 'rgba(255, 178, 77, 0.18)',
            color: projectReady ? PAPER : MUTED,
            fontWeight: 600,
            cursor: projectReady ? 'pointer' : 'progress'
          }}
          disabled={!projectReady}
          onClick={downloadProject}
        >
          {projectReady ? 'Download project (.zip)' : 'Preparing project…'}
        </button>
        {siteMode ? (
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void zipDownload(site!.files, 'baio-site.zip')}
          >
            Download site (.zip)
          </button>
        ) : (
          <button type="button" style={buttonStyle} onClick={download}>
            Download HTML
          </button>
        )}
        <button
          type="button"
          style={{ ...buttonStyle, borderColor: ACCENT, background: 'var(--accent-wash)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={onClose}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Unframe
        </button>
      </motion.div>

      <iframe
        title="Framed site"
        srcDoc={shown}
        sandbox="allow-scripts"
        style={{ flex: 1, width: '100%', border: 'none', background: 'var(--paper)' }}
      />
    </motion.div>
  )
}

/**
 * Translucent working state shown while the frame request is in flight:
 * a breathing accent dot and a rotating quote from the shared pool.
 */
export function FramingVeil(): React.JSX.Element {
  // Deterministic first quote so server and client render agree; rotation
  // starts client-side in the effect.
  const [quote, setQuote] = useState(QUOTES[0])

  useEffect(() => {
    const id = window.setInterval(() => {
      setQuote((q) => pickQuote(q))
    }, 3200)
    return () => window.clearInterval(id)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={gentle}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        background: 'oklch(1 0 0 / 0.92)',
        color: INK,
        fontFamily: FONT
      }}
    >
      <motion.span
        aria-hidden
        animate={{ scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: 14, height: 14, borderRadius: 7, background: ACCENT }}
      />
      <span style={{ fontSize: 16, fontWeight: 600 }}>Framing…</span>
      <motion.span
        key={quote}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={gentle}
        style={{ fontSize: 13, color: MUTED, fontStyle: 'italic', maxWidth: 360, textAlign: 'center' }}
      >
        {quote}
      </motion.span>
    </motion.div>
  )
}
