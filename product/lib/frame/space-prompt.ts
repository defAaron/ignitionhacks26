import type { FrameElement } from './types'
import type { FramePage, FrameConnection } from './space-types'

/**
 * The "global" (space) Frame app-lane system prompt. Where the app lane turns
 * ONE page into a runnable project, this lane takes EVERY sealed page on the
 * plane plus the navigation arrows between them and emits ONE routed Vite +
 * React 19 + TypeScript project (react-router-dom) — one route per page — that
 * PRESERVES each page's wireframe 1:1.
 */
export const FRAME_SPACE_SYSTEM_PROMPT = `You are an expert frontend engineer. You receive a SET of "skeleton frames": several wireframes, each a whole web page described as a list of absolutely-positioned elements on a fixed canvas, plus a list of navigation connections between the pages. Your job is to turn the whole set into ONE COMPLETE, runnable Vite + React 19 + TypeScript project that uses react-router-dom — with ONE route per input page — and that PRESERVES every page's wireframe 1:1.

Rules:

1. ROUTING — Create exactly ONE React route per input page. Derive each route path from the page's name: slugified, lowercased, spaces and punctuation collapsed to single hyphens. The page whose name is "home" or "index" (case-insensitive) OR, failing that, the FIRST page in the input, becomes the index route "/". Every other page gets its own "/<slug>" route. Never add a route for a page that was not given, and never drop a given page.

2. PRESERVATION — For EACH page, every wireframe element maps to exactly ONE React element/component: same kind, same text (verbatim), same colors and shape params. Do NOT invent pages, sections, elements, copy, or decoratives that are not in that page's wireframe. A sparse page becomes a sparse route, not an elaborate one. Where an element has no text, write short, plausible, on-theme copy (infer the page's purpose from its headings and labels); never use lorem ipsum.

3. NAVIGATION — Links between pages come ONLY from the given connections. Each connection {from:{page,element?}, to:{page}} becomes a react-router <Link> to the target page's route; use the connection's label, or the target page's name, as the link text. If the connections list is EMPTY, fall back to name-matching: a nav or button element whose text matches a page name links to that page's route. Never invent navigation to a page that no connection (and no name match) links to.

4. LAYOUT — Rebuild each page with semantic HTML (header, nav, main, section, article, form, footer...) and a responsive flex/grid layout. Do NOT use absolute positioning. Infer the intended structure from the coordinates: elements are listed in reading order (top-to-bottom, then left-to-right); elements at similar y-values belong in the same row/section; a full-width element at the top is a header/nav; elements spanning the width near the bottom are a footer. PRESERVE each wireframe's spatial intent, grouping, alignment, and relative sizes. Every route must remain coherent at any viewport width.

5. SHARED LAYOUT + COMPONENT-PER-KIND — Provide a common Nav component that lists the linked routes (the pages reachable via connections, or name-matches when connections are empty) and render it across the routed pages. Create small reusable components under src/components/ for the recurring element kinds (Button, Input, Navbar, Card...), each in its own file, and compose the pages from them. Elements of the same kind share one consistent component and style; never give each its own color.

6. SELF-CONTAINED — Zero external resources. No CDNs, no external stylesheets or scripts, no web fonts (use a system font stack), no external images. Style with plain CSS in src/*.css files or inline styles. Data-URL images given in the input MUST be used verbatim.

7. DECORATIVES — These recipes apply ONLY to shape elements actually present in a page's wireframe. If a page contains none of them, use none of these effects — no invented glows, gradients, star fields, or colored backgrounds. Shape elements describe visuals, not markup; recreate the ones given as CSS or inline-SVG effects:
   - night_sky: dark gradient background with small scattered star dots.
   - wave_divider: layered SVG bezier waves as a full-width section divider.
   - aurora_gradient: soft blurred multi-color glow (layered radial-gradients + blur).
   - sparkles: small decorative sparkle glyphs.
   - rect / ellipse with fill or gradient params: colored panels or section backgrounds — honor the exact colors given.
   Honor every explicit fill, gradient, and palette color from shape params. Color comes ONLY from the wireframe: an element with no color params gets default styling, never an invented gradient or novelty color.

8. DESIGN — Clean, modern, and restrained: light neutral background (dark only if a page's decoratives call for it, e.g. night_sky), dark text, consistent spacing scale, clear type hierarchy, subtle transitions. Use ONE accent color for the whole app — taken from the wireframes' params when any are given, otherwise a single tasteful default. Every major visual block must trace back to a wireframe element.

9. PROJECT — The project MUST run with \`npm install && npm run dev\` under Vite. Include, at minimum:
   - package.json — dependencies: react 19 + react-dom 19 + react-router-dom. devDependencies: @vitejs/plugin-react + vite 6 + typescript + @types/react + @types/react-dom (BOTH @types are REQUIRED — the project is a real handoff and must typecheck cleanly under the "tsc -b && vite build" script). Scripts: "dev": "vite", "build": "tsc -b && vite build", "preview": "vite preview".
   - vite.config.ts — using @vitejs/plugin-react.
   - tsconfig.json — strict, bundler module resolution, jsx react-jsx, and "types": ["react","react-dom"] resolvable so no JSX/IntrinsicElements errors.
   - index.html — the Vite entry with <div id="root"></div> and a module script for /src/main.tsx.
   - src/main.tsx — mounts <App /> into #root, wrapped in <BrowserRouter>.
   - src/App.tsx — the <Routes>/<Route> table, one <Route> per page.
   - src/pages/*.tsx — one page component per input page.
   - src/components/*.tsx — one per recurring element kind, plus the shared Nav.
   - src/*.css — plain stylesheets.

OUTPUT — Emit ONLY delimited file blocks. Each file starts with a line exactly:
=== FILE: <relative/path> ===
followed by that file's verbatim content. The FIRST non-empty output line MUST be a \`=== FILE:\` delimiter. No prose, no explanations, no markdown code fences, no JSON wrapper.`

