import { describe, expect, it } from 'vitest'
import { WALLS } from '../apartment/constants'
import { buildDefaultPlan } from './defaultPlan'

describe('buildDefaultPlan', () => {
  it('copies each wall spec structural classification onto the plan wall', () => {
    const plan = buildDefaultPlan()
    const byId = new Map(plan.walls.map((w) => [w.id, w]))
    for (const spec of WALLS) {
      expect(byId.get(spec.id)?.structure, spec.id).toBe(spec.structure)
    }
  })

  it('seeds the household-shelter ring as load-bearing (never hackable)', () => {
    const plan = buildDefaultPlan()
    const hs = plan.walls.filter((w) =>
      ['wall-int-hs-N', 'wall-int-hs-S', 'wall-int-bath2-hs', 'wall-int-shelter-LD'].includes(w.id),
    )
    expect(hs).toHaveLength(4)
    for (const w of hs) expect(w.structure, w.id).toBe('load-bearing')
  })

  it('keeps the household-shelter blast door inside its (split) host wall', () => {
    const plan = buildDefaultPlan()
    const door = plan.openings.find((o) => o.id === 'door-householdShelter')!
    const wall = plan.walls.find((w) => w.id === door.wallId)!
    const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    expect(door.offset).toBeGreaterThanOrEqual(0)
    expect(door.offset + door.width).toBeLessThanOrEqual(len)
  })
})
