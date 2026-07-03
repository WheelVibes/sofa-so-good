import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom, PlanVec2 } from '../../floorplan/types'
import {
  clampPointToPolygon,
  computeFacingYaw,
  minimapPointToWorld,
  nearestTeleportRoom,
  resolveMinimapTeleport,
  svgSquareViewBoxPoint,
} from './minimapTeleport'

describe('svgSquareViewBoxPoint', () => {
  it('maps 1:1 when the box IS square', () => {
    const rect = { left: 10, top: 20, width: 168, height: 168 }
    expect(svgSquareViewBoxPoint(10 + 84, 20 + 84, rect, 168)).toEqual([84, 84])
    expect(svgSquareViewBoxPoint(10, 20, rect, 168)).toEqual([0, 0])
  })

  it('accounts for letterboxing when the box is wider than tall (the real .minimap box)', () => {
    // .minimap is 168×132 with a square 168×168 viewBox: the browser's default
    // xMidYMid-meet centres a 132×132 square inside it, 18px empty on each side.
    const rect = { left: 0, top: 0, width: 168, height: 132 }
    expect(svgSquareViewBoxPoint(18, 0, rect, 168)).toEqual([0, 0])
    expect(svgSquareViewBoxPoint(18 + 132, 132, rect, 168)).toEqual([168, 168])
    // Centre of the rendered square → centre of the viewBox.
    expect(svgSquareViewBoxPoint(18 + 66, 66, rect, 168)).toEqual([84, 84])
  })

  it('returns the origin for a zero-size rect (never divides by zero)', () => {
    expect(svgSquareViewBoxPoint(5, 5, { left: 0, top: 0, width: 0, height: 0 }, 168)).toEqual([
      0, 0,
    ])
  })
})

describe('minimapPointToWorld', () => {
  const bounds = { minX: 2, minZ: 1, maxX: 6, maxZ: 4 }
  const scale = 10
  const offX = 5
  const offY = 7
  const pad = 0.4
  // Mirrors Minimap.tsx's forward transform exactly, for round-trip checks.
  const toX = (m: number) => (m - bounds.minX + pad) * scale + offX
  const toY = (m: number) => (m - bounds.minZ + pad) * scale + offY

  it('inverts the minimap world→svg transform', () => {
    const [wx, wz] = minimapPointToWorld(toX(3.2), toY(2.1), bounds, scale, offX, offY, pad)
    expect(wx).toBeCloseTo(3.2)
    expect(wz).toBeCloseTo(2.1)
  })

  it('round-trips the bounds corners', () => {
    for (const [mx, mz] of [
      [bounds.minX, bounds.minZ],
      [bounds.maxX, bounds.maxZ],
    ] as const) {
      const [wx, wz] = minimapPointToWorld(toX(mx), toY(mz), bounds, scale, offX, offY, pad)
      expect(wx).toBeCloseTo(mx)
      expect(wz).toBeCloseTo(mz)
    }
  })
})

const SQUARE: PlanVec2[] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
]

describe('clampPointToPolygon', () => {
  it('leaves a point well inside, clear of every edge, unchanged', () => {
    expect(clampPointToPolygon(SQUARE, 2, 1.5, 0.25)).toEqual([2, 1.5])
  })

  it('pushes a point too close to an edge inward by the margin', () => {
    const [x, z] = clampPointToPolygon(SQUARE, 0.1, 1.5, 0.25)
    expect(x).toBeCloseTo(0.25)
    expect(z).toBeCloseTo(1.5)
  })

  it('pulls a point outside the polygon inside, clear by the margin', () => {
    const [x, z] = clampPointToPolygon(SQUARE, -1, 1.5, 0.25)
    expect(x).toBeCloseTo(0.25)
    expect(z).toBeCloseTo(1.5)
  })

  it('picks the single nearest edge when just outside one side (not a corner tie)', () => {
    const [x, z] = clampPointToPolygon(SQUARE, 4.3, 1.5, 0.2)
    expect(x).toBeCloseTo(3.8)
    expect(z).toBeCloseTo(1.5)
  })

  it('returns the input unchanged for a degenerate (<3 point) polygon', () => {
    expect(clampPointToPolygon([[0, 0]], 5, 5, 0.25)).toEqual([5, 5])
  })
})

