import { type FloorPlan, roomPolygon } from '../../floorplan/types'
import { ROOMS } from '../constants'
import type { RoomId } from '../types'

/** One horizontal occluder plane spec, footprint-centred at ceiling height. */
export interface OccluderRect {
  id: string
  cx: number
  cz: number
  w: number
  d: number
  y: number
}

/**
 * Axis-aligned occluder rects — one per non-external plan room — sized to the
 * room's outline bounding box (rect + L-extension + explicit polygon) at its
 * resolved ceiling height. Mirrors `Ceiling.tsx`'s `!external` room selection:
 * external areas (balcony / service yard / AC ledge) are open to the sky and
 * never roofed. Pure (no three/React) so it stays unit-testable.
 *
 * The rect is the room's AABB, so an L-shaped room's concave notch is roofed
 * too — harmless when the notch belongs to an adjacent interior room (double
 * cover), and it only ever affects the sun shadow map (never visible geometry).
 * A plan room id absent from `ROOMS` (a custom-plan room) has no `external`
 * flag, so it falls through as interior and is roofed — the intended default.
 */
export function occluderRectsForPlan(plan: FloorPlan): OccluderRect[] {
  const out: OccluderRect[] = []
  for (const r of plan.rooms) {
    const def = ROOMS[r.id as RoomId]
    // External rooms are open to the sky (matches Ceiling.tsx's !external).
    if (def?.external) continue
    const poly = roomPolygon(r)
    let minX = Number.POSITIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    for (const [x, z] of poly) {
      if (x < minX) minX = x
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (z > maxZ) maxZ = z
    }
    if (!Number.isFinite(minX)) continue
    const y = r.ceilingHeight ?? def?.ceilingHeight ?? plan.ceilingHeight
    out.push({
      id: r.id,
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      w: maxX - minX,
      d: maxZ - minZ,
      y,
    })
  }
  return out
}
