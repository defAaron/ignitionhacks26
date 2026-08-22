'use client'

import { useState } from 'react'

/**
 * Focused-mode window chrome: a FIXED band across the top of the viewport,
 * outside the transformed world so it never scales or pans. Titlebar (traffic
 * lights + page name) over an inert tab strip. The page body is inset below
 * this band, so ink can never land on the chrome.
 *
 * Two live controls, both in the macOS traffic-light cluster: the red light
 * closes the page and the green (maximise) light toggles OUT of full screen
 * back to the windowed liminal view - both fly out to the plane (Esc stays
 * reserved for selection/sketch). The tab strip is chrome only for slice 2 -
 * clicking highlights a tab but switches no content.
 */

/** Slice-2 tab set, trimmed to the core aspects. "Design" is the provisional
 * label for the default surface; the rest are inert page-v2 placeholders. */
const TABS = ['Design', 'Links', 'Data', 'Logic'] as const

interface Props {
  /** Page name, shown centred in the titlebar. */
  name: string
  /** Leave focused mode, fly out to the windowed liminal view. */
  onWindowed(): void
}

export function PageChrome({ name, onWindowed }: Props): React.JSX.Element {
  // Highlight only - no tab switches content in slice 2.
  const [active, setActive] = useState<string>('Design')

  return (
    <div className="page-chrome">
      <div className="page-chrome-titlebar">
        <span className="traffic-lights">
          <button
            type="button"
            className="traffic-light traffic-light-close"
            onClick={onWindowed}
            aria-label="Close page - back to the liminal space"
            title="Back to the liminal space"
          />
          <span className="traffic-light traffic-light-min" aria-hidden="true" />
          <button
            type="button"
            className="traffic-light traffic-light-max is-toggle"
            onClick={onWindowed}
            aria-label="Exit full screen - windowed view"
            title="Exit full screen"
          />
        </span>
        {/* Name is a client-random default: let the client value win silently. */}
        <span className="page-chrome-name" suppressHydrationWarning>
          {name}
        </span>
      </div>
      <div className="page-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            className={`page-tab ${active === tab ? 'page-tab-on' : ''}`}
            onClick={() => setActive(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  )
}