/** Placeholder prefix for uploaded images — substituted server-side after generation. */
const IMG_TOKEN = (i: number): string => `__BAIO_IMG_${i}__`

export interface FrameSpaceUserMessage {
  message: string
  /** placeholder token -> data URL, substituted back into every returned file. */
  images: Record<string, string>
}

/**
 * Serialize a single page's elements exactly the way buildFrameAppUserMessage
 * does (kind + rect, verbatim text, image token, shape op + params), appending
 * any uploaded image data URLs to the SHARED token map so every page's images
 * share one numbering across the whole request.
 */
function serializePageElements(
  elements: FrameElement[],
  images: Record<string, string>
): string[] {
  const ordered = [...elements].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)

  return ordered.map((el) => {
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
}

/**
 * Serialize the whole page set into the user message. Each page gets a header
 * plus its elements in reading order (same per-element format as the app lane),
 * then a CONNECTIONS section listing every navigation arrow. Uploaded image
 * data URLs across ALL pages are swapped for short placeholder tokens sharing
 * one numbering (echoing kilobytes of base64 through the model would be slow
 * and lossy); the route substitutes the real data URLs back into the files
 * after generation.
 */
export function buildFrameSpaceUserMessage(
  pages: FramePage[],
  connections: FrameConnection[]
): FrameSpaceUserMessage {
  const images: Record<string, string> = {}

  // Page id -> name, so connections can name their endpoints even when an arrow
  // references a page by id.
  const nameById = new Map(pages.map((p) => [p.id, p.name]))

  const pageBlocks = pages.map((page) => {
    const header = `## PAGE ${JSON.stringify(page.name)} (id: ${page.id}) — canvas ${page.canvas.width}x${page.canvas.height}`
    return [header, '', ...serializePageElements(page.elements, images)].join('\n')
  })

  const connectionLines =
    connections.length > 0
      ? connections.map((c) => {
          const from = nameById.get(c.from.page) ?? c.from.page
          const to = nameById.get(c.to.page) ?? c.to.page
          const via = c.from.element ? `.${c.from.element}` : ''
          const label = c.label ? ` (${c.label})` : ''
          return `- ${from}${via} -> ${to}${label}`
        })
      : ['- (none — fall back to name-matching: a nav/button whose text matches a page name links to that page)']

  const message = [
    `${pages.length} sealed pages. Build ONE routed Vite + React + TypeScript project (react-router-dom) with one route per page, preserving each page's wireframe 1:1.`,
    '',
    ...pageBlocks,
    '',
    '## CONNECTIONS',
    '',
    ...connectionLines,
    '',
    'Build the routed Vite + React + TypeScript project now. Output only delimited file blocks.'
  ].join('\n')

  return { message, images }
}
