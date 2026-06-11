import { describe, expect, it } from 'vitest'
import type { PlanRoom } from '../../floorplan/types'
import {
  defaultStopLabel,
  HOTSPOT_ANCHOR_HEIGHT,
  hotspotScreenPosition,
  lookDirection,
  MAX_HOTSPOT_DISTANCE,
  MIN_STOP_DISTANCE,
  PANO_EYE_HEIGHT,
  type PanoTourStop,
  stopHotspots,
  yawToward,
} from './panoTour'
import { INITIAL_LOOK } from './viewerLook'

const stop = (id: string, x: number, z: number, levelId?: string): PanoTourStop => ({
  id,
  label: id,
  position: [x, z],
  ...(levelId ? { levelId } : {}),
})

describe('yawToward (viewer yaw 0 faces world −Z)', () => {
  it('faces north (−Z) at yaw 0', () => {
    expect(yawToward([0, 0], [0, -5])).toBeCloseTo(0)
  })
  it('faces east (+X) at −π/2', () => {
    expect(yawToward([0, 0], [5, 0])).toBeCloseTo(-Math.PI / 2)
  })
  it('faces west (−X) at +π/2', () => {
    expect(yawToward([0, 0], [-5, 0])).toBeCloseTo(Math.PI / 2)
  })
  it('faces south (+Z) at ±π', () => {
    expect(Math.abs(yawToward([0, 0], [0, 5]))).toBeCloseTo(Math.PI)
  })
  it('matches lookDirection round-trip: the yaw points at the offset', () => {
    const yaw = yawToward([1, 2], [4, 6])
    const [dx, , dz] = lookDirection(yaw, 0)
    // Direction (dx, dz) is proportional to the world offset (3, 4).
    expect(dx / dz).toBeCloseTo(3 / 4)
    expect(dz).toBeGreaterThan(0)
  })
})

describe('stopHotspots', () => {
  it('a single-stop tour has no hotspots', () => {
    const a = stop('a', 0, 0)
    expect(stopHotspots(a, [a])).toEqual([])
  })

  it('derives a hotspot per other stop, sorted nearest-first', () => {
    const a = stop('a', 0, 0)
    const b = stop('b', 6, 0)
    const c = stop('c', 0, -3)
    const hs = stopHotspots(a, [a, b, c])
    expect(hs.map((h) => h.stopId)).toEqual(['c', 'b'])
    expect(hs[0].distance).toBeCloseTo(3)
    expect(hs[0].yaw).toBeCloseTo(0) // c is due north
    expect(hs[1].yaw).toBeCloseTo(-Math.PI / 2) // b is due east
  })

  it('pitch sits below the horizon and flattens with distance', () => {
    const a = stop('a', 0, 0)
    const near = stopHotspots(a, [a, stop('b', 2, 0)])[0]
    const far = stopHotspots(a, [a, stop('c', 0, 10)])[0]
    expect(near.pitch).toBeLessThan(0)
    expect(far.pitch).toBeLessThan(0)
    expect(far.pitch).toBeGreaterThan(near.pitch) // farther → closer to 0
    expect(near.pitch).toBeCloseTo(Math.atan2(HOTSPOT_ANCHOR_HEIGHT - PANO_EYE_HEIGHT, 2))
  })

  it('guards coincident stops (atan2 of a zero offset never reaches the viewer)', () => {
    const a = stop('a', 3, 3)
    const clone = stop('b', 3, 3)
    const nearClone = stop('c', 3 + MIN_STOP_DISTANCE / 2, 3)
    expect(stopHotspots(a, [a, clone, nearClone])).toEqual([])
  })

  it('culls stops beyond the max distance (still reachable from the strip)', () => {
    const a = stop('a', 0, 0)
    const far = stop('b', MAX_HOTSPOT_DISTANCE + 1, 0)
    expect(stopHotspots(a, [a, far])).toEqual([])
    expect(stopHotspots(a, [a, far], 100)).toHaveLength(1)
  })

  it('gates hotspots to the same storey (no links through a floor slab)', () => {
    const ground = stop('a', 0, 0)
    const sameGround = stop('b', 2, 0)
    const upstairs = stop('c', 2, 0, 'level-2')
    expect(stopHotspots(ground, [ground, sameGround, upstairs]).map((h) => h.stopId)).toEqual(['b'])
    const upstairs2 = stop('d', 4, 0, 'level-2')
    expect(
      stopHotspots(upstairs, [ground, sameGround, upstairs, upstairs2]).map((h) => h.stopId),
    ).toEqual(['d'])
  })
})

