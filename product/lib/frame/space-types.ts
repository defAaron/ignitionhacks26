import type { FrameElement } from './types'
import type { FrameFile } from './app-types'

/**
 * space-frame: the liminal-level ("global") Frame. Where the page-level Seal
 * turns ONE page into a site, the space Frame takes every SEALED page on the
 * plane and connects them into one multi-page site — a linked static site (HTML
 * lane) and a routed React project (app lane).
 */

/** One page as it enters the global Frame: its wireframe plus identity. */
export interface FramePage {
  /** Permanent page id (p_… from page-v1). Route/link targets reference this. */
  id: string
  /** Friendly page name; becomes the route path and the file/link name. */
  name: string
  elements: FrameElement[]
  canvas: { width: number; height: number }
}

/**
 * A directed navigation link between two pages. Phase 3 derives these from
 * arrows drawn on the plane (lib/wire); Phase 2 leaves the list empty and the
 * generators fall back to page-name matching (a nav/button whose text matches a
 * page name links there).
 */
export interface FrameConnection {
  /** Source page id, plus the element id the arrow leaves from when known. */
  from: { page: string; element?: string }
  /** Target page id. */
  to: { page: string }
  /** Optional human label for the link (defaults to the target page name). */
  label?: string
}

export interface FrameSpaceRequest {
  pages: FramePage[]
  connections: FrameConnection[]
}

/**
 * Both global lanes return a multi-file bundle (a routed project or a linked
 * site). Same delimited `=== FILE: path ===` wire format + parseFrameFiles as
 * the app lane; `entry` is the file a viewer/preview opens first.
 */
export type FrameSpaceResponse =
  | { ok: true; files: FrameFile[]; entry: string }
  | { ok: false; reason: string }

/**
 * A page's cached per-page Seal result, held in Studio state keyed by page id.
 * Presence of a SealedFrame == the page is sealed (locked, green border). The
 * HTML lane feeds the global deterministic stitch; the app lane is the page's
 * own downloadable standalone project.
 */
export interface SealedFrame {
  /** The exact wireframe this page was sealed from — reused verbatim by the
   * global app lane so global output can never drift from what was sealed. */
  input: { elements: FrameElement[]; canvas: { width: number; height: number } }
  /** HTML lane: one self-contained page document (feeds the global stitch). */
  html: string | null
  /** App lane: the page's standalone project files. */
  files: FrameFile[] | null
  entry: string | null
}

/** One sealed page reduced to what the deterministic HTML stitch needs. */
export interface StitchPage {
  id: string
  name: string
  html: string
}

/**
 * FROZEN signature for the deterministic global HTML-lane stitch (no model
 * call): sealed pages' cached HTML + connections → a linked multi-page static
 * site as FrameFile[] (one `<slug>.html` per page + a shared injected nav;
 * entry is the first page or one named "home"/"index"). Implemented in
 * lib/frame/stitch.ts as `stitchHtmlSite(pages, connections)`.
 */
export type StitchHtmlSite = (
  pages: StitchPage[],
  connections: FrameConnection[]
) => { files: FrameFile[]; entry: string }
