import { describe, expect, it } from 'vitest'
import type { AiPlacement } from '../ai/autoLayoutAi'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import type { FurnitureDef } from '../furniture/types'
import { aiLayoutToItems } from './aiLayoutApply'

const room = (name: string, origin: [number, number], w: number, d: number): PlanRoom => ({
  id: name,
  name,
  origin,
  width: w,
  depth: d,
})
const plan = {
  id: 'p',
  name: 'P',
  ceilingHeight: 2.6,
  extent: [10, 10],
  walls: [],
  openings: [],
  rooms: [room('Living', [0, 0], 4, 3)],
} as unknown as FloorPlan

const catalog = { 'sofa-3seat': { id: 'sofa-3seat' } } as unknown as Record<string, FurnitureDef>
let n = 0
const genId = (p: string) => `${p}-${n++}`

describe('aiLayoutToItems', () => {
  it('drops placements with an unknown room or def', () => {
    n = 0
    const placements: AiPlacement[] = [
      { defId: 'sofa-3seat', room: 'Garage', x: 1, z: 1, rotation: 0 },
      { defId: 'unknown', room: 'Living', x: 1, z: 1, rotation: 0 },
      { defId: 'sofa-3seat', room: 'Living', x: 2, z: 1.5, rotation: 1.5 },
    ]
    const items = aiLayoutToItems(placements, plan, catalog, genId)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ defId: 'sofa-3seat', position: [2, 1.5], rotation: 1.5 })
  })

  it('clamps the position into the room interior (with inset)', () => {
    n = 0
    // Way outside the 4×3 Living room at origin [0,0] → clamped to [3.7, 2.7].
    const items = aiLayoutToItems(
      [{ defId: 'sofa-3seat', room: 'Living', x: 99, z: 99, rotation: 0 }],
      plan,
      catalog,
      genId,
    )
    expect(items[0].position[0]).toBeCloseTo(3.7)
    expect(items[0].position[1]).toBeCloseTo(2.7)
  })

  it('gives each item a fresh id', () => {
    n = 0
    const items = aiLayoutToItems(
      [
        { defId: 'sofa-3seat', room: 'Living', x: 1, z: 1, rotation: 0 },
        { defId: 'sofa-3seat', room: 'Living', x: 2, z: 2, rotation: 0 },
      ],
      plan,
      catalog,
      genId,
    )
    expect(new Set(items.map((i) => i.id)).size).toBe(2)
  })
})
