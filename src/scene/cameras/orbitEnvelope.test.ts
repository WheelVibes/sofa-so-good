import { describe, expect, it } from 'vitest'
import {
  easeShellPush,
  escapeShell,
  insideShell,
  ORBIT_SHELL_PAD,
  ORBIT_SHELL_SNAP,
  ORBIT_SHELL_TAU,
  pushOutsideShell,
  shellBoxForPlan,
  shellExitT,
  type Vec3,
} from './orbitEnvelope'

/** The default 4-room Serangoon North Vista flat: ~12.6 x 10.6 m, 2.6 m ceiling. */
const BOX = shellBoxForPlan(12.6, 10.6, 2.6)

describe('shellBoxForPlan', () => {
  it('pads every side of the storey, top included', () => {
    expect(BOX).toEqual({
      minX: -ORBIT_SHELL_PAD,
      maxX: 12.6 + ORBIT_SHELL_PAD,
      minZ: -ORBIT_SHELL_PAD,
      maxZ: 10.6 + ORBIT_SHELL_PAD,
      top: 2.6 + ORBIT_SHELL_PAD,
    })
  })
})

describe('insideShell', () => {
  it('flags the recorded S5 pose as inside', () => {
    // docs/audit/interaction-sweep-2026-09-18.md finding S5, measured from the clip.
    expect(insideShell([10.562, 1.089, 8.913], BOX)).toBe(true)
  })
  it('clears an ordinary dollhouse pose', () => {
    expect(insideShell([20.8, 10.6, 19.2], BOX)).toBe(false)
  })
  it('clears a camera above the roof and one beyond a facade', () => {
    expect(insideShell([6.3, 4.0, 5.3], BOX)).toBe(false)
    expect(insideShell([-2, 1, 5.3], BOX)).toBe(false)
  })
  it('counts a point under the slab as inside (never a legal orbit pose)', () => {
    expect(insideShell([6.3, -1, 5.3], BOX)).toBe(true)
  })
})

describe('shellExitT', () => {
  it('is the nearest far-plane hit, not the farthest', () => {
    // From the centre, heading +X: exits the +X face at (12.6 + pad − 6.3) / 1.
    expect(shellExitT([6.3, 1, 5.3], [1, 0, 0], BOX)).toBeCloseTo(12.6 + ORBIT_SHELL_PAD - 6.3, 6)
  })
  it('exits through the top for a steeply rising ray', () => {
    expect(shellExitT([6.3, 1, 5.3], [0, 1, 0], BOX)).toBeCloseTo(2.6 + ORBIT_SHELL_PAD - 1, 6)
  })
  it('never exits downward — a falling ray leaves through a side', () => {
    const t = shellExitT([6.3, 1, 5.3], [0, -1, 0], BOX)
    expect(t).toBeNull()
  })
  it('returns null for a degenerate direction', () => {
    expect(shellExitT([6.3, 1, 5.3], [0, 0, 0], BOX)).toBeNull()
  })
})

