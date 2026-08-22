'use client'

import { existingSiteEnabled } from '../flag'
import type { BaseSite } from '../types'

interface Props {
  baseSite: BaseSite | undefined
  onChange: (next: BaseSite | undefined) => void
}

/**
 * The imported site's row in the element manager: it is on the page without
 * being an element, so it pins above the list with its own show/hide.
 */
export function BaseSiteRow({ baseSite, onChange }: Props) {
  if (!existingSiteEnabled() || !baseSite) return null
  const host = baseSite.url ? new URL(baseSite.url).host : null
  const name = baseSite.title || host || 'Uploaded page'
  const count = baseSite.extractedIds?.length ?? 0
  const meta =
    baseSite.mode === 'elements'
      ? `Imported site · ${count} element${count === 1 ? '' : 's'} extracted`
      : baseSite.hidden
        ? 'Imported site · guide hidden'
        : 'Imported site · shown as a guide'
  return (
    <div className="element-pinned" title={baseSite.url ?? undefined}>
      <span aria-hidden style={{ flex: 'none', width: 10, height: 10, borderRadius: 3, border: '1.5px solid currentColor', opacity: 0.7 }} />
      <div className="element-pinned-main">
        <span className="element-pinned-name">{name}</span>
        <span className="element-pinned-meta">{meta}</span>
      </div>
      <button type="button" className="element-pinned-action" onClick={() => onChange({ ...baseSite, hidden: !baseSite.hidden })}>
        {baseSite.hidden ? 'Show' : 'Hide'}
      </button>
    </div>
  )
}

/** "from site" tags for the element manager, keyed by element id. */
export function extractionTags(baseSite: BaseSite | undefined): Record<string, string> {
  if (!existingSiteEnabled() || !baseSite?.extractedIds?.length) return {}
  return Object.fromEntries(baseSite.extractedIds.map((id) => [id, 'from site']))
}
