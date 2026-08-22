'use client'

import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import type { Mode } from '@/lib/types'

interface Props {
  mode: Mode
  onToggle(): void
}

/**
 * Lives outside the toolbar on purpose: it is the only control that exists in
 * both modes, and in browse it is the only visible way into edit. Everything
 * else appears and disappears around it.
 */
export function ModeToggle({ mode, onToggle }: Props): React.JSX.Element {
  const editing = mode === 'edit'
  return (
    <motion.button
      className="mode-toggle"
      data-editing={editing}
      layoutId="edit-toggle"
      onClick={onToggle}
      title={editing ? 'Done - back to the page (H)' : 'Edit the page (H)'}
      aria-label={editing ? 'Done editing' : 'Edit the page'}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.94 }}
      transition={spring}
    >
      {editing ? <CheckIcon /> : <PencilIcon />}
      <span>{editing ? 'Done' : 'Edit'}</span>
    </motion.button>
  )
}

function PencilIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
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

function CheckIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
      <path
        d="M4 10.5l4 4 8-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
