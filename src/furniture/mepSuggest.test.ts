import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { deriveElectricalPoints, derivePlumbingPoints } from './mepSuggest'
import type { FurnitureDef, FurnitureItem } from './types'

/** Minimal fixture-def helper (mirrors `appearanceProps.test.ts`'s `paramDef`) —
 *  `deriveElectricalPoints`/`derivePlumbingPoints` only read `id`/`category`. */
function def(id: string, category: FurnitureDef['category'] = 'others'): FurnitureDef {
  return {
    kind: 'parametric',
    id: id as FurnitureDef['id'],
    name: id,
    category,
    defaultFootprint: { w: 1, d: 1, h: 1 },
    primitive: 'Sofa' as never,
    paramSchema: [],
  } as unknown as FurnitureDef
}

function item(defId: string, x: number, z: number, levelId?: string): FurnitureItem {
  return {
    id: `item-${defId}-${x}-${z}`,
    defId: defId as FurnitureItem['defId'],
    position: [x, z],
    rotation: 0,
    props: {},
    ...(levelId ? { levelId } : {}),
  }
}

function plan(walls: FloorPlan['walls'] = [], openings: FloorPlan['openings'] = []): FloorPlan {
  return {
    id: 'p',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [4, 4],
    walls,
    openings,
    rooms: [],
  }
}

describe('mepSuggest — deriveElectricalPoints', () => {
  it('a desk suggests a double socket + a data point 0.25m over', () => {
    const catalog = { desk: def('desk', 'tables') }
    const pts = deriveElectricalPoints(plan(), [item('desk', 1, 1)], catalog)
    expect(pts).toContainEqual({ x: 1, z: 1, kind: 'socket-double' })
    expect(pts).toContainEqual({ x: 1.25, z: 1, kind: 'data' })
  })

  it('a door suggests a light switch just past the leaf, on the wall', () => {
    const wall = {
      id: 'w1',
      start: [0, 0] as [number, number],
      end: [4, 0] as [number, number],
      thickness: 'internal' as const,
    }
    const door = {
      id: 'd1',
      wallId: 'w1',
      kind: 'door' as const,
      offset: 1,
      width: 0.8,
      sill: 0,
      head: 2.1,
    }
    const pts = deriveElectricalPoints(plan([wall], [door]), [], {})
    // at = offset + width + 0.15 = 1.95 along the wall's +X unit vector.
    expect(pts).toContainEqual({ x: 1.95, z: 0, kind: 'switch' })
  })

  it('tags a point with its item/door level (upper storeys)', () => {
    const catalog = { desk: def('desk', 'tables') }
    const pts = deriveElectricalPoints(plan(), [item('desk', 1, 1, 'up')], catalog)
    expect(pts.every((p) => p.levelId === 'up')).toBe(true)
  })
})

describe('mepSuggest — derivePlumbingPoints', () => {
  it('a WC/toilet suggests a soil pipe + a cistern water point', () => {
    const catalog = { toilet: def('toilet', 'bathroom') }
    const pts = derivePlumbingPoints([item('toilet', 2, 2)], catalog)
    expect(pts).toContainEqual({ x: 2, z: 2, kind: 'soil-pipe' })
    expect(pts).toContainEqual({ x: 2.2, z: 2, kind: 'water-point' })
  })

  it('gives a washing machine a 1150 mm bib tap — not the generic 600 mm', () => {
    // YARD-FITTINGS: at the default height the tap resolves onto the wall BEHIND an 850 mm
    // machine and renders inside it. Every OTHER fixture keeps the per-kind default.
    const catalog = { 'washing-machine': def('washing-machine', 'others') }
    const pts = derivePlumbingPoints([item('washing-machine', 3, 4)], catalog)
    expect(pts).toContainEqual({ x: 3, z: 4, kind: 'water-point', mountHeightMm: 1150 })
    expect(pts).toContainEqual({ x: 3.2, z: 4, kind: 'floor-trap' })
  })

  it('leaves every other fixture on the per-kind default height', () => {
    const catalog = {
      sink: def('sink', 'kitchen'),
      shower: def('shower', 'bathroom'),
      toilet: def('toilet', 'bathroom'),
    }
    const pts = derivePlumbingPoints(
      [item('sink', 1, 1), item('shower', 2, 2), item('toilet', 3, 3)],
      catalog,
    )
    expect(pts.every((p) => p.mountHeightMm === undefined)).toBe(true)
  })

  it('tags a plumbing point with its item level', () => {
    const catalog = { toilet: def('toilet', 'bathroom') }
    const pts = derivePlumbingPoints([item('toilet', 2, 2, 'up')], catalog)
    expect(pts.every((p) => p.levelId === 'up')).toBe(true)
  })
})
