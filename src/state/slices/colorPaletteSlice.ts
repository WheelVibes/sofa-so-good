import { normalizeHex } from '../../materials/colorHarmony'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Max colours in the master (or a per-room) palette. */
export const MAX_PALETTE_COLORS = 5

/**
 * Apartment master colour palette (CUSTOMIZE-MASTER-PALETTE). The user sets an
 * overall palette of up to 5 colours for the home; any room can override it.
 * Every colour-picker surface offers the effective palette as an "Apartment
 * theme" swatch row plus a "Recommended" row of harmony blends (derived live by
 * `colorHarmony.recommendedBlends`). This is design data — it persists in the
 * save schema (not localStorage) and is undoable.
 */
export interface ColorPaletteSlice {
  /** Up to 5 hex colours; the apartment-wide default palette. */
  masterPalette: string[]
  /** Per-room overrides (room id → palette). A room not present inherits master. */
  roomPalettes: Record<string, string[]>
  /** Replace the master palette (sanitised + capped at 5). */
  setMasterPalette: (colors: string[]) => void
  /** Set (or clear, with `null`) a room's palette override. */
  setRoomPalette: (roomId: string, colors: string[] | null) => void
}

/** Sanitise a palette: keep only valid hex, dedupe, cap at 5. */
function cleanPalette(colors: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const c of colors) {
    const n = normalizeHex(c)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= MAX_PALETTE_COLORS) break
  }
  return out
}

/** The palette in effect for a room: its override if any, else the master. Pure
 *  helper so renderers/pickers resolve the effective palette consistently. */
export function effectivePalette(
  master: string[],
  roomPalettes: Record<string, string[]>,
  roomId?: string | null,
): string[] {
  if (roomId && roomPalettes[roomId]?.length) return roomPalettes[roomId]
  return master
}

export const COLOR_PALETTE_INITIAL: Pick<ColorPaletteSlice, 'masterPalette' | 'roomPalettes'> = {
  masterPalette: [],
  roomPalettes: {},
}

export const createColorPaletteSlice: SliceCreator<ColorPaletteSlice, RootState> = (set, get) => ({
  ...COLOR_PALETTE_INITIAL,
  setMasterPalette: (colors) => {
    get().pushHistory()
    set({ masterPalette: cleanPalette(colors) })
  },
  setRoomPalette: (roomId, colors) => {
    if (!roomId) return
    get().pushHistory()
    set((s) => {
      const next = { ...s.roomPalettes }
      const cleaned = colors ? cleanPalette(colors) : []
      if (cleaned.length) next[roomId] = cleaned
      else delete next[roomId]
      return { roomPalettes: next }
    })
  },
})
