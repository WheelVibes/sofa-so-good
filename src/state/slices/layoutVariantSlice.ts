import type { RoomId } from '../../apartment/types'
import { isDefaultPlan } from '../../floorplan/planGeometry'
import { buildMergedCatalog } from '../../furniture/catalog'
import { arrangePlanRoom, arrangeRoom, LAYOUT_VARIANT_COUNT } from '../../layout/autoArrange'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Per-room layout reroll (LAYOUT-REROLL). The auto-arranger is deterministic —
 * one room, one layout. This slice lets the user tap "Try another layout" to
 * cycle a room through `LAYOUT_VARIANT_COUNT` distinct-but-still-valid variants
 * (different anchor wall / seating band / focal wall) and wrap back to the
 * default. The current variant index is tracked per room in SESSION state only
 * — never persisted / serialized / in the save schema (it's a transient
 * exploration cursor, not design data). The layout itself round-trips through
 * `items` as usual, and each reroll is ONE history step (`pushHistory` +
 * wholesale `setItems`), so one undo reverts a whole reroll.
 */
export interface LayoutVariantSlice {
  /** roomId → the layout-variant seed most recently applied to that room. */
  layoutVariants: Record<string, number>
  /** Reroll `roomId` to the NEXT layout variant (wraps after
   *  `LAYOUT_VARIANT_COUNT`). One undo step. No-op for an empty/unknown id. */
  rerollRoomLayout: (roomId: string) => void
}

export const LAYOUT_VARIANT_INITIAL: Pick<LayoutVariantSlice, 'layoutVariants'> = {
  layoutVariants: {},
}

export const createLayoutVariantSlice: SliceCreator<LayoutVariantSlice, RootState> = (
  set,
  get,
) => ({
  ...LAYOUT_VARIANT_INITIAL,
  rerollRoomLayout: (roomId) => {
    if (!roomId) return
    const s = get()
    const current = s.layoutVariants[roomId] ?? 0
    const seed = (current + 1) % LAYOUT_VARIANT_COUNT
    const catalog = buildMergedCatalog(s)
    // arrangeRoom is keyed on the fixed apartment's RoomId tables and throws on
    // a custom plan's arbitrary room id — route custom plans to the plan-aware
    // single-room arranger (mirrors FinishPicker's tidyRoom).
    const next = isDefaultPlan(s.floorPlan)
      ? arrangeRoom(roomId as RoomId, s.items, catalog, s.doors, seed)
      : arrangePlanRoom(s.floorPlan, roomId, s.items, catalog, s.doors, seed)
    s.pushHistory()
    s.setItems(next)
    set((st) => ({ layoutVariants: { ...st.layoutVariants, [roomId]: seed } }))
    // A11Y: the reroll silently reshuffles every item's position/rotation with
    // no visible confirmation control (unlike mirror/clone/swap, which all
    // toast) — a screen-reader user gets no signal the room actually changed.
    s.notify.start({ title: 'Layout rerolled', kind: 'success' })
  },
})
