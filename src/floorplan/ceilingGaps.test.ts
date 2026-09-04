import { describe, expect, it } from 'vitest'
import { ceilingGapArea, ceilingGapRects } from './ceilingGaps'
import { PLAN_TEMPLATES } from './templates'
import type { FloorPlan } from './types'

const byId = (id: string) => PLAN_TEMPLATES.find((t) => t.id === id) as FloorPlan

describe('ceilingGapRects', () => {
  it('covers the slit the raycast found, and nothing where a room already is', () => {
    // `v0.31.7.231`: a ray up from (2.0, 3.0) in `tpl-hdb-4room` leaves the scene, because
    // `h4-svc-s`'s south face is at z = 2.95 and `h4-bed2` starts at z = 3.2.
    const rects = ceilingGapRects(byId('tpl-hdb-4room'))
    const covers = (x: number, z: number) =>
      rects.some((r) => x >= r.x && x <= r.x + r.width && z >= r.z && z <= r.z + r.depth)
    expect(covers(2.0, 3.0)).toBe(true)
    // The 4.9 m2 unassigned block, x 5.8-8.9 z 0.5-2.4.
    expect(covers(7.75, 1.3)).toBe(true)
    // Inside rooms it must NOT cover, or it would double up on their ceilings: the living room
    // and bedroom 2 centres, both confirmed by raycast to have a ceiling at y = 2.6 already.
    expect(covers(7.4, 5.0)).toBe(false)
    expect(covers(1.5, 4.5)).toBe(false)
  })

  it('emits a handful of rects, not a cell per grid square', () => {
    // Each rect becomes a MESH, so the merge is load-bearing rather than cosmetic: unmerged, the
    // 4-room's 21.4 m² of gap would be over two thousand 0.1 m cells.
    //
    // Measured across all 19 templates: 531 rects total, 8 (`tpl-studio`) to 60
    // (`tpl-condo-penthouse`), mean 28. That is the per-plan mesh cost of this fix, against
    // ~1072 visible meshes in a furnished flat.
    for (const id of ['tpl-hdb-4room', 'tpl-hdb-jumbo', 'tpl-condo-penthouse']) {
      const rects = ceilingGapRects(byId(id))
      expect(rects.length, `${id} emitted ${rects.length} rects`).toBeLessThanOrEqual(70)
      expect(rects.length).toBeGreaterThan(0)
    }
  })

  it('rects never overlap a room, on any template', () => {
    // The invariant that keeps this from z-fighting a real ceiling. Sampled at the centre of
    // every rect on every template rather than on one plan.
    for (const t of PLAN_TEMPLATES) {
      for (const r of ceilingGapRects(t)) {
        const cx = r.x + r.width / 2
        const cz = r.z + r.depth / 2
        const inRoom = (t.rooms ?? []).some((room) => {
          const [rx, rz] = room.origin
          return cx >= rx && cx <= rx + room.width && cz >= rz && cz <= rz + room.depth
        })
        expect(inRoom, `${t.id} rect at ${cx},${cz} sits inside a room`).toBe(false)
      }
    }
  })

  it('area is dominated by the templates ceilingHole.test.ts flags worst', () => {
    // Cross-check against the independent measure. This module counts wall footprints too (a
    // ceiling over a wall is hidden and covering it removes a class of margin error), so its
    // area is LARGER than the walkable figure — the ordering is what must agree.
    const jumbo = ceilingGapArea(byId('tpl-hdb-jumbo'))
    const loft = ceilingGapArea(byId('tpl-loft'))
    // Was 45 before the feat/blender-render merge: staging's enclosure walls (SHELTER-ENCLOSURE
    // `v0.31.8.63` and the bathroom partitions) roofed part of the jumbo's open strip, taking its
    // gap area to 37.2 m2. The point of this assertion is the RANKING — the jumbo still dominates
    // the loft by more than 5x, which is what the next line checks.
    expect(jumbo).toBeGreaterThan(30)
    expect(loft).toBeLessThan(jumbo / 5)
  })

  it('returns nothing for a degenerate extent instead of throwing', () => {
    expect(ceilingGapRects({ ...byId('tpl-studio'), extent: [0, 0] } as FloorPlan)).toEqual([])
  })
})
