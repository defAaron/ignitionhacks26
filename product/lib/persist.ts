import type { LiminalSpace } from './space'

/**
 * Autosave: the whole space (pages, loose elements, wires, imported sites)
 * plus the focused page height, in localStorage. Best-effort and fail-closed:
 * a refresh should never lose work, but a storage error must never break the
 * studio either, so every call swallows its own failures.
 */

const KEY = 'baio:space:v1'

export interface Saved {
  space: LiminalSpace
  pageHeight: number
  savedAt: string
}

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Saved>
    if (!parsed.space || parsed.space.schema !== 'space-v1' || !Array.isArray(parsed.space.items)) return null
    if (parsed.space.items.length === 0) return null
    return {
      space: parsed.space,
      pageHeight: typeof parsed.pageHeight === 'number' ? parsed.pageHeight : 1400,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : ''
    }
  } catch {
    return null
  }
}

/**
 * Write the snapshot. If it doesn't fit (imported site documents can be
 * megabytes), retry without the site HTML so the user's own work survives.
 */
export function saveSnapshot(space: LiminalSpace, pageHeight: number): void {
  const payload: Saved = { space, pageHeight, savedAt: new Date().toISOString() }
  try {
    localStorage.setItem(KEY, JSON.stringify(payload))
    return
  } catch {
    /* fall through to the slim retry */
  }
  try {
    const slim: LiminalSpace = {
      ...space,
      items: space.items.map((it) => {
        const p = it.page as LiminalSpace['items'][number]['page'] & { baseSite?: unknown }
        return p.baseSite ? { ...it, page: { ...p, baseSite: undefined } } : it
      })
    }
    localStorage.setItem(KEY, JSON.stringify({ ...payload, space: slim }))
  } catch {
    /* storage unavailable (private mode, quota) - nothing to do */
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Any content worth keeping? An untouched empty page is not. */
export function isMeaningful(space: LiminalSpace): boolean {
  return (
    space.loose.length > 0 ||
    space.wires.length > 0 ||
    space.items.length > 1 ||
    space.items.some((it) => it.page.elements.length > 0 || !!(it.page as { baseSite?: unknown }).baseSite)
  )
}
