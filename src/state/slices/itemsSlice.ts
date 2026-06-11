import { GROUND_LEVEL_ID, levelOfRoom } from '../../floorplan/levels'
import type { FurnitureItem, ParamProps } from '../../furniture/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Returns a fresh UUID. Falls back to a Math.random-based id if
 *  crypto.randomUUID is unavailable (very old browsers / non-secure
 *  contexts during tests). */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

export interface ItemsSlice {
  items: FurnitureItem[]
  addItem: (item: Omit<FurnitureItem, 'id'>) => string
  moveItem: (id: string, position: [number, number]) => void
  rotateItem: (id: string, rotation: number) => void
  deleteItem: (id: string) => void
  updateItemProps: (id: string, props: ParamProps) => void
  /** Mirror-flip an item along its local X ('x') or Z ('z') axis. */
  flipItem: (id: string, axis: 'x' | 'z') => void
  /** Toggle the locked (pinned) state of an item. */
  toggleLock: (id: string) => void
  /** Lock or unlock every item at once (protect/unprotect a finished layout). */
  setAllLocked: (locked: boolean) => void
  /** Lock/unlock a specific set of items in one history step (e.g. a whole room
   *  from the Layers panel). */
  setItemsLocked: (ids: string[], locked: boolean) => void
  /** Set (or clear, with an empty/blank string) an item's custom display name.
   *  Falls back to the catalog def name when absent. */
  renameItem: (id: string, label: string) => void
  /** Copy one item's props (finish/colour/material/form) to every other
   *  placed item sharing its defId. Returns how many items were restyled. */
  applyStyleToAll: (id: string) => number
  setItems: (items: FurnitureItem[]) => void
}

export const ITEMS_INITIAL: Pick<ItemsSlice, 'items'> = { items: [] }

export const createItemsSlice: SliceCreator<ItemsSlice, RootState> = (set, get) => ({
  ...ITEMS_INITIAL,
  addItem: (i) => {
    const id = newId()
    get().pushHistory()
    set((s) => {
      // Items placed inside an upper-storey room editor belong to that storey
      // (F13/ML5); explicit levelIds (duplicates/pastes of upper items) win.
      let levelId = i.levelId
      if (levelId === undefined && s.roomEditor.active && s.roomEditor.roomId) {
        const level = levelOfRoom(s.floorPlan, s.roomEditor.roomId)
        if (level && level.id !== GROUND_LEVEL_ID) levelId = level.id
      }
      return {
        items: [...s.items, { ...i, id, ...(levelId ? { levelId } : {}) }],
        selectedItemId: id,
        selectedItemIds: [id],
      }
    })
    // Record for the catalog's "Recent" row. Only real user placements,
    // duplicates and pastes reach addItem (the boot seed + set drops use
    // setItems), so this list stays meaningfully "recently used".
    get().pushRecent(i.defId)
    return id
  },
  // moveItem / rotateItem fire per-frame during drag and press-and-hold
  // nudge. History is pushed once at the start of those sessions
  // (Furniture.onPointerDown, App.tsx rotate-key, nudge first-keydown),
  // not on every micro-update.
  moveItem: (id, position) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, position } : it)),
    })),
  rotateItem: (id, rotation) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, rotation } : it)),
    })),
  deleteItem: (id) => {
    // Coalesced so a multi-select delete loop produces one undo step.
    get().pushHistoryCoalesced('delete')
    set((s) => {
      const ids = s.selectedItemIds.filter((x) => x !== id)
      const deleted = s.items.find((it) => it.id === id)
      // Auto-dissolve: if deleting this item leaves its group with a single
      // member, that lone member is no longer a group either.
      const dissolveGroup =
        deleted?.groupId != null &&
        s.items.filter((it) => it.groupId === deleted.groupId && it.id !== id).length < 2
          ? deleted.groupId
          : null
      return {
        items: s.items
          .filter((it) => it.id !== id)
          .map((it) =>
            dissolveGroup != null && it.groupId === dissolveGroup
              ? { ...it, groupId: undefined }
              : it,
          ),
        selectedItemId:
          s.selectedItemId === id
            ? ids.length > 0
              ? ids[ids.length - 1]
              : null
            : s.selectedItemId,
        selectedItemIds: ids,
        // Drop any stale hidden-id so the Layers "(N hidden)" count stays honest.
        ...(s.hiddenItemIds.includes(id)
          ? { hiddenItemIds: s.hiddenItemIds.filter((x) => x !== id) }
          : {}),
      }
    })
  },
  updateItemProps: (id, props) => {
    // Coalesce per (item, prop-set) so a slider drag collapses into a
    // single undo step rather than dozens.
    get().pushHistoryCoalesced(`prop:${id}:${Object.keys(props).sort().join(',')}`)
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, props: { ...it.props, ...props } } : it)),
    }))
  },
  // History is pushed by callers (Inspector button / F key) so a multi-select
  // flip collapses into a single undo step.
  flipItem: (id, axis) => {
    const key = axis === 'x' ? 'flipX' : 'flipZ'
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, [key]: !it[key] } : it)),
    }))
  },
  toggleLock: (id) => {
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, locked: !it.locked } : it)),
    }))
  },
  setAllLocked: (locked) => {
    get().pushHistory()
    set((s) => ({ items: s.items.map((it) => ({ ...it, locked })) }))
  },
  setItemsLocked: (ids, locked) => {
    const set_ = new Set(ids)
    get().pushHistory()
    set((s) => ({ items: s.items.map((it) => (set_.has(it.id) ? { ...it, locked } : it)) }))
  },
  renameItem: (id, label) => {
    const trimmed = label.trim()
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, label: trimmed ? trimmed : undefined } : it,
      ),
    }))
  },
  applyStyleToAll: (id) => {
    const src = get().items.find((it) => it.id === id)
    if (!src) return 0
    const targets = get().items.filter((it) => it.defId === src.defId && it.id !== id && !it.locked)
    if (targets.length === 0) return 0
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) =>
        it.defId === src.defId && it.id !== id && !it.locked
          ? { ...it, props: { ...src.props } }
          : it,
      ),
    }))
    return targets.length
  },
  setItems: (items) => set({ items }),
})
