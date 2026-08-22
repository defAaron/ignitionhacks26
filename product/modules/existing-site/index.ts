/**
 * existing-site — sketch edits onto a pre-existing website.
 *
 * Public surface. Everything the rest of the app touches comes from here; see
 * README.md for the hook lines and the removal checklist.
 */
import { existingSiteEnabled } from './flag'
import type { PageElement } from '@/lib/page'
import type { BaseSite, FrameBaseSite } from './types'

export { existingSiteEnabled } from './flag'
export { makeBaseSite } from './html'
export { buildBaseSitePromptSection } from './prompt'
export { detectSiteElements, detectedToPageElements } from './detect'
export type { DetectedElement } from './detect'
export { BaseSiteLayer } from './components/BaseSiteLayer'
export { ImportSiteControl, isHtmlFile, readHtmlFile } from './components/ImportSiteControl'
export { BaseSiteRow, extractionTags } from './components/BaseSiteRow'
export type { BaseSite, FrameBaseSite, ImportSiteRequest, ImportSiteResponse } from './types'

/**
 * Put extracted elements on the page: drop the previous extraction (if any),
 * append the new one, remember its ids, hide the guide so nothing doubles up.
 * Pass an empty list to clear the extraction.
 */
export function applyExtraction<P extends { elements: PageElement[]; baseSite?: BaseSite }>(page: P, els: PageElement[]): P {
  const prev = new Set(page.baseSite?.extractedIds ?? [])
  const kept = page.elements.filter((e) => !prev.has(e.id))
  const base = page.baseSite
    ? { ...page.baseSite, mode: els.length ? ('elements' as const) : page.baseSite.mode, hidden: els.length ? true : page.baseSite.hidden, extractedIds: els.map((e) => e.id) }
    : page.baseSite
  return { ...page, elements: [...kept, ...els], baseSite: base }
}

/**
 * Spread into the /api/frame request body (and SealedFrame.input). `{}` when
 * the module is off or the page has no base site, so the stock payload is
 * untouched.
 */
export function frameBaseSiteField(page: { baseSite?: BaseSite }): { baseSite?: FrameBaseSite } {
  if (!existingSiteEnabled() || !page.baseSite) return {}
  return { baseSite: { html: page.baseSite.html, url: page.baseSite.url } }
}
