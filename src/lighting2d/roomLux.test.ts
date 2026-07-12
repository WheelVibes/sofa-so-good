import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import type { PlanLight } from './lightingPlan'
import {
  estimateRoomLux,
  LUMENS_PER_CANDELA,
  planLightLumens,
  RECOMMENDED_LUX,
  SCENE_INTENSITY_CALIBRATION,
  UTILISATION_FACTOR,
} from './roomLux'

const makePlan = (rooms: PlanRoom[]): FloorPlan => ({
  id: 'p',
  name: 'P',
  ceilingHeight: 2.6,
  extent: [10, 10],
  walls: [],
  openings: [],
  rooms,
})

const room = (id: string, name: string, w: number, d: number, ox = 0, oz = 0): PlanRoom => ({
  id,
  name,
  origin: [ox, oz],
  width: w,
  depth: d,
})

const light = (x: number, z: number, intensity = 9): PlanLight => ({
  id: `l-${x}-${z}`,
  type: 'ceiling-light',
  label: 'Ceiling light',
  x,
  z,
  height: 2.05,
  intensity,
  distance: 6.5,
  color: '#fff0d4',
})

describe('estimateRoomLux', () => {
  it('reports an empty (unlit) room at 0 lx with status low', () => {
    const rows = estimateRoomLux(makePlan([room('br', 'Bedroom 2', 3, 4)]), [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      roomId: 'br',
      kind: 'bedroom',
      area: 12,
      lumens: 0,
      lux: 0,
      status: 'low',
    })
  })

  it('computes the lumen-method estimate for a single emitter', () => {
    const rows = estimateRoomLux(makePlan([room('lv', 'Living Room', 4, 5)]), [light(2, 2)])
    const expectedLumens = 9 * SCENE_INTENSITY_CALIBRATION * LUMENS_PER_CANDELA
    expect(planLightLumens({ intensity: 9 })).toBeCloseTo(expectedLumens, 6)
    expect(rows[0]!.lumens).toBeCloseTo(expectedLumens, 6)
    // E = Φ × UF / A over the 20 m² floor.
    expect(rows[0]!.lux).toBeCloseTo((expectedLumens * UTILISATION_FACTOR) / 20, 6)
  })

  it('scales inversely with floor area (same light, half the area → double the lux)', () => {
    const [big] = estimateRoomLux(makePlan([room('a', 'Room A', 4, 5)]), [light(1, 1)])
    const [small] = estimateRoomLux(makePlan([room('a', 'Room A', 2, 5)]), [light(1, 1)])
    expect(small!.lux).toBeCloseTo(big!.lux * 2, 6)
  })

  it('looks up the recommended band from the room name and statuses against it', () => {
    // 2×2 kitchen with two pendants → ~305 lx, inside the 300–600 band.
    const plan = makePlan([room('k', 'Kitchen', 2, 2), room('lv', 'Living / Dining', 2, 2, 4, 0)])
    const rows = estimateRoomLux(plan, [
      light(0.5, 0.5),
      light(1.5, 1.5),
      light(4.5, 0.5),
      light(5.5, 1.5),
    ])
    const kitchen = rows.find((r) => r.roomId === 'k')!
    expect(kitchen.kind).toBe('kitchen')
    expect(kitchen.recommended).toEqual(RECOMMENDED_LUX.kitchen)
    expect(kitchen.lux).toBeGreaterThan(300)
    expect(kitchen.status).toBe('ok')
    // The same two-pendant load in a living room blows past its 100–200 band.
    const living = rows.find((r) => r.roomId === 'lv')!
    expect(living.recommended).toEqual(RECOMMENDED_LUX.living)
    expect(living.status).toBe('high')
  })

  it('handles a custom-plan polygon room: polygon area + containment, degenerate rooms skipped', () => {
    const tri: PlanRoom = {
      id: 'tri',
      name: 'Study Nook',
      origin: [0, 0],
      width: 4,
      depth: 4,
      polygon: [
        [0, 0],
        [4, 0],
        [0, 4],
      ],
    }
    const degenerate = room('zero', 'Ghost', 0, 3, 6, 6)
    // (1,1) is inside the triangle; (3,3) is inside its bounding box but outside it.
    const rows = estimateRoomLux(makePlan([tri, degenerate]), [light(1, 1), light(3, 3)])
    expect(rows).toHaveLength(1) // zero-area room skipped
    const nook = rows[0]!
    expect(nook.kind).toBe('study')
    expect(nook.area).toBeCloseTo(8, 6) // shoelace over the triangle, not 4×4
    expect(nook.lumens).toBeCloseTo(planLightLumens({ intensity: 9 }), 6) // only the inside light
    expect(nook.lux).toBeCloseTo((planLightLumens({ intensity: 9 }) * UTILISATION_FACTOR) / 8, 6)
  })
})

describe('estimateRoomLux — inter-room doorway bleed (R-BLEED)', () => {
  // Living [0..4]×[0..4] (lit), Kitchen [0..4]×[4..8] (dark), shared door at z=4.
  const plan: FloorPlan = {
    ...makePlan([room('lv', 'Living Room', 4, 4, 0, 0), room('kt', 'Kitchen', 4, 4, 0, 4)]),
    walls: [{ id: 'w', start: [0, 4], end: [4, 4], thickness: 'internal' }],
    openings: [
      { id: 'd1', kind: 'door', wallId: 'w', offset: 1.5, width: 0.9, sill: 0, head: 2.1 },
    ],
  }
  const lights = [light(2, 2)] // Living only

  it('reports 0 borrowed lux with the door closed (default) — unlit kitchen stays low', () => {
    const kt = estimateRoomLux(plan, lights).find((r) => r.roomId === 'kt')!
    expect(kt.borrowedLux).toBe(0)
    expect(kt.lux).toBe(0)
    expect(kt.status).toBe('low')
  })

  it('adds a positive borrowed term when the door is open', () => {
    const kt = estimateRoomLux(plan, lights, { d1: { open: true } }).find((r) => r.roomId === 'kt')!
    expect(kt.borrowedLux).toBeGreaterThan(0)
    expect(kt.lux).toBeCloseTo(kt.borrowedLux, 6) // no own fixtures → lux is all borrowed
    expect(kt.lumens).toBe(0) // borrowed light is NOT the room's own flux
  })

  it('does not increase the lit source room (dark neighbour lends nothing back)', () => {
    const closed = estimateRoomLux(plan, lights).find((r) => r.roomId === 'lv')!
    const open = estimateRoomLux(plan, lights, { d1: { open: true } }).find(
      (r) => r.roomId === 'lv',
    )!
    expect(open.lux).toBeCloseTo(closed.lux, 6)
    expect(open.borrowedLux).toBe(0)
  })

  it('accepts the store doors map as-is (panel/heatmap parity): explicit closed = absent', () => {
    // ElevationPanel passes the store's `doors` map straight through — the same
    // map LuxOverlay feeds buildLuxGrids — so an explicit `{ open: false }`
    // entry must read identically to no entry at all.
    const explicit = estimateRoomLux(plan, lights, { d1: { open: false } }).find(
      (r) => r.roomId === 'kt',
    )!
    expect(explicit.borrowedLux).toBe(0)
    expect(explicit.lux).toBe(0)
  })
})
