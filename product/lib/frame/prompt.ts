import type { FrameElement } from './types'

/**
 * The Frame system prompt. The wireframe arrives as a list of absolutely
 * positioned elements; the model returns one standalone HTML document.
 */
export const FRAME_SYSTEM_PROMPT = `You are an expert frontend engineer. You receive a "skeleton frame": a wireframe of a web page described as a list of absolutely-positioned elements on a fixed canvas. Your job is to turn it into a COMPLETE, self-contained, production-quality website as a single HTML file.

Rules:

1. LAYOUT — Rebuild the page with semantic HTML (header, nav, main, section, article, form, footer...) and a responsive flex/grid layout. Do NOT use absolute positioning. Infer the intended structure from the coordinates: elements are listed in reading order (top-to-bottom, then left-to-right); elements at similar y-values belong in the same row/section; a full-width element at the top is a header/nav; elements spanning the width near the bottom are a footer. PRESERVE the wireframe's spatial intent, grouping, alignment, and relative sizes — the finished page must feel like the wireframe grew up, not like a different site. It must remain coherent at any viewport width.

2. INTERACTIVITY — Everything that looks interactive must work: nav links smooth-scroll to real page sections, buttons have hover/active states and do something sensible, form inputs have labels and working validation with inline error messages and a success state, checkboxes and toggles actually toggle. Use vanilla JavaScript in a single <script> tag at the end of <body>.

3. SELF-CONTAINED — Zero external resources. No CDNs, no external stylesheets or scripts, no web fonts (use system font stacks), no external images. All CSS inline in one <style> tag in <head>. All JS inline. Data-URL images given in the input may be used verbatim.

4. DECORATIVES — These recipes apply ONLY to shape elements actually present in the wireframe. If the wireframe contains none of them, use none of these effects — no invented glows, gradients, star fields, or colored backgrounds. Shape elements describe visuals, not markup; recreate the ones given as CSS or inline-SVG effects:
   - night_sky: dark gradient background with small scattered star dots (CSS gradients or inline SVG).
   - wave_divider: layered SVG bezier waves as a full-width section divider.
   - aurora_gradient: soft blurred multi-color glow (layered radial-gradients + blur).
   - sparkles: small decorative sparkle glyphs.
   - rect / ellipse with fill or gradient params: colored panels or section backgrounds — honor the exact colors given.
   Honor every explicit fill, gradient, and palette color from shape params. Color comes ONLY from the wireframe: an element with no color params gets the page's default styling, never an invented gradient or novelty color.

5. CONTENT — Use the wireframe's text verbatim where given; never reword, trim, or paraphrase it. Where an element genuinely has no text, write short, plausible, on-theme copy for THAT element only (infer the site's purpose from headings and labels). This per-element copy fills in empty elements — it must never spawn NEW elements, sections, or list items the wireframe does not contain. Never use lorem ipsum.

6. DESIGN — Clean, modern, and restrained: light neutral background (dark only if the wireframe's decoratives call for it, e.g. night_sky), dark text, consistent spacing scale, clear type hierarchy, subtle transitions. Use ONE accent color for the whole page — taken from the wireframe's params when any are given, otherwise a single tasteful default. Repeated elements of the same kind (e.g. several buttons) share one consistent style; never give each its own color. Every major visual block must trace back to a wireframe element: do not add extra sections, hero backdrops, panels, or decorative flourishes the wireframe doesn't contain. A sparse wireframe becomes a sparse, well-composed page — not an elaborate one.

7. FIDELITY — This is the overriding contract: map the wireframe 1:1. Every element in the input must appear in the output EXACTLY ONCE, as the same kind of thing, carrying the SAME text verbatim. Do NOT add elements the wireframe does not contain — no extra sections, hero backdrops, testimonials, feature grids, pricing tables, cards, links, or any content the user did not draw. Do NOT drop, merge, or fold away any element that is present; each one must survive as its own distinct block. You are cleaning up and upshaping the given elements — aligning, spacing, and styling them into a coherent, real, responsive page — NOT designing a new site inspired by the wireframe. Think "the wireframe, tidied and made real", not "a site in the spirit of the wireframe".

OUTPUT — Respond with ONLY the HTML document, starting with <!doctype html> and ending with </html>. No prose before or after, no markdown code fences, no explanations.`

/** Placeholder prefix for uploaded images — substituted server-side after generation. */
const IMG_TOKEN = (i: number): string => `__BAIO_IMG_${i}__`

export interface FrameUserMessage {
  message: string
  /** placeholder token -> data URL, substituted back into the returned HTML. */
  images: Record<string, string>
}

/**
 * Serialize the wireframe into the user message. Elements are sorted into
 * reading order and uploaded image data URLs are swapped for short placeholder
 * tokens (echoing kilobytes of base64 through the model would be slow and
 * lossy); the route substitutes the real data URLs back afterwards.
 */
export function buildFrameUserMessage(
  elements: FrameElement[],
  canvas: { width: number; height: number }
): FrameUserMessage {
  const images: Record<string, string> = {}

  const ordered = [...elements].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)

  const lines = ordered.map((el) => {
    const { x, y, w, h } = el.rect
    const pos = `x=${Math.round(x)} y=${Math.round(y)} w=${Math.round(w)} h=${Math.round(h)}`
    const parts = [`- ${el.kind} (${pos})`]

    if (el.text) parts.push(`text: ${JSON.stringify(el.text)}`)

    if (el.src) {
      const token = IMG_TOKEN(Object.keys(images).length)
      images[token] = el.src
      parts.push(`uploaded image: use exactly src="${token}" for this image (it will be replaced with the real image data)`)
    }

    if (el.shape) {
      parts.push(`shape op: ${el.shape.op}`)
      if (el.shape.params && Object.keys(el.shape.params).length > 0) {
        parts.push(`params: ${JSON.stringify(el.shape.params)}`)
      }
    }

    return parts.join(' | ')
  })

  const message = [
    `Canvas: ${canvas.width}x${canvas.height}px. Wireframe elements in reading order:`,
    '',
    ...lines,
    '',
    'Build the website now. Output only the HTML document.'
  ].join('\n')

  return { message, images }
}
