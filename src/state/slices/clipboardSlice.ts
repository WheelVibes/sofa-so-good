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
  /** Source item's position at copy time. Paste uses this as the base
   *  for the offset search so the duplicate appears next to the original. */
  sourcePosition: [number, number]
}

/** Ephemeral clipboard for copy/paste of placed items. Not persisted. */
export interface ClipboardSlice {
  clipboard: ClipboardEntry | null
  setClipboard: (entry: ClipboardEntry | null) => void
}

export const CLIPBOARD_INITIAL: Pick<ClipboardSlice, 'clipboard'> = {
  clipboard: null,
}

export const createClipboardSlice: SliceCreator<ClipboardSlice, RootState> = (set) => ({
  ...CLIPBOARD_INITIAL,
  setClipboard: (entry) =>
    set({
      clipboard: entry
        ? {
            ...entry,
            props: { ...entry.props },
            sourcePosition: [entry.sourcePosition[0], entry.sourcePosition[1]],
          }
        : null,
    }),
})