describe('hotspotScreenPosition', () => {
  it('a hotspot dead ahead projects to the centre', () => {
    const p = hotspotScreenPosition({ ...INITIAL_LOOK, yaw: 0.7, pitch: 0.2 }, 0.7, 0.2, 16 / 9)
    expect(p?.left).toBeCloseTo(50)
    expect(p?.top).toBeCloseTo(50)
  })

  it('a hotspot to the right of the view projects right of centre', () => {
    // Viewer yaw decreases to look right; a hotspot at a smaller yaw is to the right.
    const p = hotspotScreenPosition(INITIAL_LOOK, -0.3, 0, 16 / 9)
    expect(p).not.toBeNull()
    expect(p!.left).toBeGreaterThan(50)
    expect(p!.top).toBeCloseTo(50)
  })

  it('a hotspot above the horizon projects above centre', () => {
    const p = hotspotScreenPosition(INITIAL_LOOK, 0, 0.3, 16 / 9)
    expect(p).not.toBeNull()
    expect(p!.top).toBeLessThan(50)
    expect(p!.left).toBeCloseTo(50)
  })

  it('a hotspot behind the camera is culled', () => {
    expect(hotspotScreenPosition(INITIAL_LOOK, Math.PI, 0, 16 / 9)).toBeNull()
  })

  it('a hotspot far outside the viewport is culled', () => {
    expect(hotspotScreenPosition(INITIAL_LOOK, Math.PI / 2 + 0.2, 0, 16 / 9)).toBeNull()
  })

  it('zooming in (smaller fov) pushes an off-axis hotspot farther from centre', () => {
    const wide = hotspotScreenPosition({ yaw: 0, pitch: 0, fov: 90 }, -0.2, 0, 16 / 9)
    const tele = hotspotScreenPosition({ yaw: 0, pitch: 0, fov: 45 }, -0.2, 0, 16 / 9)
    expect(wide).not.toBeNull()
    expect(tele).not.toBeNull()
    expect(tele!.left - 50).toBeGreaterThan(wide!.left - 50)
  })
})

describe('defaultStopLabel', () => {
  const rooms: PlanRoom[] = [
    { id: 'living', name: 'Living/Dining', origin: [0, 0], width: 4, depth: 5 },
    { id: 'bed', name: 'Bedroom 2', origin: [4, 0], width: 3, depth: 3 },
  ]

  it('uses the room name at the capture position', () => {
    expect(defaultStopLabel(rooms, [], 1, 1)).toBe('Living/Dining')
    expect(defaultStopLabel(rooms, [], 5, 1)).toBe('Bedroom 2')
  })

  it('numbers duplicate captures in the same room', () => {
    expect(defaultStopLabel(rooms, ['Living/Dining'], 1, 1)).toBe('Living/Dining 2')
    expect(defaultStopLabel(rooms, ['Living/Dining', 'Living/Dining 2'], 1, 1)).toBe(
      'Living/Dining 3',
    )
  })

  it('falls back to "Stop" outside any room', () => {
    expect(defaultStopLabel(rooms, [], 50, 50)).toBe('Stop')
    expect(defaultStopLabel(rooms, ['Stop'], 50, 50)).toBe('Stop 2')
  })
})
