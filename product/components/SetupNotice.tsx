'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { gentle } from '@/lib/motion'

interface Health {
  recognize: boolean
  seal: boolean
}

const DISMISS_KEY = 'baio:setup-dismissed'

/**
 * First-run setup notice: shown only when a required key is missing, so a
 * fresh checkout explains itself instead of failing on the first Enter.
 */
export function SetupNotice(): React.JSX.Element | null {
  const [health, setHealth] = useState<Health | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    let on = true
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
    fetch('/api/health')
      .then((r) => r.json())
      .then((h: Health) => {
        if (on) setHealth(h)
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [])

  const missing: string[] = []
  if (health && !health.recognize) missing.push('GEMINI_API_KEY — turns your ink into elements (Enter)')
  if (health && !health.seal) missing.push('ANTHROPIC_API_KEY — Seal, which builds the real website')
  const show = !dismissed && missing.length > 0

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="setup-notice"
          role="status"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={gentle}
        >
          <div className="setup-notice-title">Almost ready — add your API keys</div>
          <ul className="setup-notice-list">
            {missing.map((m) => (
              <li key={m}>
                <code>{m.split(' — ')[0]}</code> — {m.split(' — ')[1]}
              </li>
            ))}
          </ul>
          <div className="setup-notice-sub">
            Put them in <code>product/.env</code> (see <code>.env.example</code>) and restart <code>npm run dev</code>. You can still draw and import sites without them.
          </div>
          <button
            type="button"
            className="setup-notice-close"
            onClick={() => {
              setDismissed(true)
              try {
                sessionStorage.setItem(DISMISS_KEY, '1')
              } catch {
                /* ignore */
              }
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
