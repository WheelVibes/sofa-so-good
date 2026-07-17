import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { DEFAULT_FLOOR, DEFAULT_WALL } from './builtinCatalog'
import { resolveSampledFinish, type SampleFinishMaps } from './sampleFinish'

const room = (over: Partial<PlanRoom> = {}): PlanRoom => ({
  id: 'living',
  name: 'Living',
  origin: [0, 0],
  width: 4,
  depth: 3,
  ...over,
})

const planWith = (rooms: PlanRoom[]): FloorPlan => ({
  id: 'p1',
  name: 'Test plan',
  ceilingHeight: 2.6,
  extent: [10, 10],
  walls: [],
  openings: [],
  rooms,
})

const maps = (over: Partial<SampleFinishMaps> = {}): SampleFinishMaps => ({
  floor: {},
  walls: {},
  wallAccents: {},
  ...over,
})

describe('resolveSampledFinish — floor', () => {
  it('prefers the live slice pick over the plan room default', () => {
    const plan = planWith([room({ floor: 'floor-wood-oak' })])
    expect(
      resolveSampledFinish(
        { kind: 'floor', roomId: 'living' },
        maps({ floor: { living: 'floor-tile-grey' } }),
        plan,
      ),
    ).toEqual({ finishId: 'floor-tile-grey', surface: 'floor' })
  })

  it('falls back to the plan room floor default', () => {
    const plan = planWith([room({ floor: 'floor-wood-walnut' })])
    expect(resolveSampledFinish({ kind: 'floor', roomId: 'living' }, maps(), plan)).toEqual({
      finishId: 'floor-wood-walnut',
      surface: 'floor',
    })
  })

  it('falls back to the app default floor when nothing is set', () => {
    const plan = planWith([room()])
    expect(resolveSampledFinish({ kind: 'floor', roomId: 'living' }, maps(), plan)).toEqual({
      finishId: DEFAULT_FLOOR,
      surface: 'floor',
    })
  })

  it('resolves a room absent from the plan via the slice map / default', () => {
    const plan = planWith([])
    expect(
      resolveSampledFinish(
        { kind: 'floor', roomId: 'ghost' },
        maps({ floor: { ghost: 'floor-terrazzo' } }),
        plan,
      ),
    ).toEqual({ finishId: 'floor-terrazzo', surface: 'floor' })
    expect(resolveSampledFinish({ kind: 'floor', roomId: 'ghost' }, maps(), plan)).toEqual({
      finishId: DEFAULT_FLOOR,
      surface: 'floor',
    })
  })
})

describe('resolveSampledFinish — wall', () => {
  it('prefers the live slice pick over the plan room default', () => {
    const plan = planWith([room({ wall: 'wall-paint-white' })])
    expect(
      resolveSampledFinish(
        { kind: 'wall', roomId: 'living' },
        maps({ walls: { living: 'wall-paint-sage' } }),
        plan,
      ),
    ).toEqual({ finishId: 'wall-paint-sage', surface: 'wall' })
  })

  it('falls back to the plan room wall, then the app default wall (never null)', () => {
    expect(
      resolveSampledFinish(
        { kind: 'wall', roomId: 'living' },
        maps(),
        planWith([room({ wall: 'wall-paint-warm' })]),
      ),
    ).toEqual({ finishId: 'wall-paint-warm', surface: 'wall' })
    // No pick anywhere → the neutral plaster shell default, so the sample is
    // always applicable (unlike resolvePlanRoomWall which returns null here).
    expect(
      resolveSampledFinish({ kind: 'wall', roomId: 'living' }, maps(), planWith([room()])),
    ).toEqual({ finishId: DEFAULT_WALL, surface: 'wall' })
  })

  it('an accent override for the clicked wall face wins over the room wall', () => {
    const plan = planWith([room({ wall: 'wall-paint-white' })])
    expect(
      resolveSampledFinish(
        { kind: 'wall', roomId: 'living', wallId: 'w3' },
        maps({ walls: { living: 'wall-paint-sage' }, wallAccents: { 'w3:living': '#223344' } }),
        plan,
      ),
    ).toEqual({ finishId: '#223344', surface: 'wall' })
  })

  it('without a wallId, an accent on a different face does not apply', () => {
    const plan = planWith([room()])
    expect(
      resolveSampledFinish(
        { kind: 'wall', roomId: 'living' },
        maps({ walls: { living: 'wall-paint-sage' }, wallAccents: { 'w3:living': '#223344' } }),
        plan,
      ),
    ).toEqual({ finishId: 'wall-paint-sage', surface: 'wall' })
  })
})

describe('resolveSampledFinish — guards', () => {
  it('returns null for an empty roomId', () => {
    expect(resolveSampledFinish({ kind: 'floor', roomId: '' }, maps(), planWith([]))).toBeNull()
    expect(resolveSampledFinish({ kind: 'wall', roomId: '' }, maps(), planWith([]))).toBeNull()
  })
})
