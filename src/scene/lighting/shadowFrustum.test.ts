import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom, PlanWall } from '../../floorplan/types'
import {
  planShadowBounds,
  SHADOW_MAP_MIN,
  SHADOW_TEXEL_TARGET_M,
  shadowFrustumForPlan,
  shadowMapSizeForExtent,
} from './shadowFrustum'

const wall = (sx: number, sz: number, ex: number, ez: number): PlanWall => ({
  id: `w-${sx}-${sz}`,
  start: [sx, sz],
  end: [ex, ez],
  thickness: 'external',
})

const room = (x: number, z: number, w: number, d: number): PlanRoom => ({
  id: `r-${x}-${z}`,
  name: 'R',
  origin: [x, z],
  width: w,
  depth: d,
})

const plan = (walls: PlanWall[], rooms: PlanRoom[], extent: [number, number]): FloorPlan => ({
  id: 'p',
  name: 'P',
  ceilingHeight: 2.6,
  extent,
  walls,
  openings: [],
  rooms,
})

describe('planShadowBounds', () => {
  it('wraps a plan that starts at the origin', () => {
    const p = plan([wall(0, 0, 8, 0), wall(8, 0, 8, 6)], [], [8, 6])
    expect(planShadowBounds(p)).toEqual({ minX: 0, minZ: 0, maxX: 8, maxZ: 6 })
  })

  it('tracks an offset plan (non-zero min) from walls + rooms', () => {
    const p = plan([wall(10, 10, 20, 10)], [room(12, 12, 4, 4)], [30, 30])
    expect(planShadowBounds(p)).toEqual({ minX: 10, minZ: 10, maxX: 20, maxZ: 16 })
  })

  it('falls back to the declared extent for an empty plan', () => {
    expect(planShadowBounds(plan([], [], [5, 7]))).toEqual({ minX: 0, minZ: 0, maxX: 5, maxZ: 7 })
  })

  it('includes a room L-shape extension', () => {
    const r: PlanRoom = { ...room(0, 0, 4, 4), extension: { offset: [4, 0], width: 3, depth: 2 } }
    expect(planShadowBounds(plan([], [r], [4, 4]))).toEqual({
      minX: 0,
      minZ: 0,
      maxX: 7,
      maxZ: 4,
    })
  })
})

describe('shadowFrustumForPlan', () => {
  it('centres on the plan and never shrinks below the default minHalf', () => {
    const f = shadowFrustumForPlan(plan([wall(0, 0, 4, 0)], [room(0, 0, 4, 3)], [4, 3]))
    expect(f.center).toEqual([2, 0, 1.5])
    expect(f.halfExtent).toBe(9.5) // small plan → clamped up to the default margin
  })

  it('grows the half-extent to wrap a large plan (+ margin)', () => {
    const f = shadowFrustumForPlan(plan([], [room(0, 0, 30, 20)], [30, 20]), { maxHalf: 100 })
    // largest half-span = 30/2 = 15, + 2.5 margin
    expect(f.halfExtent).toBeCloseTo(17.5)
    expect(f.center).toEqual([15, 0, 10])
  })

  it('re-centres on an offset plan so shadows are not aimed at empty origin', () => {
    const f = shadowFrustumForPlan(plan([], [room(40, 40, 6, 6)], [50, 50]))
    expect(f.center).toEqual([43, 0, 43])
  })

  it('caps the half-extent so shadow texels do not blow out', () => {
    const f = shadowFrustumForPlan(plan([], [room(0, 0, 200, 200)], [200, 200]))
    expect(f.halfExtent).toBe(40)
  })
})

describe('shadowMapSizeForExtent (SHADOW-TEXEL)', () => {
  it('passes shadows-off straight through', () => {
    // 0 means "this tier renders no sun shadows", not "a ceiling to scale into".
    expect(shadowMapSizeForExtent(9.5, 0)).toBe(0)
  })

  it('holds texel density roughly constant as the plan grows', () => {
    const density = (h: number, max: number) => (2 * h) / shadowMapSizeForExtent(h, max)
    // Same tier ceiling, 4x the plan: density must not collapse by 4x the way a
    // fixed per-tier resolution would.
    const small = density(9.5, 4096)
    const large = density(40, 4096)
    expect(large / small).toBeLessThan(1.2)
  })

  it('lands at ~20mm/texel on the default flat', () => {
    const size = shadowMapSizeForExtent(9.5, 4096)
    expect((2 * 9.5) / size).toBeLessThanOrEqual(SHADOW_TEXEL_TARGET_M)
    expect((2 * 9.5) / size).toBeGreaterThan(SHADOW_TEXEL_TARGET_M / 2)
  })

  it('never exceeds the tier ceiling', () => {
    expect(shadowMapSizeForExtent(40, 1024)).toBeLessThanOrEqual(1024)
    expect(shadowMapSizeForExtent(40, 2048)).toBeLessThanOrEqual(2048)
  })

  it('spends LESS than the tier allows when the plan is small', () => {
    // The whole point: Maximum on the default flat no longer burns a 4096 map.
    expect(shadowMapSizeForExtent(9.5, 4096)).toBeLessThan(4096)
  })

  it('scales UP for a big plan, where density genuinely needs it', () => {
    expect(shadowMapSizeForExtent(40, 4096)).toBeGreaterThan(shadowMapSizeForExtent(9.5, 4096))
  })

  it('returns powers of two', () => {
    for (const h of [5, 9.5, 12, 20, 33, 40]) {
      const v = shadowMapSizeForExtent(h, 4096)
      expect(Number.isInteger(Math.log2(v))).toBe(true)
    }
  })

  it('never drops below the floor, even for a tiny plan', () => {
    expect(shadowMapSizeForExtent(0.5, 4096)).toBe(SHADOW_MAP_MIN)
  })

  it('honours a tier ceiling below the floor', () => {
    expect(shadowMapSizeForExtent(9.5, 256)).toBe(256)
  })

  it('survives degenerate extents', () => {
    expect(shadowMapSizeForExtent(0, 4096)).toBe(SHADOW_MAP_MIN)
    expect(shadowMapSizeForExtent(Number.NaN, 4096)).toBe(SHADOW_MAP_MIN)
    expect(shadowMapSizeForExtent(-5, 4096)).toBe(SHADOW_MAP_MIN)
  })
})
