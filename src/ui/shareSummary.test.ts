import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildShareSummary } from './shareSummary'

const catalog: Record<string, FurnitureDef> = {
  sofa: { id: 'sofa', name: 'Sofa', category: 'seating' } as FurnitureDef,
}
const item = (id: string): FurnitureItem => ({
  id,
  defId: 'sofa',
  position: [1, 1],
  rotation: 0,
  props: {},
})

const tinyPlan: FloorPlan = {
  id: 'p',
  name: 'Studio',
  ceilingHeight: 2.6,
  extent: [4, 3],
  walls: [],
  openings: [],
  rooms: [{ id: 'r', name: 'Room', origin: [0, 0], width: 4, depth: 3 }],
}

describe('buildShareSummary', () => {
  it('includes name, room/item counts (pluralised), area and est. cost', () => {
    const s = buildShareSummary(tinyPlan, [item('a'), item('b')], catalog, 'metric')
    expect(s.startsWith('Studio — 1 room · ')).toBe(true)
    expect(s).toContain('2 items')
    expect(s).toMatch(/~\$[\d,]+$/) // trailing estimated cost
  })

  it('singularises a single item and handles an empty design', () => {
    expect(buildShareSummary(tinyPlan, [item('a')], catalog, 'metric')).toContain('1 item ·')
    const empty = buildShareSummary(tinyPlan, [], catalog, 'metric')
    expect(empty).toContain('0 items')
    expect(empty).toContain('~$0')
  })

  it('works with the real default plan (multiple rooms)', () => {
    const s = buildShareSummary(buildDefaultPlan(), [], {}, 'metric')
    expect(s).toMatch(/^HDB 4-Room \(default\) — \d+ rooms · /)
  })
})
