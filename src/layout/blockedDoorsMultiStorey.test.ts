/**
 * `blockedDoorItems` per storey (F13).
 *
 * Five callers pass the WHOLE plan and the WHOLE item list — `ui/report`,
 * `ClearancePanel`, `ToolsMenu`, `analysis/designScore`, `scene/ClearanceOverlay`
 * — and this probed ground-only openings against every item. Wrong both ways,
 * and the false positive is the worse half: a red overlay and a design-score
 * penalty on a piece that is one floor away from the door it "blocks".
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { blockedDoorItems } from './clearance'

/**
 * Both storeys share a wall line, but their doors are at DIFFERENT offsets
 * (ground at 2 m, upper at 4 m).
 *
 * The first version of this fixture put them at the same offset, reasoning that
 * it made a ground-only probe indistinguishable from a correct one. It did the
 * opposite: ground probes then covered the upstairs item too, so four of the six
 * tests passed with the fix stashed. Measured, not assumed — only the
 * false-positive test discriminated. Distinct offsets mean an upstairs item in
 * front of the UPPER door is out of reach of every ground probe.
 */
function maisonette(): FloorPlan {
  const wall = (id: string) => ({
    id,
    start: [0, 2] as [number, number],
    end: [6, 2] as [number, number],
    thickness: 'internal' as const,
  })
  const door = (id: string, wallId: string, offset: number) => ({
    id,
    wallId,
    kind: 'door' as const,
    offset,
    width: 0.9,
    sill: 0,
    head: 2.1,
  })
  return {
    id: 'p',
    name: 'p',
    extent: [6, 4],
    ceilingHeight: 2.6,
    walls: [wall('g-w')],
    openings: [door('g-d', 'g-w', 2)],
    rooms: [{ id: 'g-r', name: 'G', origin: [0, 0], width: 6, depth: 4 }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3,
        walls: [wall('u-w')],
        openings: [door('u-d', 'u-w', 4)],
        rooms: [{ id: 'u-r', name: 'U', origin: [0, 0], width: 6, depth: 4 }],
      },
    ],
  } as unknown as FloorPlan
}

const DEFS: Record<string, FurnitureDef> = {
  chest: {
    id: 'chest',
    name: 'Chest',
    category: 'storage',
    kind: 'primitive',
    defaultFootprint: { w: 1.2, d: 0.6, h: 0.8 },
  } as unknown as FurnitureDef,
}

/** Squarely in a doorway. `x` is the door's centre: 2.45 ground, 4.45 upper. */
const inDoorway = (id: string, x: number, levelId?: string): FurnitureItem =>
  ({
    id,
    defId: 'chest',
    position: [x, 2],
    rotation: 0,
    props: {},
    ...(levelId ? { levelId } : {}),
  }) as unknown as FurnitureItem

const GROUND_DOOR_X = 2.45
const UPPER_DOOR_X = 4.45

describe('blockedDoorItems — per storey', () => {
  it('flags an UPSTAIRS item blocking an UPSTAIRS door', () => {
    // Ground-only openings meant an upstairs door was never checked.
    // At the UPPER door's x, which no ground probe reaches.
    expect(blockedDoorItems([inDoorway('u1', UPPER_DOOR_X, 'upper')], DEFS, maisonette())).toEqual([
      'u1',
    ])
  })

  it('flags a ground item blocking a ground door', () => {
    expect(blockedDoorItems([inDoorway('g1', GROUND_DOOR_X)], DEFS, maisonette())).toEqual(['g1'])
  })

  it('does NOT flag an upstairs item against a GROUND-only door', () => {
    // The false positive, and the worse half: with only a ground door present,
    // an upstairs piece above that doorway is not blocking anything.
    const groundDoorOnly = {
      ...maisonette(),
      upperLevels: [
        {
          id: 'upper',
          name: 'Upper',
          elevation: 3,
          walls: [],
          openings: [],
          rooms: [{ id: 'u-r', name: 'U', origin: [0, 0], width: 6, depth: 4 }],
        },
      ],
    } as unknown as FloorPlan
    expect(
      blockedDoorItems([inDoorway('u1', GROUND_DOOR_X, 'upper')], DEFS, groundDoorOnly),
    ).toEqual([])
  })

  it('does NOT flag a ground item against an UPSTAIRS-only door', () => {
    const upstairsDoorOnly = { ...maisonette(), openings: [] } as unknown as FloorPlan
    expect(blockedDoorItems([inDoorway('g1', UPPER_DOOR_X)], DEFS, upstairsDoorOnly)).toEqual([])
  })

  it('flags both when both storeys are blocked, once each', () => {
    const out = blockedDoorItems(
      [inDoorway('g1', GROUND_DOOR_X), inDoorway('u1', UPPER_DOOR_X, 'upper')],
      DEFS,
      maisonette(),
    )
    expect(out.sort()).toEqual(['g1', 'u1'])
  })

  it('is unchanged for a single-storey plan', () => {
    const single = { ...maisonette(), upperLevels: [] } as unknown as FloorPlan
    expect(blockedDoorItems([inDoorway('g1', GROUND_DOOR_X)], DEFS, single)).toEqual(['g1'])
    // An item clear of the doorway is still clear.
    const clear = {
      ...inDoorway('g2', GROUND_DOOR_X),
      position: [5.5, 3.5],
    } as unknown as FurnitureItem
    expect(blockedDoorItems([clear], DEFS, single)).toEqual([])
  })
})
