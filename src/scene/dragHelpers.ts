/**
 * Pure geometry/snapping helpers extracted from `DragController` so they can be
 * unit-tested in isolation (the controller itself is an R3F component that's hard
 * to test). No React, no three scene state — just maths over furniture footprints
 * + collision walls. Behaviour is identical to the inline versions they replaced.
 */
import type { AabbItem } from '../collision/broadphase'
import type { WallFaceInput } from '../collision/equalSpacing'
import { itemFootprint } from '../collision/placement'
import type { CollisionWall } from '../collision/walls'
import { isIkeaDef } from '../furniture/catalog'
import { resolveCompatible } from '../furniture/ikea/compatibility'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

/** Alignment snap threshold (m) — how close a dragged edge/centre must be to snap. */
export const ALIGN_TH = 0.1

/** Collision walls → axis-aligned face descriptors for equal-spacing detection. */
export function wallFaces(walls: CollisionWall[]): WallFaceInput[] {
  const faces: WallFaceInput[] = []
  for (const w of walls) {
    const t = w.thickness / 2
    if (Math.abs(w.ax - w.bx) < 0.02) {
      faces.push({
        orient: 'v',
        face: w.ax, // inner face approximated at the wall centreline ± thickness handled by caller spacing
        spanMin: Math.min(w.az, w.bz),
        spanMax: Math.max(w.az, w.bz),
      })
      // Two faces (both sides) so a piece spaced off either side is caught.
      faces.push({
        orient: 'v',
        face: w.ax + t,
        spanMin: Math.min(w.az, w.bz),
        spanMax: Math.max(w.az, w.bz),
      })
      faces.push({
        orient: 'v',
        face: w.ax - t,
        spanMin: Math.min(w.az, w.bz),
        spanMax: Math.max(w.az, w.bz),
      })
    } else if (Math.abs(w.az - w.bz) < 0.02) {
      faces.push({
        orient: 'h',
        face: w.az,
        spanMin: Math.min(w.ax, w.bx),
        spanMax: Math.max(w.ax, w.bx),
      })
      faces.push({
        orient: 'h',
        face: w.az + t,
        spanMin: Math.min(w.ax, w.bx),
        spanMax: Math.max(w.ax, w.bx),
      })
      faces.push({
        orient: 'h',
        face: w.az - t,
        spanMin: Math.min(w.ax, w.bx),
        spanMax: Math.max(w.ax, w.bx),
      })
    }
  }
  return faces
}

/** Axis-aligned half-extents [hx, hz] of an item's footprint at its rotation. */
export function halfExtents(
  item: { rotation: number; props: Record<string, unknown> },
  def: FurnitureDef,
): [number, number] {
  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {}
    const wv = item.props[map.w ?? 'width']
    const dv = item.props[map.d ?? 'depth']
    if (typeof wv === 'number') w = wv
    if (typeof dv === 'number') d = dv
  }
  const c = Math.abs(Math.cos(item.rotation))
  const s = Math.abs(Math.sin(item.rotation))
  return [(c * w + s * d) / 2, (s * w + c * d) / 2]
}

/**
 * Footprint AABBs of every item NOT moving during the current drag (PERF-003
 * broadphase). Static items keep their position for the whole pointer drag, so
 * their grid is built once and queried per move. Defless items are skipped (they
 * never collide / never host a snug-stack), matching the canPlace neighbour scan.
 */
export function staticAabbs(
  items: readonly FurnitureItem[],
  movedSet: ReadonlySet<string>,
  catalog: Record<string, FurnitureDef>,
): { aabbs: AabbItem[]; staticItems: FurnitureItem[] } {
  const aabbs: AabbItem[] = []
  const staticItems: FurnitureItem[] = []
  for (const it of items) {
    if (movedSet.has(it.id)) continue
    const def = catalog[it.defId]
    if (!def) continue
    const [hx, hz] = halfExtents(it, def)
    aabbs.push({
      id: it.id,
      minX: it.position[0] - hx,
      maxX: it.position[0] + hx,
      minZ: it.position[1] - hz,
      maxZ: it.position[1] + hz,
    })
    staticItems.push(it)
  }
  return { aabbs, staticItems }
}

/** Best 1-D snap of a dragged centre (half-extent `dh`) to others' centres and
 *  edges — centre-align, edge-align, or butt-adjacent. Returns the snapped
 *  centre + the guide-line coordinate, or null if nothing's within threshold. */
export function snapAxis(
  center: number,
  dh: number,
  others: Array<{ c: number; h: number }>,
): { center: number; guide: number } | null {
  let best: { center: number; guide: number; d: number } | null = null
  for (const o of others) {
    const cands: Array<{ center: number; guide: number }> = [
      { center: o.c, guide: o.c }, // centres aligned
      { center: o.c - o.h + dh, guide: o.c - o.h }, // near edges aligned
      { center: o.c + o.h - dh, guide: o.c + o.h }, // far edges aligned
      { center: o.c - o.h - dh, guide: o.c - o.h }, // butt against o's near side
      { center: o.c + o.h + dh, guide: o.c + o.h }, // butt against o's far side
    ]
    for (const cand of cands) {
      const d = Math.abs(cand.center - center)
      if (d < ALIGN_TH && (!best || d < best.d)) best = { ...cand, d }
    }
  }
  return best
}

/** True when world point (px,pz) falls inside item `it`'s footprint OBB. */
export function pointInFootprint(
  px: number,
  pz: number,
  it: FurnitureItem,
  def: FurnitureDef,
): boolean {
  const obb = itemFootprint(it, def)
  const dx = px - obb.cx
  const dz = pz - obb.cz
  const cos = Math.cos(obb.rot)
  const sin = Math.sin(obb.rot)
  // Rotate the offset into the OBB's local (axis-aligned) frame.
  const lx = dx * cos + dz * sin
  const lz = -dx * sin + dz * cos
  return Math.abs(lx) <= obb.hx && Math.abs(lz) <= obb.hz
}

/** Snug-stack candidate: the dragged item is the TOP, the hovered item the
 *  BASE — engages only when the base IKEA def accepts the dragged IKEA def's
 *  category (a confirmed compatibility match). Returns the base item or null. */
export function snapBase(
  draggedDef: FurnitureDef | undefined,
  hoveredItem: FurnitureItem | null,
  hoveredDef: FurnitureDef | undefined,
): FurnitureItem | null {
  if (!hoveredItem || !draggedDef || !hoveredDef) return null
  if (!isIkeaDef(draggedDef) || !isIkeaDef(hoveredDef)) return null
  const matches = resolveCompatible(hoveredDef, [draggedDef])
  const any = Object.values(matches).some((list) => list.length > 0)
  return any ? hoveredItem : null
}
