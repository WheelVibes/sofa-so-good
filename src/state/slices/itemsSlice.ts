import { GROUND_LEVEL_ID, levelOfRoom } from '../../floorplan/levels'
import { buildMergedCatalog } from '../../furniture/catalog'
import { defaultParamProps, type FurnitureItem, type ParamProps } from '../../furniture/types'
import { gapFixVector } from '../../layout/gapFix'
import type { RootState } from '../store'
import { reorderByIds, type ZMove } from '../zorder'
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
  /** Widen a narrow walkway gap between two items (GAP-SUGGEST): split the minimal
   *  nudge to reach `requiredClearance` (default 0.9 m) across both, moving them
   *  apart along their centre-to-centre axis. One undo step. */
  nudgeGapApart: (aId: string, bId: string, currentGap: number, requiredClearance?: number) => void
  /** Set an item's tilt (pitch about local X, roll about local Z), in radians.
   *  Pass `undefined` for an axis to leave it unchanged; 0 clears that tilt.
   *  SweetHome3DJS multi-axis tilt parity (tiltFurniture flag). */
  tiltItem: (id: string, tilt: { pitch?: number; roll?: number }) => void
  /** Raise/lower an item off the floor (metres; 0 clears). SweetHome3DJS parity. */
  setItemElevation: (id: string, elevation: number) => void
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
  /** Replace a placed item's def with `newDefId`, keeping its id, position,
   *  rotation and level (PARITY-REPLACE: "replace with similar"). Def-specific
   *  `props` are reset to the new def's defaults (parametric) or dropped (GLB),
   *  since the old finish/dimension props don't carry across a different def.
   *  No-op (returns false) if the item or the new def is missing. One undo step. */
  replaceItemDef: (id: string, newDefId: string) => boolean
  /** Re-stack items in z-order (layer order = array order; later = on top).
   *  `front`/`back` jump to the top/bottom, `forward`/`backward` step one slot.
   *  Operates on the given ids as one block; one undo step; no-op if nothing
   *  would move. */
  reorderItems: (ids: string[], move: ZMove) => void
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
  nudgeGapApart: (aId, bId, currentGap, requiredClearance = 0.9) => {
    const items = get().items
    const a = items.find((i) => i.id === aId)
    const b = items.find((i) => i.id === bId)
    if (!a || !b) return
    const fix = gapFixVector(
      {
        a: aId,
        b: bId,
        gap: currentGap,
        severity: 'sub-ideal',
        wall: false,
        ax: a.position[0],
        az: a.position[1],
        bx: b.position[0],
        bz: b.position[1],
      },
      requiredClearance,
    )
    if (fix.distance <= 0) return
    // Split the widen across both items (half each) so neither travels far.
    const hx = fix.dx / 2
    const hz = fix.dz / 2
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) => {
        if (it.id === aId) return { ...it, position: [it.position[0] + hx, it.position[1] + hz] }
        if (it.id === bId) return { ...it, position: [it.position[0] - hx, it.position[1] - hz] }
        return it
      }),
    }))
  },
  // Coalesced like updateItemProps so a pitch/roll slider drag is one undo step.
  tiltItem: (id, tilt) => {
    get().pushHistoryCoalesced(`tilt:${id}`)
    set((s) => ({
      items: s.items.map((it) => {
        if (it.id !== id) return it
        const next = { ...it }
        if (tilt.pitch !== undefined) next.pitch = tilt.pitch || undefined
        if (tilt.roll !== undefined) next.roll = tilt.roll || undefined
        return next
      }),
    }))
  },
  setItemElevation: (id, elevation) => {
    get().pushHistoryCoalesced(`elev:${id}`)
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, elevation: elevation || undefined } : it,
      ),
    }))
  },
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
    const next = trimmed ? trimmed : undefined
    const cur = get().items.find((it) => it.id === id)
    if (!cur || cur.label === next) return
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, label: next } : it)),
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
  replaceItemDef: (id, newDefId) => {
    const s = get()
    const item = s.items.find((it) => it.id === id)
    if (!item || item.defId === newDefId) return false
    const catalog = buildMergedCatalog({
      userFurniture: s.userFurniture,
      resolvedRemoteFurniture: s.resolvedRemoteFurniture,
      packFurniture: s.packFurniture,
    })
    const newDef = catalog[newDefId]
    if (!newDef) return false
    // Reset def-specific props: parametric defs seed their defaults so the new
    // shape renders correctly; other kinds (GLB / IKEA) carry no transferable
    // props, so drop them.
    const props: ParamProps = newDef.kind === 'parametric' ? defaultParamProps(newDef) : {}
    get().pushHistory()
    set((st) => ({
      // Keep id / position / rotation / levelId / label / locked / groupId —
      // only the def + its props change.
      items: st.items.map((it) => (it.id === id ? { ...it, defId: newDefId, props } : it)),
    }))
    return true
  },
  reorderItems: (ids, move) => {
    if (ids.length === 0) return
    const next = reorderByIds(get().items, ids, move)
    // Skip the history push when the order is unchanged (e.g. already at front).
    const cur = get().items
    if (next.length === cur.length && next.every((it, i) => it === cur[i])) return
    get().pushHistory()
    set({ items: next })
  },
  setItems: (items) => set({ items }),
})
