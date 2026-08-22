'use client'

import { useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import { Studio } from '@/components/Studio'

/**
 * reducedMotion="user" makes every Framer animation honour
 * prefers-reduced-motion (transforms snap, opacity still eases).
 *
 * The data-studio attribute scopes studio.css's `overflow: hidden` on
 * html/body to this route only; without it, navigating back to the landing
 * page left the document unscrollable because the stylesheet stays loaded.
 */
export default function StudioPage(): React.JSX.Element {
  useEffect(() => {
    document.documentElement.setAttribute('data-studio', '')
    return () => {
      document.documentElement.removeAttribute('data-studio')
    }
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <Studio />
    </MotionConfig>
  )
}
