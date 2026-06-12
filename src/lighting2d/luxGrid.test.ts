import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import type { PlanLight } from './lightingPlan'
import {
  buildLuxGrids,
  buildRoomLuxGrid,
  DAYLIGHT_NEAR_WINDOW_LUX,
  LUX_GRID_MAX_DIM,
  MASKED,
  planWindowSources,
  pointIlluminance,
  type RoomLuxGrid,
  windowIlluminance,
} from './luxGrid'
import { estimateRoomLux, SCENE_INTENSITY_CALIBRATION } from './roomLux'

const room = (id: string, name: string, w: number, d: number, ox = 0, oz = 0): PlanRoom => ({
  id,
  name,
  origin: [ox, oz],
  width: w,
  depth: d,
})

const light = (x: number, z: number, intensity = 9, height = 2.05): PlanLight => ({
  id: `l-${x}-${z}`,
  type: 'ceiling-light',
  label: 'Ceiling light',
  x,
  z,
  height,
  intensity,
  distance: 6.5,
  color: '#fff0d4',
})

const makePlan = (rooms: PlanRoom[], extra: Partial<FloorPlan> = {}): FloorPlan => ({
  id: 'p',
  name: 'P',
  ceilingHeight: 2.6,
  extent: [10, 10],
  walls: [],
  openings: [],
  rooms,
  ...extra,
})

/** Lux at a grid cell centred nearest a world point. */
function luxAt(grid: RoomLuxGrid, x: number, z: number): number {
  const ix = Math.min(grid.cols - 1, Math.max(0, Math.floor((x - grid.x0) / grid.cell)))
  const iz = Math.min(grid.rows - 1, Math.max(0, Math.floor((z - grid.z0) / grid.cell)))
  return grid.values[iz * grid.cols + ix]!
}

describe('pointIlluminance', () => {
  it('uses the calibrated candela with inverse-square + cosine incidence', () => {
    // Directly under the bulb: E = I_cal / h².
    const l = light(0, 0, 9, 2)
    const expected = (9 * SCENE_INTENSITY_CALIBRATION) / 4
    expect(pointIlluminance(l, 0, 0)).toBeCloseTo(expected, 6)
  })

  it('falls off with horizontal distance and never returns NaN/Infinity', () => {
    const l = light(0, 0)
    const under = pointIlluminance(l, 0, 0)
    const off = pointIlluminance(l, 2, 0)
    expect(off).toBeLessThan(under)
    // A degenerate zero-height light is clamped, not infinite.
    const flush = light(0, 0, 9, 0)
    expect(Number.isFinite(pointIlluminance(flush, 0, 0))).toBe(true)
  })
})

describe('buildRoomLuxGrid', () => {
  it('renders a fully dark room (zero lights, night) as all-zero finite values', () => {
    const grid = buildRoomLuxGrid(room('br', 'Bedroom', 3, 4), [], [], {
      fixtureLevel: 1,
      daylightLevel: 0,
    })!
    expect(grid).not.toBeNull()
    expect(grid.maxLux).toBe(0)
    for (const v of grid.values) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v === MASKED || v === 0).toBe(true)
    }
    // Interior cells are 0 (not masked).
    expect(luxAt(grid, 1.5, 2)).toBe(0)
  })

  it('is brightest under the lamp and dimmer at the room edge', () => {
    const grid = buildRoomLuxGrid(room('lv', 'Living', 5, 4), [light(1, 1)], [], {
      fixtureLevel: 1,
      daylightLevel: 0,
    })!
    expect(luxAt(grid, 1, 1)).toBeGreaterThan(luxAt(grid, 4.5, 3.5))
    expect(grid.maxLux).toBeCloseTo(luxAt(grid, 1, 1), 6)
  })

  it('scales fixture contribution by fixtureLevel (daytime → 0)', () => {
    const night = buildRoomLuxGrid(room('lv', 'Living', 4, 4), [light(2, 2)], [], {
      fixtureLevel: 1,
      daylightLevel: 0,
    })!
    const half = buildRoomLuxGrid(room('lv', 'Living', 4, 4), [light(2, 2)], [], {
      fixtureLevel: 0.5,
      daylightLevel: 0,
    })!
    const day = buildRoomLuxGrid(room('lv', 'Living', 4, 4), [light(2, 2)], [], {
      fixtureLevel: 0,
      daylightLevel: 0,
    })!
    expect(half.maxLux).toBeCloseTo(night.maxLux / 2, 6)
    expect(day.maxLux).toBe(0)
  })

  it('in-room mean equals the lumen-method room average (heatmap redistributes the 2D number)', () => {
    const r = room('lv', 'Living', 4, 5)
    const lights = [light(2, 2)]
    const grid = buildRoomLuxGrid(r, lights, [], { fixtureLevel: 1, daylightLevel: 0 })!
    let sum = 0
    let n = 0
    for (const v of grid.values) {
      if (v === MASKED) continue
      sum += v
      n++
    }
    const [avg] = estimateRoomLux(makePlan([r]), lights)
    expect(sum / n).toBeCloseTo(avg!.lux, 4)
  })

  it('only counts lights whose bulb is inside the room (walls block light)', () => {
    const grid = buildRoomLuxGrid(room('a', 'Room A', 3, 3), [light(10, 10)], [], {
      fixtureLevel: 1,
      daylightLevel: 0,
    })!
    expect(grid.maxLux).toBe(0)
  })

  it('masks cells outside a polygon room and keeps inside cells lit', () => {
    const tri: PlanRoom = {
      id: 'tri',
      name: 'Nook',
      origin: [0, 0],
      width: 4,
      depth: 4,
      polygon: [
        [0, 0],
        [4, 0],
        [0, 4],
      ],
    }
    const grid = buildRoomLuxGrid(tri, [light(1, 1)], [], {
      fixtureLevel: 1,
      daylightLevel: 0,
    })!
    // (3.5, 3.5) is in the bbox but outside the triangle → masked.
    expect(luxAt(grid, 3.5, 3.5)).toBe(MASKED)
    expect(luxAt(grid, 1, 1)).toBeGreaterThan(0)
    // No NaN anywhere.
    for (const v of grid.values) expect(Number.isFinite(v)).toBe(true)
  })

  it('returns null for a degenerate room', () => {
    expect(
      buildRoomLuxGrid(room('z', 'Ghost', 0, 3), [], [], { fixtureLevel: 1, daylightLevel: 0 }),
    ).toBeNull()
  })

  it('caps grid dimensions by growing the cell, not the sample count', () => {
    const grid = buildRoomLuxGrid(room('hall', 'Hall', 60, 2), [], [], {
      fixtureLevel: 1,
      daylightLevel: 0,
    })!
    expect(grid.cols).toBeLessThanOrEqual(LUX_GRID_MAX_DIM)
    expect(grid.cols * grid.cell).toBeGreaterThanOrEqual(60)
  })
})

