'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { gentle, spring } from '@/lib/motion'

/**
 * The book: a draggable floating book button that stays out of your way, and opens the
 * in-app HOW-TO for everything baio understands (docs/features/README.md is
 * the long-form source — keep the two in sync). Edit-mode only: it's a cheat
 * sheet for drawing, and browse mode is supposed to be just the page.
 */

const LOOP: Array<[string, string]> = [
  ['1. draw', 'pen (d) — sketch shapes, write words, shade colors'],
  ['2. Enter', 'baio reads the ink and shows a ghost preview'],
  ['3. Enter again', 'it becomes real — or tap "keep as drawn", or Esc to keep sketching'],
  ['4. Done', 'your page is a live website (buttons click, toggles flip)'],
  ['5. Seal', 'browse, celadon pill — Claude freezes this page as a real site (~1 min)'],
  ['6. Frame', 'zoom out to the plane — stitches every sealed page into one site']
]

const KEYS: Array<[string, string]> = [
  ['d / e / t / m', 'pen · eraser · text · move'],
  ['1–9', 'ink color (custom swatch for any colour)'],
  ['w / s', 'brush bigger / smaller'],
  ['Enter', 'recognize → commit'],
  ['Esc', 'deselect → shake off → browse'],
  ['⌘Z', 'undo (strokes, text, erases)'],
  ['H', 'flip edit ↔ browse'],
  ['Delete', 'remove selected element (move mode)']
]

const GLYPHS: Array<[string, string]> = [
  ['b', 'button'],
  ['f', 'form'],
  ['i', 'image frame'],
  ['n', 'navbar'],
  ['v', 'video'],
  ['?', 'placeholder'],
  ['p', 'page (spawns a new page on the plane)']
]

const SHAPES: Array<[string, string]> = [
  ['box', 'crisp rect'],
  ['round loop', 'ellipse / circle'],
  ['open stroke', 'line (near-axis straightens)'],
  ['line + head', 'arrow'],
  ['handwriting', 'typeset text'],
  ['any closed doodle', 'your shape, smoothed']
]

const DETAILS: string[] = [
  'Shade inside an outline → the shape fills with that color; shade between two colors → a gradient.',
  'A word inside a shape becomes its label: "b" + "Login" → a Login button.',
  'Color words style: write "purple" in a box → purple fill. Theme words too: "Login rainbow" → a rainbow-gradient Login button.'
]

const DECOR: Array<[string, string]> = [
  ['long wavy squiggle at a section edge', 'wave divider'],
  ['dark-shaded rect + scattered dots, up top', 'night sky'],
  ['tiny 4-point asterisks near text', 'sparkles'],
  ['loose overlapping ovals in a hero', 'aurora glow']
]

const DIAGRAMS: Array<[string, string]> = [
  ['L-axes + 3-6 bars on the baseline', 'bar chart — YOUR bar heights'],
  ['circle + 2+ lines from its center', 'pie — YOUR slice angles'],
  ['2-3 overlapping circles', 'venn'],
  ['long line + 3+ ticks along it', 'timeline'],
  ['wide grid of many small boxes', 'periodic table'],
  ['small circle + rings around it', 'atom (concentric = atom, side-by-side = venn)']
]

const PHOTOS: string[] = [
  'Drag a picture from your desktop onto any drawn enclosure — it fills the frame; a blobby doodle CROPS the photo to your silhouette.',
  'Drop it on empty paper and a frame is made for you, sized to the photo.',
  'Or just ⌘V — a copied image/screenshot pastes into the selected frame, or a new one mid-screen.',
  'Double-click a frame (move mode) to swap the photo.'
]

const LAYERS: string[] = [
  'Commit something overlapping an element → it stacks on a new layer. The rail of thin lines appears at the right edge.',
  'Click a line to focus that layer: it saturates, layers behind wash out, layers above fade away. Only the focused layer is editable.',
  'Draw while focused and the commit is inserted between the strata — the focus follows it.',
  'Need more paper? Wheel-down at the bottom (or "+ space") and the page grows.'
]

const SPACE: string[] = [
  'A page sits on an infinite plane. Traffic-light close zooms you out; click a page to fly in.',
  'On the plane you can draw loose elements, drop photos, and pan (wheel or drag empty paper).',
  'Draw an arrow between two objects (elements or pages) and it becomes a wire — logic for Frame.',
  'The left dock lists page elements: click to select, double-click to rename, × to delete. Work autosaves.'
]

function Row({ k, v }: { k: string; v: string }): React.JSX.Element {
  return (
    <div className="book-row">
      <span className="book-key">{k}</span>
      <span className="book-val">{v}</span>
    </div>
  )
}

function Bullets({ items }: { items: string[] }): React.JSX.Element {
  return (
    <ul className="book-tricks">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  )
}

export function GlyphBook(): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* The book itself: drag it anywhere; tap (not drag) toggles the index. */}
      <motion.button
        className="book-fab"
        drag
        dragMomentum={false}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        whileDrag={{ scale: 1.12 }}
        onTap={() => setOpen((o) => !o)}
        transition={spring}
        title="The baio book — how do I use this?"
        aria-label="Open the baio book"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <path
            d="M10 4.5C8.2 3.2 5.6 3 3 3.4v12.2c2.6-.4 5.2-.2 7 1.1 1.8-1.3 4.4-1.5 7-1.1V3.4c-2.6-.4-5.2-.2-7 1.1z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M10 4.5v12.2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.aside
            className="book-panel"
            initial={{ opacity: 0, x: -12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -12, filter: 'blur(4px)' }}
            transition={gentle}
          >
            <header className="book-head">
              <strong>The book</strong>
              <span>how to baio</span>
              <button className="book-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </header>

            <section>
              <h4>The loop</h4>
              {LOOP.map(([k, v]) => (
                <Row key={k} k={k} v={v} />
              ))}
              <p className="book-note">
                If nothing happens on Enter, a pill top-right says why (usually the recognizer catching its breath) — your ink is kept, just retry.
              </p>
            </section>

            <section>
              <h4>Keys</h4>
              {KEYS.map(([k, v]) => (
                <Row key={k} k={k} v={v} />
              ))}
            </section>

            <section>
              <h4>Glyphs — one letter alone in a box adds function</h4>
              {GLYPHS.map(([k, v]) => (
                <Row key={k} k={`box + ${k}`} v={v} />
              ))}
              <p className="book-note">A word is never a glyph — words become labels and styles.</p>
            </section>

            <section>
              <h4>Shapes — everything enclosed gets crisp</h4>
              {SHAPES.map(([k, v]) => (
                <Row key={k} k={k} v={v} />
              ))}
            </section>

            <section>
              <h4>Details — words &amp; colors style shapes</h4>
              <Bullets items={DETAILS} />
            </section>

            <section>
              <h4>Decorative</h4>
              {DECOR.map(([k, v]) => (
                <Row key={k} k={k} v={v} />
              ))}
            </section>

            <section>
              <h4>Diagrams — draw the skeleton, then Enter</h4>
              {DIAGRAMS.map(([k, v]) => (
                <Row key={k} k={k} v={v} />
              ))}
              <p className="book-note">One diagram per Enter, with clear space around it.</p>
            </section>

            <section>
              <h4>Photos</h4>
              <Bullets items={PHOTOS} />
            </section>

            <section>
              <h4>Layers &amp; more paper</h4>
              <Bullets items={LAYERS} />
            </section>

            <section>
              <h4>The plane, pages &amp; wires</h4>
              <Bullets items={SPACE} />
            </section>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
