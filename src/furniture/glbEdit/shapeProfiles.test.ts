import { BoxGeometry, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import {
  bevelledBoxGeometry,
  closeProfile,
  dedupeProfile,
  EXTRUDE_PRESETS,
  extrudeGeometry,
  insetPolygon,
  LATHE_PRESETS,
  LOFT_PRESETS,
  latheGeometry,
  loftGeometry,
  type ProfilePoint,
  polygonSignedArea,
  resampleProfile,
  SWEEP_PATH_POINT_PRESETS,
  SWEEP_PATHS,
  SWEEP_PROFILES,
  shellBoxGeometry,
  shellExtrudeGeometry,
  sweepGeometry,
  validateProfilePoints,
  wedgeGeometry,
} from './shapeProfiles'

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

describe('profile helpers', () => {
  it('validateProfilePoints rejects non-arrays / short / non-finite', () => {
    expect(
      validateProfilePoints([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(true)
    expect(validateProfilePoints([[0, 0]])).toBe(false)
    expect(validateProfilePoints('nope')).toBe(false)
    expect(
      validateProfilePoints([
        [0, Number.NaN],
        [1, 1],
      ]),
    ).toBe(false)
    expect(
      validateProfilePoints([
        [0, 0, 0],
        [1, 1],
      ]),
    ).toBe(false)
  })

  it('dedupeProfile drops consecutive duplicates', () => {
    const pts: ProfilePoint[] = [
      [0, 0],
      [0, 0],
      [1, 0],
      [1, 0],
      [1, 1],
    ]
    expect(dedupeProfile(pts)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ])
  })

  it('closeProfile appends the first point only when open', () => {
    const open: ProfilePoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ]
    expect(closeProfile(open)[closeProfile(open).length - 1]).toEqual([0, 0])
    const closed: ProfilePoint[] = [
      [0, 0],
      [1, 0],
      [0, 0],
    ]
    expect(closeProfile(closed)).toHaveLength(3)
  })

  it('resampleProfile keeps endpoints and hits the target count', () => {
    const pts: ProfilePoint[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]
    const r = resampleProfile(pts, 3)
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual([0, 0])
    expect(r[2]).toEqual([4, 0])
    expect(r[1][0]).toBeCloseTo(2, 5)
  })
})

describe('bevelledBoxGeometry', () => {
  it('bevel 0 is byte-identical to a plain BoxGeometry', () => {
    const plain = new BoxGeometry(0.4, 0.3, 0.5)
    const bevelled = bevelledBoxGeometry(0.4, 0.3, 0.5, 0)
    expect(bevelled.getAttribute('position').count).toBe(plain.getAttribute('position').count)
    expect(Array.from(bevelled.getAttribute('position').array)).toEqual(
      Array.from(plain.getAttribute('position').array),
    )
  })

  it('bevel > 0 produces a rounded box with UVs, tracking size', () => {
    const geo = bevelledBoxGeometry(0.4, 0.3, 0.5, 0.05)
    expectSaneGeometry(geo)
    expect(geo.getAttribute('uv')).toBeTruthy()
    const e = extent(geo)
    expect(e.x).toBeCloseTo(0.4, 2)
    expect(e.y).toBeCloseTo(0.3, 2)
    expect(e.z).toBeCloseTo(0.5, 2)
  })

  it('clamps an over-large bevel so the box never inverts', () => {
    const geo = bevelledBoxGeometry(0.2, 0.2, 0.2, 5)
    expectSaneGeometry(geo)
  })
})

describe('wedgeGeometry', () => {
  it('bevel 0 tracks w×h×d exactly (extrude axis → X)', () => {
    const e = extent(wedgeGeometry(0.6, 0.4, 0.8, 0))
    expect(e.x).toBeCloseTo(0.6, 2)
    expect(e.y).toBeCloseTo(0.4, 2)
    expect(e.z).toBeCloseTo(0.8, 2)
  })

  it('bevel > 0 stays sane and within size', () => {
    const geo = wedgeGeometry(0.6, 0.4, 0.8, 0.03)
    expectSaneGeometry(geo)
    const e = extent(geo)
    expect(e.x).toBeLessThanOrEqual(0.62)
  })
})

describe('latheGeometry', () => {
  it('every preset builds sane geometry sized to [diameter, height]', () => {
    for (const id of Object.keys(LATHE_PRESETS)) {
      const geo = latheGeometry(LATHE_PRESETS[id], 32, 0.3, 0.5)
      expectSaneGeometry(geo)
      expect(geo.getAttribute('uv')).toBeTruthy()
      const e = extent(geo)
      // widest profile point is 1.0 → diameter == size[0]; height == size[1].
      expect(e.x).toBeLessThanOrEqual(0.31)
      expect(e.y).toBeCloseTo(0.5, 1)
    }
  })

  it('falls back to a preset for an invalid profile (no crash)', () => {
    expectSaneGeometry(latheGeometry([], 32, 0.3, 0.5))
  })
})

describe('extrudeGeometry', () => {
  it('every preset builds sane geometry roughly tracking size', () => {
    for (const id of Object.keys(EXTRUDE_PRESETS)) {
      const geo = extrudeGeometry(EXTRUDE_PRESETS[id], 0.4, 0.3, 0.1, 0.02)
      expectSaneGeometry(geo)
      expect(geo.getAttribute('uv')).toBeTruthy()
      const e = extent(geo)
      expect(e.x).toBeLessThanOrEqual(0.41)
      expect(e.y).toBeLessThanOrEqual(0.31)
      expect(e.z).toBeCloseTo(0.1, 2)
    }
  })

  it('bevel default is on (rounded rect has UVs + finite geometry)', () => {
    expectSaneGeometry(extrudeGeometry(EXTRUDE_PRESETS['rounded-rect'], 0.5, 0.4, 0.15, 0.03))
  })
})

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

describe('polygonSignedArea', () => {
  it('is positive for a CCW loop, negative for CW', () => {
    const ccw: ProfilePoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    expect(polygonSignedArea(ccw)).toBeCloseTo(1, 5)
    expect(polygonSignedArea([...ccw].reverse())).toBeCloseTo(-1, 5)
  })
})

describe('insetPolygon', () => {
  it('insets a convex square inward by delta (area shrinks, orientation kept)', () => {
    const sq: ProfilePoint[] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]
    const inner = insetPolygon(sq, 0.1)
    expect(inner).not.toBeNull()
    // A 1×1 square inset 0.1 → an 0.8×0.8 square.
    const a = Math.abs(polygonSignedArea(inner!))
    expect(a).toBeCloseTo(0.64, 2)
    // Same orientation (both CW here, as authored).
    expect(Math.sign(polygonSignedArea(inner!))).toBe(Math.sign(polygonSignedArea(sq)))
  })

  it('handles a concave L outline without self-intersecting', () => {
    // A concave L (the `l-shape` extrude preset). A modest inset stays valid.
    const inner = insetPolygon(EXTRUDE_PRESETS['l-shape'], 0.05)
    expect(inner).not.toBeNull()
    // Every point finite.
    for (const p of inner!) {
      expect(Number.isFinite(p[0])).toBe(true)
      expect(Number.isFinite(p[1])).toBe(true)
    }
    // Inset area is smaller than the original.
    expect(Math.abs(polygonSignedArea(inner!))).toBeLessThan(
      Math.abs(polygonSignedArea(EXTRUDE_PRESETS['l-shape'])),
    )
  })

  it('returns null when the inset collapses the outline (delta too large)', () => {
    const sq: ProfilePoint[] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]
    // delta ≥ half-width → the inset flips/collapses.
    expect(insetPolygon(sq, 0.6)).toBeNull()
    expect(insetPolygon(sq, 0)).toBeNull()
    expect(insetPolygon([[0, 0]], 0.1)).toBeNull()
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
})
