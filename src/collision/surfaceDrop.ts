/**
 * PC2-SURFACE-DROP — surface-snap magnetism for decor.
 *
 * A "surface item" (a vase, lamp, bowl, books — anything that rests on a surface,
 * identified by carrying a numeric `surfaceHeight` prop) dropped over a table or
 * shelf should sit *on that surface's top*, not keep a stale rest height from a
 * different surface. This resolves the top height of the support surface under a
 * drop point so the drag-commit can update the item's `surfaceHeight` (which lifts
 * both parametric self-lift primitives and GLB models — see `Furniture.tsx`).
 *
 * Pure (no React/three beyond the shared footprint helper) so it unit-tests in
 * isolation. Returns `null` when nothing supportable is under the point — the
 * caller then leaves the height untouched (a drop onto open floor doesn't yank a
 * decor item's height around).
 */
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { itemFootprint } from './placement'

/** Categories whose items present a flat top you'd rest decor on. Soft seating /
 *  beds are deliberately excluded (you don't set a vase on a sofa cushion). */
const SUPPORT_CATEGORIES: ReadonlySet<string> = new Set(['tables', 'storage'])

/** True when world point (px,pz) falls inside item `it`'s footprint OBB. */
function containsPoint(it: FurnitureItem, def: FurnitureDef, px: number, pz: number): boolean {
  const obb = itemFootprint(it, def)
  const dx = px - obb.cx
  const dz = pz - obb.cz
  const cos = Math.cos(obb.rot)
  const sin = Math.sin(obb.rot)
  const lx = dx * cos + dz * sin
  const lz = -dx * sin + dz * cos
  return Math.abs(lx) <= obb.hx && Math.abs(lz) <= obb.hz
}

/** Top surface height (metres) of an item = its footprint height + any elevation. */
function topHeight(it: FurnitureItem, def: FurnitureDef): number {
  return def.defaultFootprint.h + (it.elevation ?? 0)
}

/**
 * Height of the highest support surface (table/shelf top) under the point, or
 * `null` if none. `excludeId` skips the dragged item itself.
 */
export function resolveSurfaceDropHeight(
  px: number,
  pz: number,
  items: readonly FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  excludeId?: string,
): number | null {
  let best: number | null = null
  for (const it of items) {
    if (it.id === excludeId) continue
    const def = defs[it.defId]
    if (!def || !SUPPORT_CATEGORIES.has(def.category)) continue
    if (!containsPoint(it, def, px, pz)) continue
    const top = topHeight(it, def)
    if (best === null || top > best) best = top
  }
  return best
}
