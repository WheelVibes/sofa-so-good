import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanUpperLevel } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildStairAdvisories, isStaircaseItem, STAIRCASE_DEF_ID } from './stairConnectivity'

/** Minimal parametric staircase def (mirrors the builtin catalog entry). */
const STAIR_DEF = {
  kind: 'parametric',
  id: STAIRCASE_DEF_ID,
  name: 'Staircase',
  category: 'others',
  primitive: 'Staircase',
  defaultFootprint: { w: 0.9, d: 3.4, h: 2.2 },
  paramSchema: [],
} as unknown as FurnitureDef

const SOFA_DEF = {
  kind: 'parametric',
  id: 'sofa',
  name: 'Sofa',
  category: 'seating',
  primitive: 'Sofa',
  defaultFootprint: { w: 2, d: 0.9, h: 0.8 },
  paramSchema: [],
} as unknown as FurnitureDef

const getDef = (id: string) =>
  id === STAIRCASE_DEF_ID ? STAIR_DEF : id === 'sofa' ? SOFA_DEF : undefined

function item(defId: string, position: [number, number], levelId?: string): FurnitureItem {
  return {
    id: `it-${defId}-${position.join(',')}`,
    defId,
    position,
    rotation: 0,
    props: {},
    ...(levelId ? { levelId } : {}),
  } as unknown as FurnitureItem
}

/** Two-storey fixture: ground stair hall at x 4–6 / z 2–6, landing stacked
 *  above it; living elsewhere on both floors. */
function twoStorey(upperOverrides?: Partial<PlanUpperLevel>): FloorPlan {
  return {
    id: 'p1',
    name: 'Two storey',
    ceilingHeight: 2.6,
    extent: [10, 8],
    walls: [],
    openings: [],
    rooms: [
      { id: 'g-liv', name: 'Living', origin: [0, 0], width: 4, depth: 8 },
      { id: 'g-stair', name: 'Stair Hall', origin: [4, 2], width: 2, depth: 4 },
    ],
    upperLevels: [
      {
        id: 'up',
        name: 'Upper storey',
        elevation: 2.9,
        walls: [],
        openings: [],
        rooms: [
          { id: 'u-bed', name: 'Bedroom', origin: [0, 0], width: 4, depth: 8 },
          { id: 'u-landing', name: 'Stair Landing', origin: [4, 2], width: 2, depth: 4 },
        ],
        ...upperOverrides,
      },
    ],
  }
}

describe('isStaircaseItem', () => {
  it('matches the staircase family by def id and by primitive', () => {
    expect(isStaircaseItem({ defId: STAIRCASE_DEF_ID }, undefined)).toBe(true)
    expect(isStaircaseItem({ defId: 'my-custom-stair' }, STAIR_DEF)).toBe(true)
    expect(isStaircaseItem({ defId: 'sofa' }, SOFA_DEF)).toBe(false)
  })
})

describe('buildStairAdvisories', () => {
  it('produces nothing for single-level plans (with or without stairs)', () => {
    const plan: FloorPlan = { ...twoStorey(), upperLevels: undefined }
    expect(buildStairAdvisories(plan, [], getDef)).toEqual([])
    expect(buildStairAdvisories(plan, [item(STAIRCASE_DEF_ID, [5, 4])], getDef)).toEqual([])
  })

  it('flags an upper storey with no staircase at all', () => {
    const out = buildStairAdvisories(twoStorey(), [item('sofa', [2, 4])], getDef)
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('stair-unreachable:up')
    expect(out[0]!.severity).toBe('caution')
    expect(out[0]!.title).toContain('Upper storey')
  })

  it('is satisfied by a ground staircase landing under the upper landing', () => {
    // Stair centred in the stair hall (4–6 × 2–6): footprint 0.9×3.4 fits, and
    // the landing above shares the footprint.
    const out = buildStairAdvisories(twoStorey(), [item(STAIRCASE_DEF_ID, [5, 4])], getDef)
    expect(out).toEqual([])
  })

  it('flags a staircase that misses the upper storey footprint', () => {
    // Upper storey only covers x 0–4; the stair stands in the hall at x 4–6.
    const plan = twoStorey({
      rooms: [{ id: 'u-bed', name: 'Bedroom', origin: [0, 0], width: 4, depth: 8 }],
    })
    const out = buildStairAdvisories(plan, [item(STAIRCASE_DEF_ID, [5, 4])], getDef)
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('stair-unreachable:up')
  })

  it('flags when the only staircase stands on the wrong storey', () => {
    // A stair ON the upper level can't connect ground → upper.
    const out = buildStairAdvisories(twoStorey(), [item(STAIRCASE_DEF_ID, [5, 4], 'up')], getDef)
    expect(out).toHaveLength(1)
  })

  it('checks each storey pair independently (three storeys)', () => {
    const plan = twoStorey()
    plan.upperLevels = [
      ...plan.upperLevels!,
      {
        id: 'up2',
        name: 'Second storey',
        elevation: 5.8,
        walls: [],
        openings: [],
        rooms: [{ id: 'u2-bed', name: 'Bedroom', origin: [4, 2], width: 2, depth: 4 }],
      },
    ]
    // One stair connects ground → up; nothing reaches up2.
    const out = buildStairAdvisories(plan, [item(STAIRCASE_DEF_ID, [5, 4])], getDef)
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('stair-unreachable:up2')
    // Adding a stair on 'up' under u2-bed clears it.
    const out2 = buildStairAdvisories(
      plan,
      [item(STAIRCASE_DEF_ID, [5, 4]), item(STAIRCASE_DEF_ID, [5, 4], 'up')],
      getDef,
    )
    expect(out2).toEqual([])
  })
})
