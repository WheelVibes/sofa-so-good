import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/flags/registry'
import { resolveFlags } from '../../features/flags/resolve'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import type { FloorPlan, PlanRoom } from '../../floorplan/types'
import { parallaxCorrect, planRoomProbes, probeAt, probeVramMb, roomProbeBox } from './roomProbe'

const room = (over: Partial<PlanRoom> = {}): PlanRoom =>
  ({
    id: 'r1',
    name: 'Room',
    kind: 'bedroom',
    origin: [0, 0],
    width: 4,
    depth: 3,
    ...over,
  }) as PlanRoom

describe('roomProbeBox', () => {
  it('spans the room rectangle in x/z and floor-to-ceiling in y', () => {
    const { boxMin, boxMax } = roomProbeBox(room({ origin: [2, 1] }), 2.6)
    expect(boxMin).toEqual([2, 0, 1])
    expect(boxMax).toEqual([6, 2.6, 4])
  })

  it("prefers the ROOM's own ceiling over the plan's", () => {
    // The bathrooms are 2.4 against walls built to 2.6. WALL-HEAD-CLAMP exists because that
    // 200 mm is real; a probe box that ignored it would put the reflected ceiling too high.
    const { boxMax } = roomProbeBox(room({ ceilingHeight: 2.4 }), 2.6)
    expect(boxMax[1]).toBe(2.4)
  })

  it('falls back to 2.6 when neither declares one', () => {
    expect(roomProbeBox(room(), undefined).boxMax[1]).toBe(2.6)
  })

  it('bounds an L-shaped room by its whole outline, not just the main rectangle', () => {
    const l = room({ extension: { offset: [4, 0], width: 2, depth: 1 } })
    expect(roomProbeBox(l, 2.6).boxMax[0]).toBe(6)
  })
})

describe('planRoomProbes', () => {
  const plan = buildDefaultPlan()

  it('gives the default 4-room flat one probe per room, centred in its own box', () => {
    const probes = planRoomProbes(plan, 'all')
    expect(probes.length).toBeGreaterThanOrEqual(8)
    for (const p of probes) {
      expect(p.center[0]).toBeCloseTo((p.boxMin[0] + p.boxMax[0]) / 2, 9)
      expect(p.center[1]).toBeCloseTo((p.boxMin[1] + p.boxMax[1]) / 2, 9)
      expect(p.center[2]).toBeCloseTo((p.boxMin[2] + p.boxMax[2]) / 2, 9)
      expect(p.boxMax[0]).toBeGreaterThan(p.boxMin[0])
      expect(p.boxMax[1]).toBeGreaterThan(p.boxMin[1])
      expect(p.boxMax[2]).toBeGreaterThan(p.boxMin[2])
    }
  })

  it('covers the rooms this feature is aimed at — the kitchen and both bathrooms', () => {
    const ids = new Set(planRoomProbes(plan, 'all').map((p) => p.roomId))
    expect(ids.has('kitchen')).toBe(true)
    expect(ids.has('bath1')).toBe(true)
    expect(ids.has('bath2')).toBe(true)
  })

  it('skips a degenerate room rather than shipping a divide-by-zero into a uniform', () => {
    const degenerate = {
      ...plan,
      levels: undefined,
      rooms: [room({ width: 0, depth: 3 })],
      walls: [],
      openings: [],
    } as unknown as FloorPlan
    expect(planRoomProbes(degenerate, 'all')).toEqual([])
  })
})

describe('probeAt', () => {
  const probes = planRoomProbes(buildDefaultPlan(), 'all')

  it('returns null outside every room', () => {
    expect(probeAt(probes, -50, -50)).toBeNull()
  })

  it('picks the SMALLEST containing box when two overlap', () => {
    const big = {
      roomId: 'big',
      center: [5, 1.3, 5] as const,
      boxMin: [0, 0, 0] as const,
      boxMax: [10, 2.6, 10] as const,
    }
    const small = {
      roomId: 'small',
      center: [1, 1.2, 1] as const,
      boxMin: [0, 0, 0] as const,
      boxMax: [2, 2.4, 2] as const,
    }
    expect(probeAt([big, small], 1, 1)?.roomId).toBe('small')
    expect(probeAt([small, big], 1, 1)?.roomId).toBe('small')
    expect(probeAt([big, small], 5, 5)?.roomId).toBe('big')
  })
})

