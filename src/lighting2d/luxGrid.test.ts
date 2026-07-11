import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
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

describe('inter-room doorway bleed (R-BLEED)', () => {
  // Living [0..4]×[0..4] (lit) and Kitchen [0..4]×[4..8] (dark) share the wall
  // at z=4, connected by a door. Kitchen borrows light from Living when open.
  const living = room('lv', 'Living Room', 4, 4, 0, 0)
  const kitchen = room('kt', 'Kitchen', 4, 4, 0, 4)
  const wall: PlanWall = { id: 'w', start: [0, 4], end: [4, 4], thickness: 'internal' }
  const dr: PlanOpening = {
    id: 'd1',
    kind: 'door',
    wallId: 'w',
    offset: 1.5,
    width: 0.9,
    sill: 0,
    head: 2.1,
  }
  const twoRoom = () => makePlan([living, kitchen], { walls: [wall], openings: [dr] })
  const lights = [light(2, 2)] // bulb in the Living room only

  const kitchenGrid = (doors: Record<string, { open: boolean }>) =>
    buildLuxGrids(twoRoom(), lights, 'ground', {
      fixtureLevel: 1,
      daylightLevel: 0,
      doors,
    })[0]!.grids.find((g) => g.roomId === 'kt')!

  const inRoomMean = (g: RoomLuxGrid) => {
    let sum = 0
    let n = 0
    for (const v of g.values)
      if (v !== MASKED) {
        sum += v
        n += 1
      }
    return n > 0 ? sum / n : 0
  }
  /** Lux at the grid cell nearest a world point. */
  const at = (g: RoomLuxGrid, x: number, z: number) => {
    const ix = Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.x0) / g.cell)))
    const iz = Math.min(g.rows - 1, Math.max(0, Math.floor((z - g.z0) / g.cell)))
    return g.values[iz * g.cols + ix]!
  }

  it('a dark room stays fully dark with the door CLOSED (default) — no regression', () => {
    expect(inRoomMean(kitchenGrid({}))).toBe(0)
    expect(kitchenGrid({}).maxLux).toBe(0)
  })

  it('the dark room gains borrowed light once the door is OPEN', () => {
    const open = inRoomMean(kitchenGrid({ d1: { open: true } }))
    expect(open).toBeGreaterThan(0)
  })

  it('the bleed is DIRECTIONAL — peaks in front of the doorway, not isotropic', () => {
    const g = kitchenGrid({ d1: { open: true } })
    // Door centre is at x≈1.95, z=4; Kitchen spans z=4..8.
    const frontOfDoor = at(g, 1.95, 4.2) // just inside, directly in front
    const offToTheSide = at(g, 0.3, 4.2) // same depth from the wall, but off-axis
    const deepAhead = at(g, 1.95, 7.8) // directly ahead but far into the room
    // Facing term: in front of the opening beats an off-axis point at equal depth.
    expect(frontOfDoor).toBeGreaterThan(offToTheSide * 1.5)
    // Distance term: near the doorway beats deep in the room.
    expect(frontOfDoor).toBeGreaterThan(deepAhead)
    expect(deepAhead).toBeGreaterThan(0)
  })

  it('preserves the lumen-method lock-step: grid mean equals the 2D table borrowed lux', () => {
    const doors = { d1: { open: true } }
    const g = kitchenGrid(doors)
    const [, kt] = estimateRoomLux(twoRoom(), lights, doors)
    expect(kt!.roomId).toBe('kt')
    expect(kt!.borrowedLux).toBeGreaterThan(0)
    expect(inRoomMean(g)).toBeCloseTo(kt!.lux, 3)
  })

  it('the lit room is essentially unaffected (borrows nothing from a dark neighbour)', () => {
    const closed = inRoomMean(
      buildLuxGrids(twoRoom(), lights, 'ground', {
        fixtureLevel: 1,
        daylightLevel: 0,
      })[0]!.grids.find((g) => g.roomId === 'lv')!,
    )
    const open = inRoomMean(
      buildLuxGrids(twoRoom(), lights, 'ground', {
        fixtureLevel: 1,
        daylightLevel: 0,
        doors: { d1: { open: true } },
      })[0]!.grids.find((g) => g.roomId === 'lv')!,
    )
    expect(open).toBeCloseTo(closed, 6)
  })
})