const room = (over: Partial<PlanRoom>): PlanRoom => ({
  id: 'r',
  name: 'Room',
  origin: [0, 0],
  width: 4,
  depth: 3,
  ...over,
})

const plan = (over: Partial<FloorPlan>): FloorPlan =>
  ({ extent: [20, 20], walls: [], openings: [], rooms: [], ...over }) as FloorPlan

describe('nearestTeleportRoom', () => {
  it('returns the room containing the point', () => {
    const p = plan({
      rooms: [room({ id: 'a', origin: [0, 0] }), room({ id: 'b', origin: [10, 0] })],
    })
    expect(nearestTeleportRoom(p, 2, 1)?.id).toBe('a')
    expect(nearestTeleportRoom(p, 12, 1)?.id).toBe('b')
  })

  it('falls back to the nearest room boundary when the point is outside every room', () => {
    const p = plan({
      rooms: [room({ id: 'a', origin: [0, 0] }), room({ id: 'b', origin: [10, 0] })],
    })
    // x=5 is in the gap between the two rooms, closer to room a's right edge (x=4).
    expect(nearestTeleportRoom(p, 5, 1)?.id).toBe('a')
    expect(nearestTeleportRoom(p, 9, 1)?.id).toBe('b')
  })

  it('returns null for a plan with no rooms', () => {
    expect(nearestTeleportRoom(plan({}), 1, 1)).toBeNull()
  })
})

describe('computeFacingYaw', () => {
  it('is 0 (facing -Z) when the target is straight ahead on -Z', () => {
    expect(computeFacingYaw(0, 0, 0, -5)).toBeCloseTo(0)
  })

  it('faces +X as +90 degrees (pi/2)', () => {
    expect(computeFacingYaw(0, 0, 5, 0)).toBeCloseTo(Math.PI / 2)
  })

  it('faces +Z as 180 degrees', () => {
    expect(Math.abs(computeFacingYaw(0, 0, 0, 5))).toBeCloseTo(Math.PI)
  })

  it('defaults to 0 for coincident points (degenerate)', () => {
    expect(computeFacingYaw(3, 3, 3, 3)).toBe(0)
  })
})

describe('resolveMinimapTeleport', () => {
  it('lands inside the tapped room, facing its centre', () => {
    const p = plan({ rooms: [room({ id: 'a', origin: [0, 0], width: 4, depth: 3 })] })
    const target = resolveMinimapTeleport(p, 2, 1.5, 0.25)
    expect(target).not.toBeNull()
    expect(target?.x).toBeCloseTo(2)
    expect(target?.z).toBeCloseTo(1.5)
    // Tapped point (2, 1.5) IS the room centre here, so any facing is
    // "toward the centre" (degenerate) — yaw defaults to 0.
    expect(target?.yaw).toBeCloseTo(0)
  })

  it('clamps a tap right on the wall into the room, clear by the margin', () => {
    const p = plan({ rooms: [room({ id: 'a', origin: [0, 0], width: 4, depth: 3 })] })
    const target = resolveMinimapTeleport(p, 0, 1.5, 0.25)
    expect(target?.x).toBeCloseTo(0.25)
    expect(target?.z).toBeCloseTo(1.5)
  })

  it('resolves a tap outside every room to the nearest room, clamped inside it', () => {
    const p = plan({ rooms: [room({ id: 'a', origin: [0, 0], width: 4, depth: 3 })] })
    const target = resolveMinimapTeleport(p, -2, 1.5, 0.25)
    expect(target?.x).toBeCloseTo(0.25)
    expect(target?.z).toBeCloseTo(1.5)
  })

  it('returns null for a plan with no rooms', () => {
    expect(resolveMinimapTeleport(plan({}), 1, 1, 0.25)).toBeNull()
  })
})
