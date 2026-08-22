import { existingSiteEnabled } from './flag'
import { trimHtml } from './html'
import type { FrameBaseSite } from './types'

/**
 * The user-message preamble that turns a from-scratch Frame into an edit of an
 * existing document. Returns '' when the module is off so the prompt is
 * byte-identical to the stock one.
 */
export function buildBaseSitePromptSection(
  base: FrameBaseSite | undefined,
  canvas: { width: number; height: number }
): string {
  if (!existingSiteEnabled() || !base || !base.html) return ''
  const source = base.url ? base.url : 'uploaded file'
  return [
    'EXISTING SITE MODE — this request MODIFIES an existing website rather than building one from scratch. Where these rules conflict with the system prompt\'s rules about building from scratch or self-contained output, these rules win; fidelity to the sketched elements still applies to the NEW elements.',
    '',
    `Source: ${source}`,
    '',
    '- Return the COMPLETE updated HTML document starting with <!doctype html>. Keep the existing structure, markup, classes, styles, scripts, text, images and links exactly as they are, except where a sketched element replaces or overlaps existing content.',
    '- Resources the site already references (stylesheets, scripts, images, fonts, <base href>) must be preserved verbatim. Only the elements YOU add must be self-contained (inline CSS/JS, no new CDNs).',
    `- Integrate each sketched element at the position implied by its coordinates. Coordinates are relative to a ${canvas.width}px-wide rendering of the existing page, y measured from the top of the document. Map each to the nearest existing section/container at that vertical position and insert it in flow (no absolute positioning), styled to match the site's own design language (its fonts, colors, spacing, button styles).`,
    '- If a sketched element sits on top of an existing element of the same kind (button over button, text over heading), treat it as an EDIT: replace its content, keep its place and styling.',
    '- Do not remove, reorder, restyle or "improve" anything that was not sketched. Do not add elements that were not sketched. Do not add or change <base>.',
    '',
    'EXISTING DOCUMENT (may be trimmed for length — script bodies, comments and inline SVG removed; preserve the original tags where they appear):',
    '<<<HTML',
    trimHtml(base.html),
    'HTML>>>'
  ].join('\n')
}
