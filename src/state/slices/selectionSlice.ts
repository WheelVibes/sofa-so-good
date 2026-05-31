import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface SelectionSlice {
  selectedItemId: string | null
  /** Item under the cursor (orbit + select mode) for a hover highlight. */
  hoveredItemId: string | null
  setHovered: (id: string | null) => void
  /** Multi-selection set, populated by marquee drag and shift-click.
   *  When a single item is selected this contains exactly that id; when
   *  empty, no items are selected. `selectedItemId` mirrors the "primary"
   *  (most-recently-clicked) entry — kept for the inspector/keybinding
   *  paths that still operate on a single item. */
  selectedItemIds: string[]
  selectedRoomId: string | null
  /** Selected wall face for accent-wall finishing: a wall id + the room its
   *  clicked face backs. Mutually exclusive with item/room selection. */
  selectedWall: { wallId: string; roomId: string } | null
  /** Transient group context: the group whose members are collectively
   *  selected. Set when a click lands on a grouped item; null when a click
   *  lands elsewhere or on an ungrouped item. Not persisted. */
  activeGroupId: string | null
  selectItem: (id: string | null) => void
  setSelectedItemIds: (ids: string[]) => void
  toggleSelectedItem: (id: string) => void
  /** Group-aware click selection (spec §2.2).
   *  - grouped item, not already the active group → select whole group.
   *  - grouped item, already-selected member of the active group (or alt) →
   *    drill into just that member (keep activeGroupId).
   *  - ungrouped item → select it and clear activeGroupId. */
  selectItemGrouped: (id: string, opts: { alt?: boolean }) => void
  /** Drop the active-group context (e.g. on an outside/empty click). */
  clearActiveGroup: () => void
  selectRoom: (id: string | null) => void
  selectWall: (wallId: string, roomId: string) => void
}

export const SELECTION_INITIAL: Pick<
  SelectionSlice,
  | 'selectedItemId'
  | 'selectedItemIds'
  | 'selectedRoomId'
  | 'selectedWall'
  | 'hoveredItemId'
  | 'activeGroupId'
> = {
  selectedItemId: null,
  selectedItemIds: [],
  selectedRoomId: null,
  selectedWall: null,
  hoveredItemId: null,
  activeGroupId: null,
}

export const createSelectionSlice: SliceCreator<SelectionSlice, RootState> = (set, get) => ({
  ...SELECTION_INITIAL,
  setHovered: (id) => set((s) => (s.hoveredItemId === id ? {} : { hoveredItemId: id })),
  /** Selecting an item clears the room selection (and vice versa) so the
   *  Inspector / FinishPicker never both render at once. */
  selectItem: (id) =>
    set({
      selectedItemId: id,
      selectedItemIds: id ? [id] : [],
      selectedRoomId: null,
      selectedWall: null,
      activeGroupId: null,
    }),
  setSelectedItemIds: (ids) =>
    set({
      selectedItemIds: ids,
      selectedItemId: ids.length > 0 ? ids[ids.length - 1] : null,
      selectedRoomId: null,
      selectedWall: null,
    }),
  toggleSelectedItem: (id) =>
    set((s) => {
      const has = s.selectedItemIds.includes(id)
      const next = has ? s.selectedItemIds.filter((x) => x !== id) : [...s.selectedItemIds, id]
      return {
        selectedItemIds: next,
        selectedItemId: next.length > 0 ? next[next.length - 1] : null,
        selectedRoomId: null,
        selectedWall: null,
      }
    }),
  selectItemGrouped: (id, opts) =>
    set(() => {
      const item = get().items.find((it) => it.id === id)
      const gid = item?.groupId ?? null
      if (!gid) {
        // Ungrouped item: plain single-select, drop group context.
        return {
          selectedItemId: id,
          selectedItemIds: [id],
          selectedRoomId: null,
          selectedWall: null,
          activeGroupId: null,
        }
      }
      const prev = get()
      const alreadySelectedMember = prev.activeGroupId === gid && prev.selectedItemIds.includes(id)
      const drillIn = opts.alt === true || alreadySelectedMember
      if (drillIn) {
        // Drill into the single member, keep the group context active.
        return {
          selectedItemId: id,
          selectedItemIds: [id],
          selectedRoomId: null,
          selectedWall: null,
          activeGroupId: gid,
        }
      }
      // First click on the group: select all members.
      const memberIds = get()
        .itemsInGroup(gid)
        .map((it) => it.id)
      return {
        selectedItemId: id,
        selectedItemIds: memberIds,
        selectedRoomId: null,
        selectedWall: null,
        activeGroupId: gid,
      }
    }),
  clearActiveGroup: () => set({ activeGroupId: null }),
  selectRoom: (id) =>
    set({ selectedRoomId: id, selectedItemId: null, selectedItemIds: [], selectedWall: null }),
  selectWall: (wallId, roomId) =>
    set({
      selectedWall: { wallId, roomId },
      selectedItemId: null,
      selectedItemIds: [],
      selectedRoomId: null,
    }),
})
