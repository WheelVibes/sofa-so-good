import { BoxGeometry, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import {
  bevelledBoxGeometry,
  closeProfile,
  dedupeProfile,
  EXTRUDE_PRESETS,
  extrudeGeometry,
  LATHE_PRESETS,
  latheGeometry,
  type ProfilePoint,
  resampleProfile,
  SWEEP_PATHS,
  SWEEP_PROFILES,
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
        const geo = sweepGeometry(profile, path, 0.5, 0.06)
        expectSaneGeometry(geo)
        expect(geo.getAttribute('uv')).toBeTruthy()
      }
    }
  }, 20000)
})