describe('parallaxCorrect', () => {
  // A 4 x 2.6 x 4 box centred on the origin at y = 1.3.
  const probe = {
    roomId: 'r',
    center: [0, 1.3, 0] as const,
    boxMin: [-2, 0, -2] as const,
    boxMax: [2, 2.6, 2] as const,
  }

  it('is the identity at the capture point — the one place an uncorrected cubemap is right', () => {
    const out = parallaxCorrect([1, 0, 0], probe.center, probe)
    // From the centre, +X hits the wall at x = 2, i.e. 2 m along +X from the centre.
    expect(out[0]).toBeCloseTo(2, 6)
    expect(out[1]).toBeCloseTo(0, 6)
    expect(out[2]).toBeCloseTo(0, 6)
  })

  it('re-aims the lookup when the fragment is NOT at the capture point', () => {
    // Standing hard against the -X wall and looking +X: the reflection still lands on the far
    // wall at x = 2, which from the probe centre is straight ahead — NOT the +X direction a
    // naive cubemap would use (it happens to agree here) …
    const flat = parallaxCorrect([1, 0, 0], [-1.9, 1.3, 0], probe)
    expect(flat[2]).toBeCloseTo(0, 6)
    // … but off-axis it disagrees sharply. A ray leaving the -X wall at 45° hits the +X wall
    // 3.9 m away, i.e. z = +3.9 — clamped by the z wall at 2, so the hit is on the +Z wall.
    const diag = parallaxCorrect([1, 0, 1], [-1.9, 1.3, 0], probe)
    const uncorrected = Math.atan2(1, 1)
    const corrected = Math.atan2(diag[2], diag[0])
    expect(corrected).not.toBeCloseTo(uncorrected, 2)
    // The hit must be ON the box, not inside or beyond it.
    expect(Math.max(Math.abs(diag[0] + 0) / 2, Math.abs(diag[2]) / 2)).toBeCloseTo(1, 5)
  })

  it('always lands on the box surface, for every axis-aligned direction', () => {
    const origins: [number, number, number][] = [
      [0, 1.3, 0],
      [-1.5, 0.4, 1.2],
      [1.99, 2.5, -1.99],
    ]
    const dirs: [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0.3, 0.6, -0.7],
    ]
    for (const o of origins) {
      for (const d of dirs) {
        const v = parallaxCorrect(d, o, probe)
        const hit = [v[0] + probe.center[0], v[1] + probe.center[1], v[2] + probe.center[2]]
        const onFace =
          Math.abs(hit[0] - probe.boxMin[0]) < 1e-3 ||
          Math.abs(hit[0] - probe.boxMax[0]) < 1e-3 ||
          Math.abs(hit[1] - probe.boxMin[1]) < 1e-3 ||
          Math.abs(hit[1] - probe.boxMax[1]) < 1e-3 ||
          Math.abs(hit[2] - probe.boxMin[2]) < 1e-3 ||
          Math.abs(hit[2] - probe.boxMax[2]) < 1e-3
        expect(onFace).toBe(true)
      }
    }
  })

  it('never returns NaN for a ray exactly parallel to an axis', () => {
    // Division by a zero component is the classic way this shader produces a black fragment.
    const v = parallaxCorrect([0, 0, 1], [0, 1.3, 0], probe)
    expect(v.every(Number.isFinite)).toBe(true)
  })

  it('clamps a fragment OUTSIDE its own box to the capture point instead of the far wall', () => {
    // A mesh assigned by centroid can overhang its room. A negative intersection would sample
    // the opposite side of the room, which reads as a reflection pointing the wrong way.
    const v = parallaxCorrect([1, 0, 0], [5, 1.3, 0], probe)
    expect(v[0]).toBeCloseTo(5, 6)
  })
})

describe('the roomProbes flag', () => {
  it('is a simple-tier default-on fidelity flag, live in BOTH UI modes', () => {
    // `tier: 'simple'` is the load-bearing claim: this improves the DEFAULT look, and
    // meta-rule (xiii) says a default-look change must not sit behind a pro flag. So unlike a
    // pro feature, it must be ON in Simple as well as Pro.
    expect(FEATURE_FLAGS.roomProbes.tier).toBe('simple')
    expect(FEATURE_FLAGS.roomProbes.default).toBe(true)
    expect(FEATURE_FLAGS.roomProbes.devOnly).toBeUndefined()
    expect(resolveFlags(false, {}, false, 'simple').roomProbes).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').roomProbes).toBe(true)
  })

  it('stays ON in a view-only showroom session — a visitor gets the full render', () => {
    expect(resolveFlags(false, {}, false, 'simple', true).roomProbes).toBe(true)
  })

  it('can be switched off as a kill switch, in either mode', () => {
    // Overrides only reach a PRIVILEGED session (dev or admin) — `resolve.ts`'s branch order.
    expect(resolveFlags(true, { roomProbes: false }, false, 'pro').roomProbes).toBe(false)
    expect(resolveFlags(true, { roomProbes: false }, false, 'simple').roomProbes).toBe(false)
  })
})

describe('probeVramMb', () => {
  it('prices a probe set the way PMREMGenerator allocates one', () => {
    // 3 * max(256,112) x 4*256 x RGBA16F = 768 x 1024 x 8 B = 6.29 MB per room.
    expect(probeVramMb(256, 1)).toBeCloseTo(6.0, 1)
    expect(probeVramMb(256, 3)).toBeCloseTo(18.0, 1)
    // 192 floors to a 128 cube, which is a quarter of the cost — the realistic/weak saving.
    expect(probeVramMb(192, 1)).toBeCloseTo(probeVramMb(128, 1), 6)
    expect(probeVramMb(128, 1)).toBeLessThan(probeVramMb(256, 1) / 3)
  })

  it('is zero rooms, zero cost', () => {
    expect(probeVramMb(256, 0)).toBe(0)
  })
})
