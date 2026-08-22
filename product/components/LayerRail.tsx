'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { spring } from '@/lib/motion'

interface Props {
  /** Distinct layers on the page, ascending. Rendered topmost-first. */
  layers: number[]
  /** Current peel target; null shows everything. */
  peel: number | null
  onPeel(layer: number | null): void
}

/**
 * The layer rail: one thin line per layer at the right edge, topmost first.
 * Clicking a line peels the view down to it - everything above fades away -
 * and clicking it again (or the ring above the stack) shows everything.
 * Alive in both modes, but only once overlap has actually spawned a second
 * layer; a flat page keeps its edge clean.
 */
export function LayerRail({ layers, peel, onPeel }: Props): React.JSX.Element {
  return (
    <div className="layer-rail-slot">
      <AnimatePresence>
        {layers.length >= 2 && (
          <motion.div
            className="layer-rail"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={spring}
          >
            {/* "Show all": occupies its slot permanently so the lines never
                jump; it only becomes visible (and clickable) while peeled. */}
            <button
              className="layer-all"
              data-on={peel !== null}
              onClick={() => onPeel(null)}
              tabIndex={peel !== null ? 0 : -1}
              title="Show all layers"
              aria-label="Show all layers"
            />
            <AnimatePresence>
              {[...layers].reverse().map((layer) => (
                <motion.button
                  key={layer}
                  className="layer-line"
                  data-active={peel === layer}
                  onClick={() => onPeel(peel === layer ? null : layer)}
                  aria-label={`Peel to layer ${layer + 1}`}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  whileTap={{ scale: 0.9 }}
                  transition={spring}
                >
                  <span className="layer-line-ink" />
                  <span className="layer-label">Layer {layer + 1}</span>
                </motion.button>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
