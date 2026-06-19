import { describe, expect, it } from 'vitest'
import {
  RADIAL_MAX_COUNT,
  RADIAL_MIN_RADIUS,
  type RadialPlacement,
  radialArrayPlacements,
} from './radialArray'

const TWO_PI = 2 * Math.PI

// Helper: assert [x,z] position is close to expected values (9 decimal places)
function expectPos(p: RadialPlacement, x: number, z: number) {
  expect(p.position[0]).toBeCloseTo(x, 9)
  expect(p.position[1]).toBeCloseTo(z, 9)
}

describe('radialArrayPlacements', () => {
  // ── edge cases ────────────────────────────────────────────────────────────

  it('returns [] for count < 2', () => {
    expect(radialArrayPlacements({ radius: 1, count: 0 })).toEqual([])
    expect(radialArrayPlacements({ radius: 1, count: 1 })).toEqual([])
    expect(radialArrayPlacements({ radius: 1, count: -3 })).toEqual([])
  })

  it('returns [] for sweep ≤ 0', () => {
    expect(radialArrayPlacements({ radius: 1, count: 4, sweep: 0 })).toEqual([])
    expect(radialArrayPlacements({ radius: 1, count: 4, sweep: -1 })).toEqual([])
  })

  it('clamps radius to RADIAL_MIN_RADIUS for zero/negative radius', () => {
    const pl = radialArrayPlacements({ radius: 0, count: 2 })
    expect(pl).toHaveLength(2)
    // copy should be at distance RADIAL_MIN_RADIUS from center
    const [x, z] = pl[0].position
    const dist = Math.sqrt(x * x + z * z)
    expect(dist).toBeCloseTo(RADIAL_MIN_RADIUS, 9)
  })

  it('floors a fractional count', () => {
    expect(radialArrayPlacements({ radius: 1, count: 3.9 })).toHaveLength(3)
  })

  it('caps count at RADIAL_MAX_COUNT', () => {
    const pl = radialArrayPlacements({ radius: 1, count: RADIAL_MAX_COUNT + 10 })
    expect(pl).toHaveLength(RADIAL_MAX_COUNT)
  })

  it('clamps sweep > 2π to 2π (full circle)', () => {
    const full = radialArrayPlacements({ radius: 1, count: 4, sweep: TWO_PI })
    const over = radialArrayPlacements({ radius: 1, count: 4, sweep: TWO_PI + 1 })
    expect(full.length).toBe(over.length)
    for (let i = 0; i < full.length; i++) {
      expect(full[i].position[0]).toBeCloseTo(over[i].position[0], 9)
      expect(full[i].position[1]).toBeCloseTo(over[i].position[1], 9)
    }
  })

  // ── positions on the circle ───────────────────────────────────────────────

  it('4 copies around origin at r=1 are at 90° increments (full circle)', () => {
    const pl = radialArrayPlacements({ center: [0, 0], radius: 1, count: 4 })
    expect(pl).toHaveLength(4)
    // angles: 0, π/2, π, 3π/2
    expectPos(pl[0], 1, 0)
    expectPos(pl[1], 0, 1)
    expectPos(pl[2], -1, 0)
    expectPos(pl[3], 0, -1)
  })

  it('6 copies evenly divide the full circle', () => {
    const pl = radialArrayPlacements({ center: [0, 0], radius: 2, count: 6 })
    expect(pl).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      const angle = (i * TWO_PI) / 6
      expect(pl[i].position[0]).toBeCloseTo(2 * Math.cos(angle), 9)
      expect(pl[i].position[1]).toBeCloseTo(2 * Math.sin(angle), 9)
    }
  })

  it('full circle does NOT place the last copy on top of the first', () => {
    const pl = radialArrayPlacements({ center: [0, 0], radius: 1, count: 4, sweep: TWO_PI })
    // first and last should NOT coincide
    const d = Math.sqrt(
      (pl[3].position[0] - pl[0].position[0]) ** 2 + (pl[3].position[1] - pl[0].position[1]) ** 2,
    )
    expect(d).toBeGreaterThan(0.01)
  })

  it('respects a non-zero center', () => {
    const pl = radialArrayPlacements({ center: [3, 5], radius: 1, count: 2 })
    // At startAngle=0: first copy at (3+1, 5) = (4, 5); second at angle π: (2, 5)
    expectPos(pl[0], 4, 5)
    expectPos(pl[1], 2, 5)
  })

  it('respects startAngle', () => {
    const pl = radialArrayPlacements({
      center: [0, 0],
      radius: 1,
      count: 2,
      startAngle: Math.PI / 2,
    })
    // First at π/2: (0, 1); second at π/2 + π = 3π/2: (0, -1)
    expectPos(pl[0], 0, 1)
    expectPos(pl[1], 0, -1)
  })

  // ── partial sweep ─────────────────────────────────────────────────────────

  it('semicircle (sweep=π) is inclusive at both ends', () => {
    // 3 copies over π rad → step = π/2
    const pl = radialArrayPlacements({
      center: [0, 0],
      radius: 1,
      count: 3,
      startAngle: 0,
      sweep: Math.PI,
    })
    expect(pl).toHaveLength(3)
    expectPos(pl[0], 1, 0) // angle=0
    expectPos(pl[1], 0, 1) // angle=π/2
    expectPos(pl[2], -1, 0) // angle=π
  })

  it('count=2 over a partial sweep places one at each endpoint', () => {
    const pl = radialArrayPlacements({
      center: [0, 0],
      radius: 1,
      count: 2,
      startAngle: 0,
      sweep: Math.PI / 2,
    })
    expect(pl).toHaveLength(2)
    expectPos(pl[0], 1, 0) // start
    expectPos(pl[1], 0, 1) // start + sweep
  })

  // ── faceCenter yaw ────────────────────────────────────────────────────────

  it('faceCenter=true: yaw for copy at angle 0 points toward center (−X direction)', () => {
    const pl = radialArrayPlacements({
      center: [0, 0],
      radius: 1,
      count: 2,
      faceCenter: true,
    })
    // Copy at angle=0 is at (1, 0). To face center it must face −X.
    // Three.js Y-rotation θ: item's +Z world direction = (sin θ, cos θ) in (X, Z).
    // We need (sin θ, cos θ) = (−1, 0) → θ = atan2(−cos(0), −sin(0)) = atan2(−1, 0) = −π/2.
    const a = 0
    const expectedYaw = Math.atan2(-Math.cos(a), -Math.sin(a)) // −π/2
    expect(pl[0].rotation).toBeCloseTo(expectedYaw, 9)
  })

  it('faceCenter=true: yaw for copy at angle π/2 faces center correctly', () => {
    const pl = radialArrayPlacements({
      center: [0, 0],
      radius: 1,
      count: 4,
      faceCenter: true,
    })
    // Copy at angle=π/2 is at (0, 1). To face center, must face (0,-1) in (X,Z).
    // Three.js Y-rotation: (sin θ, cos θ) = (0,-1) → θ = atan2(0,-1) = π.
    // Our formula: atan2(-cos(π/2), -sin(π/2)) = atan2(0,-1) = π.
    const a = Math.PI / 2
    const expectedYaw = Math.atan2(-Math.cos(a), -Math.sin(a))
    expect(pl[1].rotation).toBeCloseTo(expectedYaw, 9)
  })

  it('faceCenter=false: yaw is the baseRotation', () => {
    const pl = radialArrayPlacements({
      center: [0, 0],
      radius: 1,
      count: 4,
      faceCenter: false,
      baseRotation: 1.23,
    })
    for (const p of pl) {
      expect(p.rotation).toBeCloseTo(1.23, 9)
    }
  })

  it('faceCenter defaults to true', () => {
    const plDefault = radialArrayPlacements({ center: [0, 0], radius: 1, count: 4 })
    const plTrue = radialArrayPlacements({ center: [0, 0], radius: 1, count: 4, faceCenter: true })
    for (let i = 0; i < 4; i++) {
      expect(plDefault[i].rotation).toBeCloseTo(plTrue[i].rotation, 9)
    }
  })

  // ── all copies are at the correct radius from center ──────────────────────

  it('all copies sit exactly on the circle', () => {
    const cx = 3
    const cz = -2
    const r = 1.5
    const pl = radialArrayPlacements({ center: [cx, cz], radius: r, count: 8 })
    for (const {
      position: [x, z],
    } of pl) {
      const dist = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2)
      expect(dist).toBeCloseTo(r, 9)
    }
  })

  // ── even angular spacing ──────────────────────────────────────────────────

  it('full circle: angular spacing between adjacent copies is equal', () => {
    const pl = radialArrayPlacements({ center: [0, 0], radius: 1, count: 6 })
    const angles = pl.map(({ position: [x, z] }) => Math.atan2(z, x))
    // normalise an angle difference to [−π, π]
    const norm = (d: number) => ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    for (let i = 1; i < angles.length; i++) {
      const d = norm(angles[i] - angles[i - 1])
      expect(d).toBeCloseTo(TWO_PI / 6, 9)
    }
  })
})
