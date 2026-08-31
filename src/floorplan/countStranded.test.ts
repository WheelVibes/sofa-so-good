import { describe, expect, it } from 'vitest'
import { countStrandedAfterRehome, rehomeStrandedItems } from './rehomeItems'
import type { FloorPlan } from './types'

/**
 * PLAN-SWAP-STRANDED (v0.31.5.90) — the count a confirm dialog quotes must agree
 * with what the re-home pass actually leaves behind.
 *
 * The distinction the whole item turns on: items the pass CAN move are not
 * stranded (it pulls them inside), so the number worth showing is the count of
 * SKIPPED items — wall-mounted / no-clip — that sit outside every room.
 */

/** A 4x4 m single-room plan at the origin. */
const plan = {
  id: 'p',
  name: 'test',
  rooms: [{ id: 'r', name: 'Room', origin: [0, 0], width: 4, depth: 4 }],
  walls: [],
} as unknown as FloorPlan

const at = (defId: string, x: number, z: number) => ({
  defId,
  position: [x, z] as [number, number],
})

/** Everything whose defId starts with `wall-` is anchored (the real predicate is
 *  `isAnchoredToNonFloor`; this keeps the test free of the catalog). */
const skip = (defId: string) => defId.startsWith('wall-')

describe('countStrandedAfterRehome', () => {
  it('counts an anchored item that sits outside every room', () => {
    expect(countStrandedAfterRehome(plan, [at('wall-art', 50, 50)], { skip })).toBe(1)
  })

  it('does NOT count a free-standing item outside a room — the pass moves it back', () => {
    // This is the crux: "outside now" is not "stranded after". A sofa in the void
    // gets clamped inside, so warning the user about it would be wrong.
    expect(countStrandedAfterRehome(plan, [at('sofa', 50, 50)], { skip })).toBe(0)
  })

  it('does not count anchored items that are already inside', () => {
    expect(countStrandedAfterRehome(plan, [at('wall-art', 2, 2)], { skip })).toBe(0)
  })

  it('counts only the anchored strays in a mixed set', () => {
    const items = [
      at('wall-art', 50, 50), // anchored + outside -> counts
      at('wall-sconce', 60, 60), // anchored + outside -> counts
      at('wall-art', 2, 2), // anchored but inside -> no
      at('sofa', 70, 70), // free-standing outside -> re-homed, no
      at('table', 1, 1), // inside -> no
    ]
    expect(countStrandedAfterRehome(plan, items, { skip })).toBe(2)
  })

  it('agrees with what the re-home pass actually leaves outside', () => {
    // The guarantee that makes the dialog honest: every item still outside a room
    // after the pass is exactly one the count predicted.
    const items = [at('wall-art', 50, 50), at('sofa', 50, 50), at('table', 1, 1)]
    const after = rehomeStrandedItems(plan, items, { skip })
    const stillOutside = after.filter(
      (i) => i.position[0] < 0 || i.position[0] > 4 || i.position[1] < 0 || i.position[1] > 4,
    )
    expect(stillOutside).toHaveLength(countStrandedAfterRehome(plan, items, { skip }))
    expect(stillOutside.map((i) => i.defId)).toEqual(['wall-art'])
  })

  it('is zero for an empty list and for a plan with no rooms', () => {
    expect(countStrandedAfterRehome(plan, [], { skip })).toBe(0)
    const noRooms = { ...plan, rooms: [] } as unknown as FloorPlan
    expect(countStrandedAfterRehome(noRooms, [at('wall-art', 50, 50)], { skip })).toBe(0)
  })
})
