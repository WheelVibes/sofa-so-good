import type { FurnitureType, ParamProps } from '../../furniture/types'
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

/** Ephemeral clipboard for copy/paste of placed items. Holds the whole
 *  selection (one entry per copied item, each with its own `sourcePosition`) so a
 *  multi-selection pastes back as a group preserving its arrangement (PC2-MULTI-
 *  DUP-PASTE). A single copy is just a one-element array. Not persisted. */
export interface ClipboardSlice {
  clipboard: ClipboardEntry[] | null
  setClipboard: (entries: ClipboardEntry[] | null) => void
}

export const CLIPBOARD_INITIAL: Pick<ClipboardSlice, 'clipboard'> = {
  clipboard: null,
}

export const createClipboardSlice: SliceCreator<ClipboardSlice, RootState> = (set) => ({
  ...CLIPBOARD_INITIAL,
  setClipboard: (entries) =>
    set({
      clipboard:
        entries && entries.length > 0
          ? entries.map((entry) => ({
              ...entry,
              props: { ...entry.props },
              sourcePosition: [entry.sourcePosition[0], entry.sourcePosition[1]],
            }))
          : null,
    }),
})
