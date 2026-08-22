'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Lockup } from './Logo'

/** Deliberately brief. Long enough to register, short enough to never annoy. */
const HOLD_MS = 620
const FADE_MS = 0.42

export function Preloader(): React.JSX.Element {
  const [done, setDone] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setDone(true), HOLD_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="preloader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_MS, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <Lockup size={34} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