describe('pushOutsideShell', () => {
  it('leaves a camera that already clears the envelope alone', () => {
    expect(pushOutsideShell([20.8, 10.6, 19.2], [6.36, 1, 4.69], BOX)).toBeNull()
  })

  it('pushes the recorded S5 pose out of the kitchen, radially', () => {
    const cam: Vec3 = [10.562, 1.089, 8.913]
    const tgt: Vec3 = [6.36, 1, 4.69]
    const out = pushOutsideShell(cam, tgt, BOX) as Vec3
    expect(out).not.toBeNull()
    expect(insideShell(out, BOX)).toBe(false)
    // Radial: the direction from the target is unchanged, so the framing is preserved and
    // only the dolly distance grows.
    const d0 = [cam[0] - tgt[0], cam[1] - tgt[1], cam[2] - tgt[2]]
    const d1 = [out[0] - tgt[0], out[1] - tgt[1], out[2] - tgt[2]]
    const len = (v: number[]) => Math.hypot(v[0], v[1], v[2])
    const cos = (d0[0] * d1[0] + d0[1] * d1[1] + d0[2] * d1[2]) / (len(d0) * len(d1))
    expect(cos).toBeCloseTo(1, 6)
    expect(len(d1)).toBeGreaterThan(len(d0))
  })

  it('recovers from EVERY polar angle at the trapped radius — the "reverse drag does not help" part', () => {
    const tgt: Vec3 = [6.36, 1, 4.69]
    const r = 5.96
    const az = Math.atan2(10.562 - tgt[0], 8.913 - tgt[2])
    for (let deg = 1; deg <= 89; deg++) {
      const el = (deg * Math.PI) / 180
      const cam: Vec3 = [
        tgt[0] + r * Math.cos(el) * Math.sin(az),
        tgt[1] + r * Math.sin(el),
        tgt[2] + r * Math.cos(el) * Math.cos(az),
      ]
      const out = pushOutsideShell(cam, tgt, BOX)
      expect(insideShell(out ?? cam, BOX)).toBe(false)
    }
  })

  it('escapes along the least-penetration axis when the pivot was panned outside', () => {
    const out = pushOutsideShell([1, 1, 5.3], [-40, 1, 5.3], BOX) as Vec3
    expect(insideShell(out, BOX)).toBe(false)
    expect(out[0]).toBeCloseTo(BOX.minX, 6) // nearest face is −X
  })

  it('never pushes the camera under the slab', () => {
    const out = escapeShell([6.3, 0.05, 5.3], BOX)
    expect(out[1]).toBeGreaterThanOrEqual(0.05)
    expect(insideShell(out, BOX)).toBe(false)
  })
})

describe('easeShellPush', () => {
  const A: Vec3 = [0, 0, 0]
  const B: Vec3 = [3, 0, 0]

  it('is frame-rate independent: one 100 ms step equals four 25 ms steps', () => {
    const one = easeShellPush(A, B, 0.1)
    let p = A
    for (let i = 0; i < 4; i++) p = easeShellPush(p, B, 0.025)
    expect(p[0]).toBeCloseTo(one[0], 9)
  })

  it('moves toward the destination without overshooting', () => {
    const p = easeShellPush(A, B, 1 / 60)
    expect(p[0]).toBeGreaterThan(0)
    expect(p[0]).toBeLessThan(B[0])
  })

  it('snaps inside ORBIT_SHELL_SNAP and ignores a non-positive delta', () => {
    expect(easeShellPush([2.999, 0, 0], B, 1 / 60)).toEqual(B)
    expect(ORBIT_SHELL_SNAP).toBeGreaterThan(0)
    expect(easeShellPush(A, B, 0)).toEqual(A)
    expect(easeShellPush(A, B, Number.NaN)).toEqual(A)
  })

  it('defaults its time constant to ORBIT_SHELL_TAU', () => {
    const withDefault = easeShellPush(A, B, 1 / 60)
    const withExplicit = easeShellPush(A, B, 1 / 60, ORBIT_SHELL_TAU)
    expect(withDefault).toEqual(withExplicit)
  })

  it('clears the actual building within a few frames of a 60 fps drag', () => {
    // The destination sits on the PADDED box, which an exponential approach only reaches
    // asymptotically (it snaps at ORBIT_SHELL_SNAP, ~0.7 s later). What matters for the frame
    // is when the camera leaves the REAL shell — the same box with no pad — and the 0.6 m of
    // padding is exactly the head start that buys.
    const BARE = shellBoxForPlan(12.6, 10.6, 2.6, 0)
    const tgt: Vec3 = [6.36, 1, 4.69]
    const start: Vec3 = [10.562, 1.089, 8.913]
    const dest = pushOutsideShell(start, tgt, BOX) as Vec3
    let p: Vec3 = start
    let frames = 0
    while (insideShell(p, BARE) && frames < 60) {
      p = easeShellPush(p, dest, 1 / 60)
      frames++
    }
    expect(insideShell(p, BARE)).toBe(false)
    expect(frames).toBeLessThanOrEqual(12) // measured 10 frames ≈ 167 ms at ORBIT_SHELL_TAU
  })
})
