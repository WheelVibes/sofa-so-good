/**
 * The five above/below mis-attributions found by a sweep my EARLIER sweeps
 * could not see (F13).
 *
 * `.294`/`.295` grepped `plan.rooms.find(` and `floorPlan.rooms.find(`. Every
 * site here reads a LOCAL `rooms` variable — `const rooms = allPlanRooms(plan)`
 * — so the pattern matched none of them. dev-09's formulation is the lesson: a
 * regex over source is a SAMPLE, not an enumeration, and its coverage is
 * invisible in the result.
 *
 * All five combine every storey's rooms with a bare `pointInRoom`, which
 * returns whichever room sits at that XZ on ANY floor. Two of the five are
 * modules I wrote, and `coordinationClashes`'s helper carried a comment reading
 * "across every storey" — an assertion that looked deliberate and was wrong.
 */
import { describe, expect, it } from 'vitest'
import { roomAtPoint } from '../floorplan/levels'
import type { FloorPlan } from '../floorplan/types'

/** Ground `g-live` and upper `u-bed` occupy the SAME footprint. */
function stacked(): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [6, 5],
    ceilingHeight: 2.6,
    walls: [],
    openings: [],
    rooms: [{ id: 'g-live', name: 'Living', origin: [0, 0], width: 6, depth: 5 }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3,
        walls: [],
        openings: [],
        rooms: [{ id: 'u-bed', name: 'Bedroom', origin: [0, 0], width: 6, depth: 5 }],
      },
    ],
  } as unknown as FloorPlan
}

describe('roomAtPoint — the level-tagged counterpart of roomAtItem', () => {
  it('resolves a point to the room on ITS OWN storey', () => {
    expect(roomAtPoint(stacked(), 1, 1, 'upper')?.id).toBe('u-bed')
    expect(roomAtPoint(stacked(), 1, 1, 'ground')?.id).toBe('g-live')
  })

  it('treats an untagged point as ground', () => {
    expect(roomAtPoint(stacked(), 1, 1)?.id).toBe('g-live')
  })

  it('returns null outside every room on that storey', () => {
    expect(roomAtPoint(stacked(), 50, 50, 'upper')).toBeNull()
  })

  it('degrades an unknown level id to ground rather than throwing', () => {
    // `levelById`'s documented behaviour — an unknown id must not vanish the
    // geometry, which would silently drop every finding for that point.
    expect(roomAtPoint(stacked(), 1, 1, 'nope')?.id).toBe('g-live')
  })
})

describe('layoutCritique pairs items on the SAME storey', () => {
  it('does not measure TV viewing distance across two floors', async () => {
    const { buildLayoutCritique } = await import('./layoutCritique')
    const { BUILTIN_CATALOG } = await import('../furniture/builtinCatalog')
    const item = (id: string, defId: string, levelId?: string) =>
      ({
        id,
        defId,
        position: [3, 2.5],
        rotation: 0,
        props: {},
        ...(levelId ? { levelId } : {}),
      }) as never

    // The discriminator is the FINDING's presence, not its wording: when the
    // seating filter matches nothing on the TV's storey the loop `continue`s
    // and pushes no `tv-distance` row at all. An earlier version of this test
    // grepped the detail text for "seating" — which the copy says as "seat" —
    // and scored 0 in both arms, i.e. it could not have failed.
    const tvDistance = (items: never[]) =>
      buildLayoutCritique(stacked(), items, BUILTIN_CATALOG).findings.filter(
        (f) => f.id === 'tv-distance' && f.verdict !== 'skipped',
      )

    // A TV downstairs and a sofa UPSTAIRS at the same XZ: nothing to measure.
    expect(tvDistance([item('tv', 'tv-wall'), item('sofa', 'sofa-3seat', 'upper')])).toEqual([])
    // The same pair on ONE storey: measured.
    expect(tvDistance([item('tv', 'tv-wall'), item('sofa', 'sofa-3seat')]).length).toBeGreaterThan(
      0,
    )
  })
})
