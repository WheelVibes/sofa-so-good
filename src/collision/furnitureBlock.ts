/**
 * Walk-mode furniture collision: build the set of "blocking" furniture footprints
 * (the pieces a person can't walk through) and push a walker circle out of any it
 * penetrates. Pure + unit-tested (no three / no GPU) so the walk loop can call it
 * each frame against a prebuilt box list.
 *
 * Blocking rule: skip wall/ceiling-mounted (`mounted`) and pass-through (`noClip`,
 * e.g. rugs) items, and skip anything whose top is at/under shin height
 * (`MIN_BLOCK_TOP`) so you can step over a rug or a very low platform but not
 * through a sofa, table, bed or wardrobe. Blocking is storey-scoped (F13/ML6c):
 * only items on the walker's current level (`levelId`, default ground) block —
 * an upstairs bed must not block the hallway under it, and vice versa.
 */
import { GROUND_LEVEL_ID } from '../floorplan/levels'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import type { OBB } from './obb'
import { itemFootprint } from './placement'

/** Furniture whose top is at/below this height (m) doesn't block walking. */
export const MIN_BLOCK_TOP = 0.3

/** Footprint OBBs of the items that should block a walker (mounted / no-clip /
 *  shin-height-or-lower items excluded). `getDef` resolves a def by id;
 *  `levelId` is the storey the walker stands on (ground when omitted). */
export function buildWalkBlockers(
  items: FurnitureItem[],
  getDef: (id: string) => FurnitureDef | undefined,
  levelId: string = GROUND_LEVEL_ID,
): OBB[] {
  const out: OBB[] = []
  for (const it of items) {
    // Storey-scoped: only the walker's current level's items block (ML6c).
    if ((it.levelId ?? GROUND_LEVEL_ID) !== levelId) continue
    const def = getDef(it.defId)
    if (!def || def.mounted || def.noClip) continue
    const top = def.verticalSpan?.top ?? def.defaultFootprint.h
    if (top <= MIN_BLOCK_TOP) continue
    out.push(itemFootprint(it, def))
  }
  return out
}

/**
 * Push a walker circle (centre `x,z`, `radius`) out of any OBB it overlaps.
 * Two passes so a walker wedged between two pieces settles. Mirrors the
 * wall solver's "slide, don't stick" feel: the walker is moved to the nearest
 * non-penetrating point per box rather than reverting the whole move.
 */
export function resolveCircleVsObbs(
  x: number,
  z: number,
  radius: number,
  boxes: OBB[],
): [number, number] {
  let px = x
  let pz = z
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const cos = Math.cos(b.rot)
      const sin = Math.sin(b.rot)
      const dx = px - b.cx
      const dz = pz - b.cz
      // Walker centre in the box's local (axis-aligned) frame.
      const lx = dx * cos + dz * sin
      const lz = -dx * sin + dz * cos
      const inside = Math.abs(lx) < b.hx && Math.abs(lz) < b.hz
      if (inside) {
        // Centre is within the footprint — eject along the nearest face.
        const overX = b.hx - Math.abs(lx)
        const overZ = b.hz - Math.abs(lz)
        let tlx = lx
        let tlz = lz
        if (overX < overZ) tlx = (lx < 0 ? -1 : 1) * (b.hx + radius)
        else tlz = (lz < 0 ? -1 : 1) * (b.hz + radius)
        px = b.cx + tlx * cos - tlz * sin
        pz = b.cz + tlx * sin + tlz * cos
        continue
      }
      // Closest point on the box (clamp the local coords to the half-extents).
      const clx = Math.max(-b.hx, Math.min(b.hx, lx))
      const clz = Math.max(-b.hz, Math.min(b.hz, lz))
      const cwx = b.cx + clx * cos - clz * sin
      const cwz = b.cz + clx * sin + clz * cos
      const ex = px - cwx
      const ez = pz - cwz
      const d2 = ex * ex + ez * ez
      if (d2 < radius * radius && d2 > 1e-9) {
        const d = Math.sqrt(d2)
        px = cwx + (ex / d) * radius
        pz = cwz + (ez / d) * radius
      }
    }
  }
  return [px, pz]
}
