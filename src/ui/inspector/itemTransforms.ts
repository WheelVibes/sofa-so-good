import { canPlace } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { pointInRoom } from '../../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { rotationFacingRoom } from '../../layout/faceWall'
import { useStore } from '../../state/store'

type Catalog = Record<string, FurnitureDef>

/**
 * Pure item-transform actions shared by the inspector's Transform fields and its
 * quick-action buttons (rotate / flip / face-room / centre / duplicate). Each
 * re-reads the item fresh from the store (never trusts a stale closure prop),
 * collision-checks via `canPlace`, and commits through a single `pushHistory` +
 * store-action pair. Extracted out of `InspectorPanel.tsx` verbatim (REFAC-1) —
 * pure logic, no behaviour change.
 */

/** Flip the item across the given local axis (left↔right / front↔back). */
export function flipItemAxis(itemId: string, axis: 'x' | 'z') {
  const st = useStore.getState()
  st.pushHistory()
  st.flipItem(itemId, axis)
}

/** Rotate the item 90° (collision-checked); no-op if the new orientation is blocked. */
export function rotate90Item(itemId: string, def: FurnitureDef, catalog: Catalog) {
  const st = useStore.getState()
  const it = st.items.find((i) => i.id === itemId)
  if (!it) return
  const next = it.rotation + Math.PI / 2
  if (
    canPlace({ ...it, rotation: next }, def, {
      others: st.items,
      defs: catalog,
      doors: st.doors,
      walls: placementWalls(st),
    })
  ) {
    st.pushHistory()
    st.rotateItem(it.id, next)
  }
}

/** Move the item to [x, z] (collision-checked); no-op if blocked or non-finite. */
export function tryMoveItem(
  itemId: string,
  def: FurnitureDef,
  catalog: Catalog,
  x: number,
  z: number,
) {
  const st = useStore.getState()
  const it = st.items.find((i) => i.id === itemId)
  if (!it || Number.isNaN(x) || Number.isNaN(z)) return
  if (
    canPlace({ ...it, position: [x, z] }, def, {
      others: st.items,
      defs: catalog,
      doors: st.doors,
      walls: placementWalls(st),
    })
  ) {
    st.pushHistory()
    st.moveItem(it.id, [x, z])
  }
}

/** Set the item's rotation in degrees (collision-checked); no-op if blocked. */
export function trySetRotItem(itemId: string, def: FurnitureDef, catalog: Catalog, deg: number) {
  const st = useStore.getState()
  const it = st.items.find((i) => i.id === itemId)
  if (!it || Number.isNaN(deg)) return
  const rot = (deg * Math.PI) / 180
  if (
    canPlace({ ...it, rotation: rot }, def, {
      others: st.items,
      defs: catalog,
      doors: st.doors,
      walls: placementWalls(st),
    })
  ) {
    st.pushHistory()
    st.rotateItem(it.id, rot)
  }
}

/** Orient the item so its back is to the nearest wall (front faces the room) —
 *  one-click correct orientation for beds/sofas/desks. Collision-checked via
 *  `trySetRotItem`. */
export function faceItemIntoRoom(itemId: string, def: FurnitureDef, catalog: Catalog) {
  const st = useStore.getState()
  const it = st.items.find((i) => i.id === itemId)
  if (!it) return
  const room = st.floorPlan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
  if (!room) return
  const rect = {
    minX: room.origin[0],
    minZ: room.origin[1],
    maxX: room.origin[0] + room.width,
    maxZ: room.origin[1] + room.depth,
  }
  trySetRotItem(itemId, def, catalog, (rotationFacingRoom(it.position, rect) * 180) / Math.PI)
}

/** Move the item to the centre of the room it's in (collision-checked) — handy
 *  for centring a rug, coffee table or pendant. */
export function centreItemInRoom(itemId: string, def: FurnitureDef, catalog: Catalog) {
  const st = useStore.getState()
  const it = st.items.find((i) => i.id === itemId)
  if (!it) return
  const room = st.floorPlan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
  if (!room) return
  tryMoveItem(
    itemId,
    def,
    catalog,
    room.origin[0] + room.width / 2,
    room.origin[1] + room.depth / 2,
  )
}

/** Place a duplicate of `item` at the nearest free ring position (collision-checked). */
export function duplicateItemNearby(item: FurnitureItem, def: FurnitureDef, catalog: Catalog) {
  const st = useStore.getState()
  const STEP = 0.3
  for (let ring = 1; ring <= 8; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
        const pos: [number, number] = [item.position[0] + dx * STEP, item.position[1] + dz * STEP]
        const probe = {
          id: 'dup-probe',
          defId: item.defId,
          position: pos,
          rotation: item.rotation,
          props: item.props,
        }
        if (
          canPlace(probe, def, {
            others: st.items,
            defs: catalog,
            doors: st.doors,
            walls: placementWalls(st),
          })
        ) {
          st.addItem({
            defId: item.defId,
            position: pos,
            rotation: item.rotation,
            props: { ...item.props },
          })
          return
        }
      }
    }
  }
}

/**
 * Delete a placed item behind a confirmation prompt (bug report #2). A single
 * delete used to fire immediately (with an Undo toast), but users asked for an
 * explicit confirm — and a clear one, distinct from the transform "Apply
 * change?" pill. Locked items never delete. Reused by the inspector's Delete
 * button and the minimized-header trash icon (so a mobile bottom-sheet user can
 * delete without expanding the panel). The Undo toast still fires as a backstop.
 */
export async function confirmDeleteItem(itemId: string, name?: string): Promise<void> {
  const st = useStore.getState()
  const item = st.items.find((i) => i.id === itemId)
  if (!item || item.locked) return
  const ok = await st.confirmAction({
    title: 'Delete item?',
    message: `Remove ${name ?? 'this item'} from the design? You can still undo this.`,
    confirmLabel: 'Delete',
    danger: true,
  })
  if (ok) useStore.getState().deleteItem(itemId)
}
