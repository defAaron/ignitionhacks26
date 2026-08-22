/** A pre-existing website attached to a page as the layer the sketch edits. */
export interface BaseSite {
  /** Source URL, or null when the document came from a dropped .html file. */
  url: string | null
  /** Full document. For URL imports a <base href> has been injected. */
  html: string
  title?: string
  /** ISO timestamp of the import. */
  fetchedAt: string
  /** Preview layer hidden on the canvas (the site is still sent to Frame). */
  hidden?: boolean
  /** How the user chose to work with it; unset until they pick. */
  mode?: 'guide' | 'elements'
  /** Ids of page elements produced by the last extraction, so a re-extract
   * replaces them instead of stacking duplicates. */
  extractedIds?: string[]
}

/** What rides along on the /api/frame request and SealedFrame.input. */
export interface FrameBaseSite {
  html: string
  url: string | null
}

export interface ImportSiteRequest {
  url?: string
  html?: string
}

export type ImportSiteResponse =
  | { ok: true; html: string; title: string; url: string | null }
  | { ok: false; reason: string }
