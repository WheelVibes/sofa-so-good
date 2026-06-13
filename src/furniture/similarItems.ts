import type { FurnitureDef } from './types'

/**
 * Replace-with-similar core (PARITY-REPLACE).
 *
 * Pure, render-agnostic ranking of catalog alternatives for a placed item: given
 * the `defId` of the item the user wants to swap, return the ids of catalog defs
 * that are (a) the SAME `FurnitureCategory` and (b) not the def itself, ordered
 * by how closely their real footprint (W×D) matches — so the nearest-size
 * replacement comes first, which keeps the layout's clearances roughly intact.
 *
 * Footprint comes from the def's `defaultFootprint` (the same source placement
 * collision falls back to): for a parametric def this is its default size, for a
 * GLB / IKEA def it's the bbox footprint seeded at import. We compare on the
 * *unordered* dimension pair (the larger of W/D vs the smaller), so a piece
 * rotated 90° from another still reads as the same footprint. Ties (equal
 * footprint distance) break by name (locale-insensitive, case-insensitive) and
 * finally by id, so the order is stable.
 *
 * Edge cases: unknown `defId` → `[]`; a category with no other members → `[]`.
 * Works uniformly across parametric, GLB and IKEA defs.
 */
export function similarItems(
  defId: string,
  catalog: Record<string, FurnitureDef>,
  limit?: number,
): string[] {
  const target = catalog[defId]
  if (!target) return []

  const ranked = Object.values(catalog)
    .filter((d) => d.id !== target.id && d.category === target.category)
    .map((d) => ({ id: d.id, name: d.name, dist: footprintDistance(target, d) }))
    .sort(
      (a, b) =>
        a.dist - b.dist ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((r) => r.id)

  return limit != null && limit >= 0 ? ranked.slice(0, limit) : ranked
}

/**
 * Squared Euclidean distance between two defs' footprints, comparing the
 * *sorted* (long, short) dimensions so orientation doesn't matter. Squared is
 * fine for ranking (monotonic) and avoids a sqrt per candidate.
 */
function footprintDistance(a: FurnitureDef, b: FurnitureDef): number {
  const [aLong, aShort] = sortedDims(a)
  const [bLong, bShort] = sortedDims(b)
  const dl = aLong - bLong
  const ds = aShort - bShort
  return dl * dl + ds * ds
}

/** A def's footprint as [longer, shorter] metres (orientation-independent). */
function sortedDims(def: FurnitureDef): [number, number] {
  const { w, d } = def.defaultFootprint
  return w >= d ? [w, d] : [d, w]
}
