/**
 * Whole-home room rewrites in the intake/preset actions (F13).
 *
 * `applyLayoutPreset`, `applyOcsStarter` and `applyBareBto` each mapped only
 * `plan.rooms`, so on a maisonette they repainted the downstairs and left every
 * upstairs room on its old floor — a half-finished home with no indication that
 * anything had been skipped.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../floorplan/types'
import { LAYOUT_PRESETS } from '../../furniture/layoutPresets'
import { useStore } from '../store'

/** A two-storey CUSTOM plan (these paths only touch non-default plans). */
function twoStorey(): FloorPlan {
  return {
    id: 'custom-two-storey',
    name: 'Two storey',
    extent: [8, 6],
    ceilingHeight: 2.8,
    wallColor: '#ffffff',
    walls: [],
    openings: [],
    rooms: [
      { id: 'g-live', name: 'Living', origin: [0, 0], width: 6, depth: 5, floor: 'seed-floor' },
    ],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3,
        walls: [],
        openings: [],
        rooms: [
          {
            id: 'u-bed',
            name: 'Bedroom 2',
            origin: [0, 0],
            width: 4,
            depth: 3,
            floor: 'seed-floor',
          },
        ],
      },
    ],
  } as unknown as FloorPlan
}

const upperFloor = () => useStore.getState().floorPlan.upperLevels?.[0]?.rooms[0]?.floor
const groundFloorFinish = () => useStore.getState().floorPlan.rooms[0]?.floor

beforeEach(() => {
  useStore.setState({ floorPlan: twoStorey() })
})

describe('intake + preset actions rewrite EVERY storey', () => {
  it('applyLayoutPreset repaints an upstairs bedroom, not just the ground floor', () => {
    // Take a real id from the registry rather than hardcoding one — theme ids
    // are content and a stale literal makes the action a silent no-op, which
    // is exactly how this test first "passed" the wrong way.
    const preset = LAYOUT_PRESETS.find((p) => p.group === 'theme' && p.dryFloor)!
    expect(preset).toBeTruthy()
    useStore.getState().applyLayoutPreset(preset.id)
    // The assertion is deliberately "changed", not a specific material id: the
    // preset's dry floor is content that can legitimately change. What must
    // never happen is the ground floor changing while upstairs does not.
    expect(groundFloorFinish()).not.toBe('seed-floor')
    expect(upperFloor()).not.toBe('seed-floor')
    expect(upperFloor()).toBe(groundFloorFinish())
  })

  it('applyOcsStarter re-finishes an upstairs room', () => {
    useStore.getState().applyOcsStarter()
    expect(upperFloor()).not.toBe('seed-floor')
  })

  it('applyBareBto screeds an upstairs dry room', () => {
    useStore.getState().applyBareBto()
    expect(upperFloor()).not.toBe('seed-floor')
  })

  it('keeps each upper level own metadata through the rewrite', () => {
    useStore.getState().applyOcsStarter()
    const lvl = useStore.getState().floorPlan.upperLevels?.[0]
    expect(lvl?.id).toBe('upper')
    expect(lvl?.elevation).toBe(3)
  })
})
