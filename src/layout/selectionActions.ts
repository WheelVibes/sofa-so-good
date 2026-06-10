/**
 * Store-level multi-selection layout actions, shared by the inspector's
 * multi-select panel and the command palette so neither owns the logic. Each
 * reads fresh state via `useStore.getState()`, pushes one undo step, and
 * collision-checks every move before committing. The catalog is passed in (the
 * caller has it from `useCatalog()` — these run outside React).
 */
import { canPlace, itemFootprint } from '../collision/placement'
import { placementWalls } from '../collision/placementWalls'
import { pointInRoom } from '../floorplan/types'
import type { FurnitureDef } from '../furniture/types'
import { useStore } from '../state/store'
import { obbAxisHalf } from './alignDistribute'
import { arrangeRun, type RunItem } from './arrangeRun'
import { flushToWall, nearestWallEdge, rotationFacingRoom } from './faceWall'
import { mirrorItemX } from './mirrorRoom'

type Catalog = Record<string, FurnitureDef>

function selectedUnlocked() {
  const s = useStore.getState()
  return s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
}

function roomRectAt(cx: number, cz: number) {
  const s = useStore.getState()
  const room = s.floorPlan.rooms.find((r) => pointInRoom(r, cx, cz))
  if (!room) return null
  return {
    minX: room.origin[0],
    minZ: room.origin[1],
    maxX: room.origin[0] + room.width,
    maxZ: room.origin[1] + room.depth,
  }
}

/** Turn each selected piece's back to its nearest room wall (orient only). */
export function faceSelectionIntoRoom(catalog: Catalog): void {
  const s = useStore.getState()
  const sel = selectedUnlocked()
  if (sel.length === 0) return
  s.pushHistory()
  for (const it of sel) {
    const def = catalog[it.defId]
    const rect = roomRectAt(it.position[0], it.position[1])
    if (!def || !rect) continue
    const rot = rotationFacingRoom(it.position, rect)
    if (
      canPlace({ ...it, rotation: rot }, def, {
        others: s.items.filter((o) => o.id !== it.id),
        defs: catalog,
        doors: s.doors,
        walls: placementWalls(s),
      })
    )
      s.rotateItem(it.id, rot)
  }
}

/** Push each selected piece flush against its nearest wall + orient to it. */
export function snapSelectionToWall(catalog: Catalog): void {
  const s = useStore.getState()
  const sel = selectedUnlocked()
  if (sel.length === 0) return
  s.pushHistory()
  for (const it of sel) {
    const def = catalog[it.defId]
    const rect = roomRectAt(it.position[0], it.position[1])
    if (!def || !rect) continue
    const edge = nearestWallEdge(it.position, rect)
    const rot = rotationFacingRoom(it.position, rect)
    const obb = itemFootprint({ ...it, rotation: rot }, def)
    const halfX = obbAxisHalf(obb.hx, obb.hz, rot, 0)
    const halfZ = obbAxisHalf(obb.hx, obb.hz, rot, 1)
    const pos = flushToWall(it.position, rect, edge, halfX, halfZ)
    if (
      canPlace({ ...it, rotation: rot, position: pos }, def, {
        others: s.items.filter((o) => o.id !== it.id),
        defs: catalog,
        doors: s.doors,
        walls: placementWalls(s),
      })
    ) {
      s.rotateItem(it.id, rot)
      s.moveItem(it.id, pos)
    }
  }
}

/**
 * Mirror the selection left↔right across its own centre line: each piece's X
 * reflects, its heading negates and its geometry flips, so an asymmetric layout
 * (an L-sofa + chaise) reads as its mirror image. Per-piece collision-checked.
 */
export function mirrorSelectionX(catalog: Catalog): void {
  const s = useStore.getState()
  const sel = selectedUnlocked()
  if (sel.length === 0) return
  const cx = sel.reduce((a, i) => a + i.position[0], 0) / sel.length
  const selIds = new Set(sel.map((i) => i.id))
  const others = s.items.filter((o) => !selIds.has(o.id))
  // A mirror is a rigid reflection of the whole group, so intra-group spacing is
  // preserved — only a wall / outside-piece clash can spoil it. Compute every
  // mirrored placement and commit ALL-OR-NOTHING, so a piece that would clip a
  // wall on the far side never leaves the layout half-mirrored + overlapping.
  const planned = sel.map((it) => ({ it, m: mirrorItemX(it, cx), def: catalog[it.defId] }))
  const allFit = planned.every(
    ({ m, def }) =>
      def && canPlace(m, def, { others, defs: catalog, doors: s.doors, walls: placementWalls(s) }),
  )
  if (!allFit) return
  s.pushHistory()
  for (const { it, m } of planned) {
    s.moveItem(it.id, m.position)
    s.rotateItem(it.id, m.rotation)
    if (m.flipX !== it.flipX) s.flipItem(it.id, 'x')
  }
}

/** Line the selection up as one run, butted edge-to-edge along the nearest wall. */
export function arrangeSelectionAsRun(catalog: Catalog): void {
  const s = useStore.getState()
  const sel = selectedUnlocked()
  if (sel.length < 2) return
  const cx = sel.reduce((a, i) => a + i.position[0], 0) / sel.length
  const cz = sel.reduce((a, i) => a + i.position[1], 0) / sel.length
  const room = s.floorPlan.rooms.find((r) => pointInRoom(r, cx, cz)) ?? s.floorPlan.rooms[0]
  if (!room) return
  const rect = {
    minX: room.origin[0],
    minZ: room.origin[1],
    maxX: room.origin[0] + room.width,
    maxZ: room.origin[1] + room.depth,
  }
  const edge = nearestWallEdge([cx, cz], rect)
  const runItems: RunItem[] = sel.flatMap((it) => {
    const def = catalog[it.defId]
    if (!def) return []
    const ob = itemFootprint(it, def)
    return [{ id: it.id, w: ob.hx * 2, d: ob.hz * 2, pos: it.position }]
  })
  const placements = arrangeRun(runItems, edge, rect)
  s.pushHistory()
  const selIds = new Set(sel.map((i) => i.id))
  for (const p of placements) {
    const it = sel.find((i) => i.id === p.id)
    const def = it && catalog[it.defId]
    if (!it || !def) continue
    if (
      canPlace({ ...it, rotation: p.rotation, position: p.position }, def, {
        others: s.items.filter((o) => !selIds.has(o.id)),
        defs: catalog,
        doors: s.doors,
        walls: placementWalls(s),
      })
    ) {
      s.rotateItem(it.id, p.rotation)
      s.moveItem(it.id, p.position)
    }
  }
}
