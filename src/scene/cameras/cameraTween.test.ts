import { describe, expect, it } from 'vitest'
import {
  FLY_MAX_SECONDS,
  FLY_MIN_SECONDS,
  flyDurationFor,
  flyPose,
  fromOrbitSpherical,
  shortestAngleLerp,
  smoothstep,
  toOrbitSpherical,
  type Vec3,
} from './cameraTween'

describe('cameraTween — smoothstep', () => {
  it('pins the endpoints and the midpoint', () => {
    expect(smoothstep(0)).toBe(0)
    expect(smoothstep(1)).toBe(1)
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 6)
  })

  it('clamps out-of-range inputs', () => {
    expect(smoothstep(-1)).toBe(0)
    expect(smoothstep(2)).toBe(1)
  })

  it('eases in and out (slower than linear near the ends)', () => {
    // Below the line early, above it late — the S-curve.
    expect(smoothstep(0.25)).toBeLessThan(0.25)
    expect(smoothstep(0.75)).toBeGreaterThan(0.75)
  })

  it('is monotonic across the unit interval', () => {
    let prev = -1
    for (let i = 0; i <= 20; i++) {
      const v = smoothstep(i / 20)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('cameraTween — flyDurationFor', () => {
  const origin: Vec3 = [0, 0, 0]

  it('uses the minimum duration for a zero-length move', () => {
    expect(flyDurationFor(origin, origin)).toBe(FLY_MIN_SECONDS)
  })

  it('stays near the minimum for a tiny hop', () => {
    const dur = flyDurationFor(origin, [0.3, 0, 0])
    expect(dur).toBeGreaterThanOrEqual(FLY_MIN_SECONDS)
    expect(dur).toBeLessThan(FLY_MIN_SECONDS + 0.05)
  })

  it('saturates at the maximum for a long jump', () => {
    expect(flyDurationFor(origin, [100, 0, 0])).toBe(FLY_MAX_SECONDS)
  })

  it('scales monotonically with distance and stays within bounds', () => {
    let prev = 0
    for (let d = 0; d <= 25; d += 2.5) {
      const dur = flyDurationFor(origin, [d, 0, 0])
      expect(dur).toBeGreaterThanOrEqual(FLY_MIN_SECONDS)
      expect(dur).toBeLessThanOrEqual(FLY_MAX_SECONDS)
      expect(dur).toBeGreaterThanOrEqual(prev)
      prev = dur
    }
  })

  it('falls back to the minimum for a non-finite pose', () => {
    expect(flyDurationFor(origin, [Number.NaN, 0, 0])).toBe(FLY_MIN_SECONDS)
  })

  it('measures full 3-D travel (not just one axis)', () => {
    // A diagonal move is longer than the same delta on one axis → longer/equal.
    const axis = flyDurationFor(origin, [5, 0, 0])
    const diag = flyDurationFor(origin, [5, 5, 5])
    expect(diag).toBeGreaterThan(axis)
  })
})

describe('cameraTween — orbit spherical round-trip', () => {
  it('inverts toOrbitSpherical/fromOrbitSpherical exactly', () => {
    const target: Vec3 = [2, 1, 3]
    const pos: Vec3 = [7, 8.5, 5]
    const s = toOrbitSpherical(pos, target)
    const back = fromOrbitSpherical(s, target)
    expect(back[0]).toBeCloseTo(pos[0], 9)
    expect(back[1]).toBeCloseTo(pos[1], 9)
    expect(back[2]).toBeCloseTo(pos[2], 9)
  })

  it('returns a harmless zeroed spherical for a degenerate (zero-radius) offset', () => {
    const s = toOrbitSpherical([1, 1, 1], [1, 1, 1])
    expect(s.radius).toBe(0)
    expect(Number.isFinite(s.phi)).toBe(true)
    expect(Number.isFinite(s.theta)).toBe(true)
  })

  it('phi is 0 for a camera directly overhead the target', () => {
    const s = toOrbitSpherical([2, 10, 3], [2, 0, 3])
    expect(s.phi).toBeCloseTo(0, 9)
  })
})

describe('cameraTween — shortestAngleLerp', () => {
  it('pins the endpoints', () => {
    expect(shortestAngleLerp(0, Math.PI / 2, 0)).toBeCloseTo(0, 9)
    expect(shortestAngleLerp(0, Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2, 9)
  })

  it('takes the short way around when angles straddle the ±π wrap', () => {
    // From just past +π to just past -π is a tiny hop the "long way" (2π−ε)
    // unless wrapped — assert the interpolated midpoint is near the wrap point,
    // not near 0 (which is what a naive unwrapped lerp would give).
    const from = Math.PI - 0.1
    const to = -Math.PI + 0.1
    const mid = shortestAngleLerp(from, to, 0.5)
    const wrapped = Math.atan2(Math.sin(mid), Math.cos(mid))
    expect(Math.abs(Math.abs(wrapped) - Math.PI)).toBeLessThan(0.05)
  })

  it('is continuous and monotonic in angle-distance-covered across t', () => {
    const from = 0.2
    const to = 2.9
    let prev = shortestAngleLerp(from, to, 0)
    for (let i = 1; i <= 20; i++) {
      const t = i / 20
      const v = shortestAngleLerp(from, to, t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('cameraTween — flyPose (TV-SNAP: smooth rotation into a top-down view)', () => {
  // A representative 3/4 dollhouse pose flying to a straight-overhead top view,
  // reproducing the shapes `dollhouseFraming`/`topFraming` produce.
  const fromPos: Vec3 = [10, 6, 10]
  const fromTgt: Vec3 = [2, 1, 3]
  const toPos: Vec3 = [2, 14, 3.01]
  const toTgt: Vec3 = [2, 0, 3]

  it('reproduces the destination pose exactly at t=1', () => {
    const { pos, target } = flyPose(fromPos, fromTgt, toPos, toTgt, 1)
    expect(pos[0]).toBeCloseTo(toPos[0], 6)
    expect(pos[1]).toBeCloseTo(toPos[1], 6)
    expect(pos[2]).toBeCloseTo(toPos[2], 6)
    expect(target[0]).toBeCloseTo(toTgt[0], 6)
    expect(target[1]).toBeCloseTo(toTgt[1], 6)
    expect(target[2]).toBeCloseTo(toTgt[2], 6)
  })

  it('reproduces the origin pose exactly at t=0', () => {
    const { pos, target } = flyPose(fromPos, fromTgt, toPos, toTgt, 0)
    expect(pos[0]).toBeCloseTo(fromPos[0], 6)
    expect(pos[1]).toBeCloseTo(fromPos[1], 6)
    expect(pos[2]).toBeCloseTo(fromPos[2], 6)
    expect(target[0]).toBeCloseTo(fromTgt[0], 6)
    expect(target[1]).toBeCloseTo(fromTgt[1], 6)
    expect(target[2]).toBeCloseTo(fromTgt[2], 6)
  })

  it('bounds the per-step angular delta of the implied view direction (no terminal spike)', () => {
    // Sample the fly at many steps and measure the angle between consecutive
    // "forward" (target - pos, normalized) directions — this is what the
    // camera's orientation actually tracks each frame. A discontinuous snap
    // shows up as one step's angular delta being far larger than the rest.
    const steps = 200
    const angles: number[] = []
    const dirAt = (t: number): Vec3 => {
      const { pos, target } = flyPose(fromPos, fromTgt, toPos, toTgt, t)
      const dx = target[0] - pos[0]
      const dy = target[1] - pos[1]
      const dz = target[2] - pos[2]
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
      return [dx / len, dy / len, dz / len]
    }
    let prevDir = dirAt(0)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const dir = dirAt(t)
      const dot = Math.min(
        1,
        Math.max(-1, prevDir[0] * dir[0] + prevDir[1] * dir[1] + prevDir[2] * dir[2]),
      )
      angles.push(Math.acos(dot))
      prevDir = dir
    }
    const total = angles.reduce((a, b) => a + b, 0)
    const avg = total / angles.length
    const max = Math.max(...angles)
    // A real discontinuity dwarfs the average step by an order of magnitude;
    // a smooth eased curve keeps every step within a small multiple of it.
    expect(max).toBeLessThan(avg * 2 + 1e-6)
  })
})
