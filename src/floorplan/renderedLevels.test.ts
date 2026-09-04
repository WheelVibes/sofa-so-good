import { describe, expect, it } from 'vitest'
import { planLevels, renderedLevels, visibleLevels } from './levels'
import { PLAN_TEMPLATES } from './templates'
import type { FloorPlan } from './types'

const loft = () => PLAN_TEMPLATES.find((t) => t.id === 'tpl-loft') as FloorPlan
const single = () => PLAN_TEMPLATES.find((t) => t.id === 'tpl-hdb-4room') as FloorPlan

describe('renderedLevels', () => {
  it('matches visibleLevels everywhere except first person', () => {
    const p = loft()
    for (const id of ['all', ...planLevels(p).map((l) => l.id)])
      expect(renderedLevels(p, id, false).map((l) => l.id)).toEqual(
        visibleLevels(p, id).map((l) => l.id),
      )
  })

  it('adds the storey immediately below the walked one', () => {
    const p = loft()
    const [ground, upper] = planLevels(p)
    expect(upper).toBeDefined()
    // This is the defect: walking the mezzanine used to hide the floor under it.
    expect(visibleLevels(p, (upper as { id: string }).id).map((l) => l.id)).toEqual([
      (upper as { id: string }).id,
    ])
    expect(renderedLevels(p, (upper as { id: string }).id, true).map((l) => l.id)).toEqual([
      (ground as { id: string }).id,
      (upper as { id: string }).id,
    ])
  })

  it('adds only ONE storey, not every storey below', () => {
    // Bounded by design: an overlook sees the floor beneath it, and the weak-device
    // tier should not pay for storeys nobody can see.
    const p = loft()
    const top = planLevels(p).at(-1) as { id: string }
    expect(renderedLevels(p, top.id, true).length).toBeLessThanOrEqual(2)
  })

  it('never renders more than the default "all" view, on any plan or storey', () => {
    // The cost bound for the weak-device tier, and the reason this needed no new
    // benchmark: `viewLevelId` DEFAULTS to 'all', so every user already pays for
    // every storey in orbit. Walking a storey can now cost the same, never more.
    // The (g) write-up measured `tpl-loft` at 126 meshes / 49191 tris for 'all'
    // versus 103 / 41406 for one isolated storey; walking its mezzanine now
    // renders the same set as 'all'.
    for (const t of PLAN_TEMPLATES) {
      const p = t as FloorPlan
      const all = visibleLevels(p, 'all').length
      for (const l of planLevels(p))
        expect(renderedLevels(p, l.id, true).length).toBeLessThanOrEqual(all)
    }
  })

  it('changes nothing for the ground floor, "all", or a single-storey plan', () => {
    const p = loft()
    const ground = planLevels(p)[0] as { id: string }
    expect(renderedLevels(p, ground.id, true).map((l) => l.id)).toEqual([ground.id])
    expect(renderedLevels(p, 'all', true).map((l) => l.id)).toEqual(planLevels(p).map((l) => l.id))
    const s = single()
    expect(renderedLevels(s, planLevels(s)[0]?.id ?? 'ground', true)).toHaveLength(1)
  })
})
