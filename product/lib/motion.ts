import type { Transition, Variants } from 'framer-motion'

/**
 * One spring for everything that moves, so the whole surface feels like a
 * single mechanism rather than a pile of separately-tuned animations.
 */
export const spring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.8
}

export const gentle: Transition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] }

/** Chrome that slides down from the top edge. */
export const dropIn: Variants = {
  hidden: { opacity: 0, y: -14, filter: 'blur(4px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)' }
}

/** Chrome that rises from the bottom edge. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)' }
}

/** Floating bars anchored to a sketch - pop toward the reader. */
export const popIn: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1 }
}

/** A committed element arriving on the page. */
export const settleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  shown: { opacity: 1, scale: 1 }
}

export const QUOTES = [
  'The line is a dot that went for a walk.',
  'Every artist was first an amateur.',
  'Design is not just what it looks like. Design is how it works.',
  'Simplicity is the ultimate sophistication.',
  'Have no fear of perfection, you will never reach it.',
  'An idea is salvation by imagination.',
  'To draw is to look, and looking is thinking.',
  'What is now proved was once only imagined.'
]

/**
 * Picked in an event handler rather than during render - Math.random() at
 * render time would disagree between the server and client pass and trip a
 * hydration mismatch.
 */
export function pickQuote(previous?: string): string {
  const pool = QUOTES.filter((q) => q !== previous)
  return pool[Math.floor(Math.random() * pool.length)]
}
