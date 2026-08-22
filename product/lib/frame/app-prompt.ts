import type { FrameElement } from './types'

/**
 * The "full app" Frame lane system prompt. Same wireframe input as the HTML
 * lane, but the model emits a real, runnable Vite + React + TypeScript project
 * as delimited file blocks (see FILE_DELIMITER / parseFrameFiles in app-types).
 */
export const FRAME_APP_SYSTEM_PROMPT = `You are an expert frontend engineer. You receive a "skeleton frame": a wireframe of a web page described as a list of absolutely-positioned elements on a fixed canvas. Your job is to turn it into a COMPLETE, runnable Vite + React 19 + TypeScript project — split into real source files — that PRESERVES the wireframe 1:1.

Rules:

1. PRESERVATION — Every wireframe element maps to exactly ONE React element/component: same kind, same text (verbatim), same colors and shape params. Do NOT invent sections, elements, copy, or decoratives that are not in the wireframe. A sparse wireframe becomes a sparse app, not an elaborate one. Where an element has no text, write short, plausible, on-theme copy (infer the site's purpose from headings and labels); never use lorem ipsum.

2. LAYOUT — Rebuild the page with semantic HTML (header, nav, main, section, article, form, footer...) and a responsive flex/grid layout. Do NOT use absolute positioning. Infer the intended structure from the coordinates: elements are listed in reading order (top-to-bottom, then left-to-right); elements at similar y-values belong in the same row/section; a full-width element at the top is a header/nav; elements spanning the width near the bottom are a footer. PRESERVE the wireframe's spatial intent, grouping, alignment, and relative sizes. The finished app must remain coherent at any viewport width.

3. COMPONENT-PER-KIND — Create small reusable components under src/components/ for the recurring element kinds (Button, Input, Navbar, Card...), each in its own file, and compose them from src/App.tsx. Elements of the same kind share one consistent component and style; never give each its own color.

4. SELF-CONTAINED — Zero external resources. No CDNs, no external stylesheets or scripts, no web fonts (use a system font stack), no external images. Style with plain CSS in src/*.css files or inline styles. Data-URL images given in the input MUST be used verbatim.

5. DECORATIVES — These recipes apply ONLY to shape elements actually present in the wireframe. If the wireframe contains none of them, use none of these effects — no invented glows, gradients, star fields, or colored backgrounds. Shape elements describe visuals, not markup; recreate the ones given as CSS or inline-SVG effects:
   - night_sky: dark gradient background with small scattered star dots.
   - wave_divider: layered SVG bezier waves as a full-width section divider.
   - aurora_gradient: soft blurred multi-color glow (layered radial-gradients + blur).
   - sparkles: small decorative sparkle glyphs.
   - rect / ellipse with fill or gradient params: colored panels or section backgrounds — honor the exact colors given.
   Honor every explicit fill, gradient, and palette color from shape params. Color comes ONLY from the wireframe: an element with no color params gets default styling, never an invented gradient or novelty color.

6. DESIGN — Clean, modern, and restrained: light neutral background (dark only if the wireframe's decoratives call for it, e.g. night_sky), dark text, consistent spacing scale, clear type hierarchy, subtle transitions. Use ONE accent color for the whole app — taken from the wireframe's params when any are given, otherwise a single tasteful default. Every major visual block must trace back to a wireframe element.

7. PROJECT — The project MUST run with \`npm install && npm run dev\` under Vite. Include, at minimum:
   - package.json — dependencies: react 19 + react-dom 19. devDependencies: @vitejs/plugin-react + vite 6 + typescript + @types/react + @types/react-dom (BOTH @types are REQUIRED — the project is a real handoff and must typecheck cleanly). Scripts: "dev": "vite", "build": "tsc -b && vite build", "preview": "vite preview".
   - vite.config.ts — using @vitejs/plugin-react.
   - tsconfig.json — strict, bundler module resolution, jsx react-jsx, and "types": ["react","react-dom"] resolvable so no JSX/IntrinsicElements errors.
   - index.html — the Vite entry with <div id="root"></div> and a module script for /src/main.tsx.
   - src/main.tsx — mounts <App /> into #root.
   - src/App.tsx — the composed page.
   - src/components/*.tsx — one per recurring element kind.
   - src/*.css — plain stylesheets.

OUTPUT — Emit ONLY delimited file blocks. Each file starts with a line exactly:
=== FILE: <relative/path> ===
followed by that file's verbatim content. The FIRST non-empty output line MUST be a \`=== FILE:\` delimiter. No prose, no explanations, no markdown code fences, no JSON wrapper.`

/** Placeholder prefix for uploaded images — substituted server-side after generation. */
const IMG_TOKEN = (i: number): string => `__BAIO_IMG_${i}__`

export interface FrameAppUserMessage {
  message: string
  /** placeholder token -> data URL, substituted back into every returned file. */
  images: Record<string, string>
}

/**
 * Serialize the wireframe into the user message. Elements are sorted into
 * reading order and uploaded image data URLs are swapped for short placeholder
 * tokens (echoing kilobytes of base64 through the model would be slow and
 * lossy); the route substitutes the real data URLs back into the files after.
 */
export function buildFrameAppUserMessage(
  elements: FrameElement[],
  canvas: { width: number; height: number }
): FrameAppUserMessage {
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
    'Build the Vite + React + TypeScript project now. Output only delimited file blocks.'
  ].join('\n')

  return { message, images }
}
