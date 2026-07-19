import { describe, expect, it } from 'vitest'
import {
  buildCeilingClearance,
  CORNICE_MIN_M,
  MIN_FINISHED_CLEARANCE_M,
  STANDARD_SLAB_M,
} from './ceilingClearance'
import type { CeilingConfig, FloorPlan, PlanRoom } from './types'

function room(id: string, ceiling?: CeilingConfig, ceilingHeight?: number): PlanRoom {
  return { id, name: id, origin: [0, 0], width: 4, depth: 4, ceiling, ceilingHeight }
}

function plan(rooms: PlanRoom[], extra: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: 'p',
    name: 'Test',
    ceilingHeight: STANDARD_SLAB_M,
    extent: [4, 4],
    walls: [],
    openings: [],
    rooms,
    ...extra,
  }
}

describe('buildCeilingClearance', () => {
  it('warns when a dropped ceiling leaves under 2.4 m finished clearance', () => {
    // 2.6 m slab, 0.35 m drop → 2.25 m finished = 2250 mm < 2400 mm.
    const res = buildCeilingClearance(plan([room('Living', { style: 'dropped', drop: 0.35 })]))
    expect(res.zones).toHaveLength(1)
    const z = res.zones[0]
    expect(z.style).toBe('dropped')
    expect(z.clearanceMm).toBe(2250)
    expect(z.dropMm).toBe(350)
    expect(z.pass).toBe(false)
    expect(z.belowCornice).toBe(false)
    expect(res.warnCount).toBe(1)
    expect(res.allPass).toBe(false)
  })

  it('passes when a treatment leaves at least 2.4 m clearance', () => {
    // 2.6 m slab, 0.15 m tray drop → 2.45 m = 2450 mm ≥ 2400 mm.
    const res = buildCeilingClearance(plan([room('Living', { style: 'tray', drop: 0.15 })]))
    expect(res.zones).toHaveLength(1)
    expect(res.zones[0].clearanceMm).toBe(2450)
    expect(res.zones[0].pass).toBe(true)
    expect(res.zones[0].belowCornice).toBe(false)
    expect(res.warnCount).toBe(0)
    expect(res.allPass).toBe(true)
  })

  it('flags below-cornice when clearance drops under ~2.1 m', () => {
    // 2.3 m room ceiling, drop clamped to 0.3 m → 2.0 m = 2000 mm < 2100 mm.
    const res = buildCeilingClearance(plan([room('Study', { style: 'dropped', drop: 0.3 }, 2.3)]))
    expect(res.zones).toHaveLength(1)
    expect(res.zones[0].clearanceMm).toBe(2000)
    expect(res.zones[0].pass).toBe(false)
    expect(res.zones[0].belowCornice).toBe(true)
    expect(res.warnCount).toBe(1)
  })

  it('skips flat and untreated rooms', () => {
    const res = buildCeilingClearance(
      plan([room('Flat', { style: 'flat' }), room('None', undefined)]),
    )
    expect(res.zones).toHaveLength(0)
    expect(res.allPass).toBe(true)
    expect(res.warnCount).toBe(0)
  })

  it('never NaNs on an empty plan', () => {
    const res = buildCeilingClearance(plan([]))
    expect(res.zones).toEqual([])
    expect(res.warnCount).toBe(0)
    expect(res.allPass).toBe(true)
    expect(Number.isNaN(res.thresholds.minFinishedClearanceMm)).toBe(false)
    expect(res.thresholds.minFinishedClearanceMm).toBe(MIN_FINISHED_CLEARANCE_M * 1000)
    expect(res.thresholds.corniceMinMm).toBe(CORNICE_MIN_M * 1000)
    expect(res.thresholds.standardSlabMm).toBe(STANDARD_SLAB_M * 1000)
  })

  it('checks rooms across all storeys (multi-level)', () => {
    const upstairs: PlanRoom = {
      id: 'Loft',
      name: 'Loft',
      origin: [0, 0],
      width: 4,
      depth: 4,
      ceiling: { style: 'dropped', drop: 0.35 },
    }
    const res = buildCeilingClearance(
      plan([room('Living', { style: 'tray', drop: 0.15 })], {
        upperLevels: [
          {
            id: 'L1',
            name: 'Upper',
            elevation: 3,
            walls: [],
            openings: [],
            rooms: [upstairs],
          },
        ],
      }),
    )
    expect(res.zones.map((z) => z.roomId).sort()).toEqual(['Living', 'Loft'])
    // The upstairs dropped ceiling warns; the ground tray passes.
    expect(res.warnCount).toBe(1)
    expect(res.zones.find((z) => z.roomId === 'Loft')?.pass).toBe(false)
  })
})
