import type { Rect } from './types'

/**
 * Client-side rasterizer for the recognizer. Strokes are serialized to an SVG
 * string on a white background and drawn through a <canvas> - the labeler's
 * export technique. Stroke colours are PRESERVED on purpose: colour is signal
 * for the vision model (night skies, gradients), not just a UI affordance.
 */

export interface RasterPoint {
  x: number
  y: number
}

/** The pipeline's stroke shape: plain points, an explicit width. */
export interface RasterStroke {
  id: string
  points: RasterPoint[]
  color: string
  width: number
}

function strokeSvgFragment(s: RasterStroke): string {
  if (s.points.length === 1) {
    const p = s.points[0]
    return `<circle cx="${p.x}" cy="${p.y}" r="${s.width / 2}" fill="${s.color}"/>`
  }
  const pts = s.points.map((p) => `${p.x},${p.y}`).join(' ')
  return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`
}

/** Serialize strokes (only - no typed text) to a white-background base64 PNG. */
export async function renderPngBase64(
  strokes: RasterStroke[],
  width: number,
  height: number
): Promise<string> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    strokes.map(strokeSvgFragment).join('') +
    `</svg>`
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('SVG rasterization failed'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png').split(',')[1]
}

/** Union bounding box of all raw stroke points, or null when there are none. */
export function strokesBounds(strokes: RasterStroke[]): Rect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) }
}

/**
 * Flatten strokes into one path for "keep as drawn" (smooth_path silhouette).
 * Multi-stroke ink concatenates in draw order - good enough for v1; the
 * template's Catmull-Rom smoothing hides most seams. Downsampled to keep the
 * component tree light.
 */
export function strokesToPath(strokes: RasterStroke[], maxPoints = 300): RasterPoint[] {
  const pts: RasterPoint[] = []
  for (const s of strokes) for (const p of s.points) pts.push({ x: p.x, y: p.y })
  if (pts.length <= maxPoints) return pts
  const step = pts.length / maxPoints
  const out: RasterPoint[] = []
  for (let i = 0; i < maxPoints; i++) out.push(pts[Math.floor(i * step)])
  out.push(pts[pts.length - 1])
  return out
}
