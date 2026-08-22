'use client'

import { useMemo } from 'react'
import { existingSiteEnabled } from '../flag'
import { stripScriptsForPreview } from '../html'
import type { BaseSite } from '../types'

interface Props {
  base: BaseSite
  width: number
  height: number
}

/**
 * The imported site, painted faintly under the page so the sketch sits on top
 * of it. Rendered inside `.page-clip`, so it inherits the camera transform and
 * clips to the page body. Fully inert: no scripts, no pointer events.
 */
export function BaseSiteLayer({ base, width, height }: Props) {
  const doc = useMemo(() => stripScriptsForPreview(base.html), [base.html])
  if (!existingSiteEnabled() || base.hidden) return null
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        pointerEvents: 'none',
        opacity: 0.55,
        // Multiply: the site's white page drops out and the studio's paper shows
        // through; only its text, colours and images darken the canvas.
        mixBlendMode: 'multiply',
        zIndex: 0,
        overflow: 'hidden'
      }}
    >
      <iframe
        title="Imported site"
        srcDoc={doc}
        sandbox=""
        scrolling="no"
        tabIndex={-1}
        style={{ width, height, border: 0, pointerEvents: 'none', display: 'block', background: 'transparent' }}
      />
    </div>
  )
}
