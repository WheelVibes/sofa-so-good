import type { BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import {
  EXTRUDE_PRESETS,
  extrudeGeometry,
  LOFT_PRESETS,
  type ProfilePoint,
  SWEEP_PATH_POINT_PRESETS,
  SWEEP_PATHS,
  SWEEP_PROFILES,
} from './shapeProfiles'
import { loftGeometry, shellBoxGeometry, shellExtrudeGeometry, sweepGeometry } from './shellLoft'

/** Assert a geometry is non-degenerate: real vertex count, all-finite positions
 *  + normals, and a positive-extent bounding box. */
function expectSaneGeometry(geo: BufferGeometry) {
  const pos = geo.getAttribute('position')
  expect(pos.count).toBeGreaterThan(0)
  for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true)
  const nor = geo.getAttribute('normal')
  expect(nor).toBeTruthy()
  for (let i = 0; i < nor.array.length; i++) expect(Number.isFinite(nor.array[i])).toBe(true)
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  expect(bb.max.x - bb.min.x).toBeGreaterThan(0)
  expect(bb.max.y - bb.min.y).toBeGreaterThan(0)
  expect(bb.max.z - bb.min.z).toBeGreaterThan(0)
}

function extent(geo: BufferGeometry) {
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  return { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z }
}

describe('sweepGeometry', () => {
  it('every profile × path combination builds sane geometry', () => {
    for (const profile of SWEEP_PROFILES) {
      for (const path of SWEEP_PATHS) {
        // 'custom' with no customPath falls back to the straight preset — still sane.
        const geo = sweepGeometry(profile, path, 0.5, 0.06)
        expectSaneGeometry(geo)
        expect(geo.getAttribute('uv')).toBeTruthy()
      }
    }
  }, 20000)

  it('a custom drawn path sweeps within the path-extent bbox', () => {
    // S-curve normalized [-0.5,0.5] × path extent 0.8 → bbox roughly ±0.4 in X/Z.
    const geo = sweepGeometry(
      'circle',
      'custom',
      0.8,
      0.05,
      undefined,
      SWEEP_PATH_POINT_PRESETS['s-curve'],
    )
    expectSaneGeometry(geo)
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    // Tube radius adds a hair; the path spans ~0.8 in X (−0.4…0.4) and bends in Z.
    expect(bb.max.x - bb.min.x).toBeGreaterThan(0.6)
    expect(bb.max.x).toBeLessThanOrEqual(0.5)
    expect(bb.min.x).toBeGreaterThanOrEqual(-0.5)
    expect(bb.max.z - bb.min.z).toBeGreaterThan(0.2)
  })

  it("custom path only applies when path === 'custom' (preset otherwise)", () => {
    // With path 'ring' the customPath is ignored → the ring preset is closed.
    const ring = sweepGeometry(
      'circle',
      'ring',
      0.5,
      0.05,
      undefined,
      SWEEP_PATH_POINT_PRESETS['s-curve'],
    )
    expectSaneGeometry(ring)
  })
})

describe('shellBoxGeometry', () => {
  it('carves a measurable inner cavity (hollow, open top)', () => {
    const w = 0.5
    const h = 0.4
    const d = 0.5
    const t = 0.03
    const geo = shellBoxGeometry(w, h, d, t)
    expectSaneGeometry(geo)
    // Bbox still tracks the outer w×h×d.
    const e = extent(geo)
    expect(e.x).toBeCloseTo(w, 2)
    expect(e.y).toBeCloseTo(h, 2)
    expect(e.z).toBeCloseTo(d, 2)
    // The cavity exists: some vertices sit on the INNER wall face (|x| ≈ w/2 − t)
    // and the cavity floor sits above the outer bottom by the wall thickness.
    const pos = geo.getAttribute('position')
    let sawInnerX = false
    let cavityFloorY = -Infinity
    let minY = Infinity
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      if (Math.abs(Math.abs(x) - (w / 2 - t)) < 1e-3) sawInnerX = true
      minY = Math.min(minY, y)
      // The cavity floor is the top face of the bottom slab at −h/2 + t.
      if (Math.abs(y - (-h / 2 + t)) < 1e-3) cavityFloorY = -h / 2 + t
    }
    expect(sawInnerX).toBe(true)
    expect(cavityFloorY).toBeCloseTo(-h / 2 + t, 3)
    expect(minY).toBeCloseTo(-h / 2, 3)
  })

  it('shell 0 or too-thick falls back to a solid box (never degenerate)', () => {
    expectSaneGeometry(shellBoxGeometry(0.4, 0.4, 0.4, 0))
    expectSaneGeometry(shellBoxGeometry(0.2, 0.4, 0.2, 5))
  })
})

