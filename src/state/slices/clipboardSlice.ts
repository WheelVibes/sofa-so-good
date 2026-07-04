import type { FurnitureType, ParamProps, ParamValue } from '../../furniture/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Snapshot of a copied item — defId + rotation + a deep copy of props.
 *  Position and id are intentionally omitted: paste computes a new
 *  position via offset search, and a fresh id is minted on add. */
export interface ClipboardEntry {
  defId: FurnitureType
  rotation: number
  props: ParamProps
  /** Mirror flips, so copying a flipped piece keeps it flipped on paste. */
  flipX?: boolean
  flipZ?: boolean
  /** Custom display name, so a duplicate keeps it (consistent with multi-dup). */
  label?: string
  /** Source item's position at copy time. Paste uses this as the base
   *  for the offset search so the duplicate appears next to the original. */
  sourcePosition: [number, number]
}

const LS_KEY = 'hdb_clipboard'

/** Ephemeral clipboard for copy/paste of placed items. Holds the whole
 *  selection (one entry per copied item, each with its own `sourcePosition`) so a
 *  multi-selection pastes back as a group preserving its arrangement (PC2-MULTI-
 *  DUP-PASTE). A single copy is just a one-element array.
 *
 *  Persisted to localStorage (R3-FEAT-1, `hdb_clipboard`) so a copy survives a
 *  reload and pastes across designs — mirrors the `favouritesSlice`/`recentSlice`
 *  per-device convenience pattern (load once at module init, write on every
 *  mutation). Kept OUT of the save schema + autosave watch-list: it's device-local
 *  scratch state, not part of a saved design. Paste itself already re-resolves
 *  each entry's `defId` against the *current* catalog (see `App.tsx`'s
 *  `pasteClipboard`) and silently skips anything unresolvable, so a stale entry
 *  copied from a design whose def is gone in the target design (or in a future
 *  session) degrades gracefully instead of crashing or reviving a stale item. */
export interface ClipboardSlice {
  clipboard: ClipboardEntry[] | null
  setClipboard: (entries: ClipboardEntry[] | null) => void
}

function isParamValue(v: unknown): v is ParamValue {
  return typeof v === 'number' || typeof v === 'string'
}

function isClipboardEntry(v: unknown): v is ClipboardEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  if (typeof e.defId !== 'string') return false
  if (typeof e.rotation !== 'number') return false
  if (!e.props || typeof e.props !== 'object') return false
  if (!Object.values(e.props as Record<string, unknown>).every(isParamValue)) return false
  if (!Array.isArray(e.sourcePosition) || e.sourcePosition.length !== 2) return false
  if (!e.sourcePosition.every((n) => typeof n === 'number')) return false
  if (e.flipX !== undefined && typeof e.flipX !== 'boolean') return false
  if (e.flipZ !== undefined && typeof e.flipZ !== 'boolean') return false
  if (e.label !== undefined && typeof e.label !== 'string') return false
  return true
}

function loadClipboard(): ClipboardEntry[] | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return null
    const entries = parsed.filter(isClipboardEntry)
    return entries.length > 0 ? entries : null
  } catch {
    return null
  }
}

function persistClipboard(entries: ClipboardEntry[] | null): void {
  try {
    if (entries && entries.length > 0) localStorage.setItem(LS_KEY, JSON.stringify(entries))
    else localStorage.removeItem(LS_KEY)
  } catch {
    // private mode / quota — clipboard persistence is non-critical, ignore.
  }
}

export const CLIPBOARD_INITIAL: Pick<ClipboardSlice, 'clipboard'> = {
  clipboard: loadClipboard(),
}

export const createClipboardSlice: SliceCreator<ClipboardSlice, RootState> = (set) => ({
  ...CLIPBOARD_INITIAL,
  setClipboard: (entries) => {
    const next =
      entries && entries.length > 0
        ? entries.map((entry) => ({
            ...entry,
            props: { ...entry.props },
            sourcePosition: [entry.sourcePosition[0], entry.sourcePosition[1]] as [number, number],
          }))
        : null
    persistClipboard(next)
    set({ clipboard: next })
  },
})
