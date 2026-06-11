/**
 * Pure state machine for the photoreal style-variant gallery (Share modal):
 * the original render plus up to one regeneration per style chip, one
 * in-flight request at a time. Kept as a plain reducer so the whole flow
 * (seed → start → success/fail, replace-on-rerun, stale-result guard) is
 * unit-testable without any provider call.
 */

export interface GalleryEntry {
  /** `original` or a `StyleVariant` id. */
  id: string
  /** Human label ("Original", "Japandi", …) — also used in the download name. */
  label: string
  /** Provider-hosted result image URL. */
  url: string
}

export interface GalleryState {
  /** Original first, then variants in the order they finished. */
  entries: GalleryEntry[]
  selectedId: string | null
  /** Style id currently generating (one at a time), or null. */
  pendingId: string | null
  /** Last variant error message (cleared on the next start/seed). */
  error: string | null
}

export const ORIGINAL_ID = 'original'

export const EMPTY_GALLERY: GalleryState = {
  entries: [],
  selectedId: null,
  pendingId: null,
  error: null,
}

export type GalleryAction =
  /** A fresh "Make photoreal" finished — restart the gallery from it. */
  | { type: 'seed'; url: string }
  /** A style chip was clicked; ignored while another variant is in flight. */
  | { type: 'start'; id: string }
  /** The in-flight variant finished. Stale results (after a re-seed) are dropped. */
  | { type: 'success'; id: string; label: string; url: string }
  | { type: 'fail'; id: string; message: string }
  | { type: 'select'; id: string }
  | { type: 'reset' }

export function galleryReducer(state: GalleryState, action: GalleryAction): GalleryState {
  switch (action.type) {
    case 'seed':
      return {
        entries: [{ id: ORIGINAL_ID, label: 'Original', url: action.url }],
        selectedId: ORIGINAL_ID,
        pendingId: null,
        error: null,
      }
    case 'start':
      if (state.pendingId || state.entries.length === 0) return state
      return { ...state, pendingId: action.id, error: null }
    case 'success': {
      if (action.id !== state.pendingId) return state // stale (gallery was re-seeded/reset)
      const entry = { id: action.id, label: action.label, url: action.url }
      const i = state.entries.findIndex((e) => e.id === action.id)
      const entries =
        i >= 0 ? state.entries.map((e, j) => (j === i ? entry : e)) : [...state.entries, entry]
      return { entries, selectedId: action.id, pendingId: null, error: null }
    }
    case 'fail':
      if (action.id !== state.pendingId) return state
      return { ...state, pendingId: null, error: action.message }
    case 'select':
      if (!state.entries.some((e) => e.id === action.id)) return state
      return { ...state, selectedId: action.id }
    case 'reset':
      return EMPTY_GALLERY
  }
}

export function selectedEntry(state: GalleryState): GalleryEntry | null {
  return state.entries.find((e) => e.id === state.selectedId) ?? null
}
