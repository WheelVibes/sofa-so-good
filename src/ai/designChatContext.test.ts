import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem, FurnitureType } from '../furniture/types'
import { buildDesignChatContext } from './designChatContext'

// Deterministic 1 m × 1 m parametric box (mirrors analysis/designScore.test.ts's fixture).
const BOX: FurnitureDef = {
  kind: 'parametric',
  id: 'box' as never,
  name: 'Box',
  category: 'others',
  primitive: 'Bed' as never,
  defaultFootprint: { w: 1, d: 1, h: 1 },
  paramSchema: [],
}
const SOFA: FurnitureDef = { ...BOX, id: 'sofa' as never, name: 'Sofa', category: 'seating' }
const defs: Record<FurnitureType, FurnitureDef> = {
  box: BOX,
  sofa: SOFA,
} as Record<FurnitureType, FurnitureDef>

let seq = 0
function mk(defId: string, x: number, z: number): FurnitureItem {
  return {
    id: `i-${defId}-${seq++}`,
    defId: defId as never,
    position: [x, z],
    rotation: 0,
    props: {},
  }
}

/** A custom 10×6 plan with two 5×5 interior rooms and a window on each (matches
 *  `analysis/designScore.test.ts`'s fixture shape). */
function makePlan(): FloorPlan {
  const ext: FloorPlan['walls'][number]['thickness'] = 'external'
  return {
    id: 'custom-context-test',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [10, 6],
    walls: [
      { id: 'n', start: [0.1, 0.1], end: [9.9, 0.1], thickness: ext },
      { id: 'e', start: [9.9, 0.1], end: [9.9, 5.9], thickness: ext },
      { id: 's', start: [9.9, 5.9], end: [0.1, 5.9], thickness: ext },
      { id: 'w', start: [0.1, 5.9], end: [0.1, 0.1], thickness: ext },
    ],
    openings: [
      { id: 'win-a', kind: 'window', wallId: 'n', offset: 1, width: 2.5, sill: 0.9, head: 2.1 },
      { id: 'win-b', kind: 'window', wallId: 'n', offset: 6, width: 2.5, sill: 0.9, head: 2.1 },
    ],
    rooms: [
      { id: 'living', name: 'Living', origin: [0.2, 0.2], width: 4.6, depth: 5.4 },
      { id: 'bedroom', name: 'Bedroom', origin: [5.2, 0.2], width: 4.6, depth: 5.4 },
    ],
  }
}

const emptyPlan: FloorPlan = {
  id: 'blank',
  name: 'Blank',
  ceilingHeight: 2.6,
  extent: [1, 1],
  walls: [],
  openings: [],
  rooms: [],
}

describe('buildDesignChatContext', () => {
  it('summarizes rooms, items and the app-computed design score', () => {
    const plan = makePlan()
    const items = [mk('sofa', 1.5, 1.5), mk('box', 6, 1.5)]
    const ctx = buildDesignChatContext({ items, defs, plan })
    expect(ctx).toContain('Living')
    expect(ctx).toContain('Bedroom')
    expect(ctx).toContain('Sofa')
    expect(ctx).toContain('Box')
    expect(ctx).toContain('Design score:')
    expect(ctx).toContain('/100')
    expect(ctx).toContain('Clearance & fit')
    expect(ctx).toContain('NOT AVAILABLE')
  })

  it('honours an explicit room category over the name (RM1)', () => {
    const plan = makePlan()
    // Rename + set an explicit category: the label must follow the category.
    plan.rooms[0] = { ...plan.rooms[0]!, name: "Ella's room", category: 'bedroom' }
    const ctx = buildDesignChatContext({ items: [], defs, plan })
    expect(ctx).toContain("Ella's room (Bedroom)")
  })

  it('is deterministic for identical inputs', () => {
    const plan = makePlan()
    const items = [mk('sofa', 1.5, 1.5)]
    const a = buildDesignChatContext({ items, defs, plan })
    const b = buildDesignChatContext({ items, defs, plan })
    expect(a).toBe(b)
  })

  it('caps furniture listed per room and notes the remainder', () => {
    const plan = makePlan()
    const items = Array.from({ length: 12 }, (_, i) => mk('box', 0.5 + (i % 4) * 0.3, 0.5))
    const ctx = buildDesignChatContext({ items, defs, plan }, { maxItemsPerRoom: 3 })
    expect(ctx).toContain('…+9 more')
  })

  it('caps the number of rooms listed and notes the remainder', () => {
    const plan = makePlan()
    const ctx = buildDesignChatContext({ items: [], defs, plan }, { maxRooms: 1 })
    expect(ctx).toContain('…+1 more room(s) not listed.')
  })

  it('handles an empty/bare-shell plan without throwing', () => {
    const ctx = buildDesignChatContext({ items: [], defs, plan: emptyPlan })
    expect(ctx).toContain('Rooms: none')
    expect(ctx).toContain('0m² total, 0 room(s)')
  })

  it('falls back to the raw defId when a def cannot be resolved', () => {
    const plan = makePlan()
    const items = [mk('unknown-thing', 1, 1)]
    const ctx = buildDesignChatContext({ items, defs, plan })
    expect(ctx).toContain('unknown-thing')
  })
})
