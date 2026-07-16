import { BoxGeometry, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import {
  bevelledBoxGeometry,
  closeProfile,
  dedupeProfile,
  EXTRUDE_PRESETS,
  extrudeGeometry,
  isSmoothPoint,
  LATHE_PRESETS,
  latheGeometry,
  type ProfilePoint,
  resampleProfile,
  smoothProfile,
  validateProfilePoints,
  wedgeGeometry,
} from './shapeProfiles'

/** Does the point list contain a point (approximately) equal to `q`? */
function containsPoint(pts: ProfilePoint[], q: ProfilePoint, eps = 1e-9): boolean {
  return pts.some((p) => Math.abs(p[0] - q[0]) < eps && Math.abs(p[1] - q[1]) < eps)
}

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
    // Stage 11a: a length-3 point (the optional smooth flag) is now valid.
    expect(
      validateProfilePoints([
        [0, 0, 1],
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
    // A length-4 tuple is still malformed.
    expect(
      validateProfilePoints([
        [0, 0, 0, 0],
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

describe('smoothProfile (Stage 11a per-point smoothing)', () => {
  it('is the identity for an all-sharp profile (byte-identical migration)', () => {
    const pts: ProfilePoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    expect(smoothProfile(pts)).toEqual(pts)
    expect(smoothProfile(pts, { closed: true })).toEqual(pts)
  })

  it('returns points unchanged (stripped to 2-tuples) for < 3 points', () => {
    expect(smoothProfile([[0, 0, 1]])).toEqual([[0, 0]])
    expect(
      smoothProfile([
        [0, 0, 1],
        [1, 1, 1],
      ]),
    ).toEqual([
      [0, 0],
      [1, 1],
    ])
  })

  it('passes through EVERY original point (sharp corners + smooth points) exactly', () => {
    const pts: ProfilePoint[] = [
      [0, 0], // sharp
      [1, 0, 1], // smooth
      [2, 1], // sharp
      [1, 2, 1], // smooth
    ]
    const out = smoothProfile(pts, { closed: true })
    for (const p of pts) expect(containsPoint(out, [p[0], p[1]])).toBe(true)
  })

  it('subdivides only segments touching a smooth point; sharp→sharp stays one edge', () => {
    // open, 3 points, only the middle is smooth → both segments are subdivided.
    const pts: ProfilePoint[] = [
      [0, 0],
      [1, 1, 1],
      [2, 0],
    ]
    const subdiv = 8
    const out = smoothProfile(pts, { subdiv })
    // seg0 (sharp→smooth) + seg1 (smooth→sharp) = 2×subdiv samples, then the final
    // endpoint → 2*subdiv + 1.
    expect(out).toHaveLength(2 * subdiv + 1)
    // Every emitted point is a plain 2-tuple (the flag was consumed).
    for (const p of out) expect(p).toHaveLength(2)
  })

  it('a sharp corner is preserved exactly (no rounding) between two straight edges', () => {
    // The middle sharp corner sits between two sharp segments → emitted once, exact.
    const pts: ProfilePoint[] = [
      [0, 0, 1], // smooth
      [1, 0],
      [2, 0],
      [3, 0],
    ]
    const out = smoothProfile(pts)
    expect(containsPoint(out, [1, 0])).toBe(true)
    expect(containsPoint(out, [2, 0])).toBe(true)
  })

  it('curves an all-smooth closed loop all the way around (no faceted seam)', () => {
    // 4 smooth points → n segments (closed), each subdivided → n*subdiv samples.
    const square: ProfilePoint[] = [
      [-0.5, -0.5, 1],
      [0.5, -0.5, 1],
      [0.5, 0.5, 1],
      [-0.5, 0.5, 1],
    ]
    const subdiv = 8
    const out = smoothProfile(square, { closed: true, subdiv })
    expect(out).toHaveLength(square.length * subdiv)
    for (const p of out) {
      expect(Number.isFinite(p[0])).toBe(true)
      expect(Number.isFinite(p[1])).toBe(true)
    }
    // It passes through all four corners AND genuinely rounds between them (points
    // that lie on neither the original x nor y grid line of the square).
    for (const c of square) expect(containsPoint(out, [c[0], c[1]])).toBe(true)
    const rounded = out.filter(
      (p) => Math.abs(Math.abs(p[0]) - 0.5) > 1e-3 && Math.abs(Math.abs(p[1]) - 0.5) > 1e-3,
    )
    expect(rounded.length).toBeGreaterThan(0)
  })

  it('all output points are finite', () => {
    const out = smoothProfile(LATHE_PRESETS.vase)
    for (const p of out) {
      expect(Number.isFinite(p[0])).toBe(true)
      expect(Number.isFinite(p[1])).toBe(true)
    }
  })

  it('produces a denser, sane lathe geometry for the smooth vase preset', () => {
    const sharpCount = latheGeometry(
      LATHE_PRESETS.vase.map((p) => [p[0], p[1]] as ProfilePoint),
      32,
      0.3,
      0.5,
    ).getAttribute('position').count
    const geo = latheGeometry(smoothProfile(LATHE_PRESETS.vase), 32, 0.3, 0.5)
    expectSaneGeometry(geo)
    // The smoothed profile has many more rings → more vertices than the raw one.
    expect(geo.getAttribute('position').count).toBeGreaterThan(sharpCount)
  })

  it('the vase/bowl presets carry smooth points; turned-leg stays all-sharp', () => {
    expect(LATHE_PRESETS.vase.some(isSmoothPoint)).toBe(true)
    expect(LATHE_PRESETS.bowl.some(isSmoothPoint)).toBe(true)
    expect(LATHE_PRESETS['turned-leg'].some(isSmoothPoint)).toBe(false)
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