describe('daylight wash (windows)', () => {
  const planWithWindow = (): FloorPlan =>
    makePlan([room('lv', 'Living', 5, 4)], {
      walls: [{ id: 'w1', start: [0, 0], end: [5, 0], thickness: 'external' }],
      openings: [
        { id: 'o1', kind: 'window', wallId: 'w1', offset: 1.5, width: 2, sill: 0.9, head: 2.1 },
      ],
    })

  it('extracts window sources with glazing area and probe points', () => {
    const sources = planWindowSources(planWithWindow())
    expect(sources).toHaveLength(1)
    expect(sources[0]!.x).toBeCloseTo(2.5, 6)
    expect(sources[0]!.z).toBeCloseTo(0, 6)
    expect(sources[0]!.glazing).toBeCloseTo(2 * 1.2, 6)
  })

  it('is brighter beside the window than deep in the room, scaled by daylight level', () => {
    const plan = planWithWindow()
    const sources = planWindowSources(plan)
    const day = buildRoomLuxGrid(plan.rooms[0]!, [], sources, {
      fixtureLevel: 0,
      daylightLevel: 1,
    })!
    expect(luxAt(day, 2.5, 0.2)).toBeGreaterThan(luxAt(day, 2.5, 3.8))
    expect(day.maxLux).toBeGreaterThan(0)
    expect(day.maxLux).toBeLessThanOrEqual(DAYLIGHT_NEAR_WINDOW_LUX * 1.5)
    const night = buildRoomLuxGrid(plan.rooms[0]!, [], sources, {
      fixtureLevel: 1,
      daylightLevel: 0,
    })!
    expect(night.maxLux).toBe(0)
  })

  it('windowIlluminance decays with distance', () => {
    const [win] = planWindowSources(planWithWindow())
    expect(windowIlluminance(win!, win!.x, win!.z + 0.2)).toBeGreaterThan(
      windowIlluminance(win!, win!.x, win!.z + 3),
    )
  })
})

describe('buildLuxGrids (levels)', () => {
  const twoStorey = (): FloorPlan =>
    makePlan([room('g1', 'Living', 4, 4)], {
      upperLevels: [
        {
          id: 'l2',
          name: 'Level 2',
          elevation: 3,
          walls: [],
          openings: [],
          rooms: [room('u1', 'Bedroom', 4, 4)],
        },
      ],
    })

  it('builds one entry per visible level at its elevation, scoping lights to their storey', () => {
    const lights = [light(2, 2), { ...light(2.2, 2.2, 4), levelId: 'l2' }]
    const all = buildLuxGrids(twoStorey(), lights, 'all', { fixtureLevel: 1, daylightLevel: 0 })
    expect(all.map((l) => l.levelId)).toEqual(['ground', 'l2'])
    expect(all[1]!.elevation).toBe(3)
    // The ground light must not light the upper bedroom (and vice versa):
    // upper grid's max comes from the weaker (intensity 4) upper light.
    const upper = all[1]!.grids[0]!
    const ground = all[0]!.grids[0]!
    expect(upper.maxLux).toBeLessThan(ground.maxLux)
    expect(upper.maxLux).toBeGreaterThan(0)
  })

  it('only the selected level is built when View→Levels picks one', () => {
    const out = buildLuxGrids(twoStorey(), [light(2, 2)], 'l2', {
      fixtureLevel: 1,
      daylightLevel: 0,
    })
    expect(out.map((l) => l.levelId)).toEqual(['l2'])
  })

  it('a single-storey plan ignores the view level id', () => {
    const out = buildLuxGrids(makePlan([room('lv', 'Living', 4, 4)]), [light(2, 2)], 'stale-id', {
      fixtureLevel: 1,
      daylightLevel: 0,
    })
    expect(out.map((l) => l.levelId)).toEqual(['ground'])
  })
})