describe('shellExtrudeGeometry', () => {
  it('hollows a rounded-rect prism, wall thickness measurable', () => {
    const geo = shellExtrudeGeometry(EXTRUDE_PRESETS['rounded-rect'], 0.4, 0.3, 0.2, 0.03)
    expectSaneGeometry(geo)
    const e = extent(geo)
    expect(e.x).toBeLessThanOrEqual(0.42)
    expect(e.y).toBeLessThanOrEqual(0.32)
    expect(e.z).toBeCloseTo(0.2, 2)
    // A hollow ring has more vertices than the equivalent solid extrude (inner
    // wall + outer wall + floor).
    const solid = extrudeGeometry(EXTRUDE_PRESETS['rounded-rect'], 0.4, 0.3, 0.2, 0)
    expect(geo.getAttribute('position').count).toBeGreaterThan(solid.getAttribute('position').count)
  })

  it('falls back to a solid extrude when the outline is too concave for the wall', () => {
    // A big wall thickness on the L outline collapses the inset → solid fallback.
    const geo = shellExtrudeGeometry(EXTRUDE_PRESETS['l-shape'], 0.3, 0.3, 0.2, 0.2)
    expectSaneGeometry(geo)
  })
})

/** Sample a centred circle of `n` points, radius `r` (normalized), CCW. */
function circleOutline(n: number, r = 0.5): ProfilePoint[] {
  const pts: ProfilePoint[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([r * Math.cos(a), r * Math.sin(a)])
  }
  return pts
}

/** The per-i side-wall vertical-edge stats of a loft geometry (walls are the
 *  first N×6 non-indexed vertices: each edge's group starts with B[i], T[i]). */
function wallEdgeStats(geo: BufferGeometry, n: number) {
  const pos = geo.getAttribute('position')
  let maxHoriz = 0 // horizontal (XZ) distance between paired B[i] and T[i]
  let minLen = Infinity
  let maxLen = 0
  for (let i = 0; i < n; i++) {
    const base = i * 6
    const bx = pos.getX(base)
    const by = pos.getY(base)
    const bz = pos.getZ(base)
    const tx = pos.getX(base + 1)
    const ty = pos.getY(base + 1)
    const tz = pos.getZ(base + 1)
    maxHoriz = Math.max(maxHoriz, Math.hypot(bx - tx, bz - tz))
    const len = Math.hypot(bx - tx, by - ty, bz - tz)
    minLen = Math.min(minLen, len)
    maxLen = Math.max(maxLen, len)
  }
  return { maxHoriz, minLen, maxLen }
}

describe('loftGeometry', () => {
  it('builds a closed lofted body with outward caps (round → square)', () => {
    const { bottom, top } = LOFT_PRESETS['round-square']
    const geo = loftGeometry(bottom, top, 0.4, 0.5, 0.4)
    expectSaneGeometry(geo)
    expect(geo.getAttribute('uv')).toBeTruthy()
    const e = extent(geo)
    expect(e.x).toBeCloseTo(0.4, 1)
    expect(e.y).toBeCloseTo(0.5, 2)
    expect(e.z).toBeCloseTo(0.4, 1)
    // Cap winding: the lowest vertices' faces point −Y, the highest +Y. Sample the
    // averaged normal at the extreme-Y vertices.
    const pos = geo.getAttribute('position')
    const nor = geo.getAttribute('normal')
    let bottomNy = 0
    let bottomN = 0
    let topNy = 0
    let topN = 0
    const hy = 0.25
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const ny = nor.getY(i)
      if (Math.abs(y + hy) < 1e-3 && ny < -0.5) {
        bottomNy += ny
        bottomN++
      }
      if (Math.abs(y - hy) < 1e-3 && ny > 0.5) {
        topNy += ny
        topN++
      }
    }
    // Both caps must contribute down/up-facing normals (no inverted faces).
    expect(bottomN).toBeGreaterThan(0)
    expect(topN).toBeGreaterThan(0)
    expect(bottomNy / bottomN).toBeLessThan(0)
    expect(topNy / topN).toBeGreaterThan(0)
  })

  it('resamples mismatched point counts and stays sane', () => {
    const bottom: ProfilePoint[] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]
    // A finer 12-point top gets resampled down to the 4-point bottom's count.
    const top: ProfilePoint[] = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2
      return [0.3 * Math.cos(a), 0.3 * Math.sin(a)] as ProfilePoint
    })
    expectSaneGeometry(loftGeometry(bottom, top, 0.4, 0.4, 0.4))
  })

  it('falls back to a preset for an invalid profile (no crash)', () => {
    expectSaneGeometry(loftGeometry([], [], 0.3, 0.4, 0.3))
  })

  it('a CW-authored top lofts to the SAME untwisted body as a CCW top (no winding twist)', () => {
    const N = 16
    const ccw = circleOutline(N)
    const cw = [...ccw].reverse() // same ring, opposite winding
    const w = 0.4
    const h = 0.5
    const d = 0.4
    // Identical cross-sections top & bottom → the side walls must be VERTICAL
    // (each paired B[i]→T[i] edge has zero horizontal offset and length h).
    const both = loftGeometry(ccw, ccw, w, h, d)
    const mixed = loftGeometry(ccw, cw, w, h, d)
    const b = wallEdgeStats(both, N)
    const m = wallEdgeStats(mixed, N)
    // No twist: paired vertices sit directly above one another.
    expect(b.maxHoriz).toBeLessThan(1e-5)
    expect(m.maxHoriz).toBeLessThan(1e-5)
    // Uniform vertical edge length ≈ h for BOTH windings (a twist would stretch
    // the diagonal edges well beyond h).
    for (const s of [b, m]) {
      expect(s.minLen).toBeCloseTo(h, 4)
      expect(s.maxLen).toBeCloseTo(h, 4)
    }
  })
})
