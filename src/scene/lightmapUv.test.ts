import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/lightmapUv.blender.json'
import { ceilingClampV, computeBoxAtlasUv, LIGHTMAP_UV_MARGIN } from './lightmapUv'

/**
 * The whole design of item (w)'s bake rests on one claim: the app can regenerate Blender's
 * lightmap UV layout exactly, so a baked `aoMap` needs no UV table shipped beside it. A pair of
 * implementations in two languages is worth nothing unless that is actually true, so these tests
 * hold the TypeScript against a fixture emitted by `bake_material.py:make_box_uvs` itself
 * (`__fixtures__/lightmapUv.blender.json`, a real 24-vertex shell mesh from an exported plan).
 */

interface Fixture {
  object: string
  vertices: number[][]
  polygons: { normal: number[]; loops: { v: number; uv: number[] }[] }[]
}
const fx = fixture as Fixture

function flatten(f: Fixture) {
  const positions = new Float32Array(f.vertices.length * 3)
  f.vertices.forEach((v, i) => {
    positions.set(v, i * 3)
  })
  const indices: number[] = []
  for (const poly of f.polygons) {
    expect(poly.loops).toHaveLength(3)
    indices.push(...poly.loops.map((l) => l.v))
  }
  return { positions, indices: new Uint32Array(indices) }
}

describe('computeBoxAtlasUv', () => {
  it('reproduces the Blender fixture to 1e-5 on every loop', () => {
    const { positions, indices } = flatten(fx)
    const { uv, conflicts } = computeBoxAtlasUv({ positions, indices })
    expect(conflicts).toBe(0)
    let checked = 0
    for (const poly of fx.polygons) {
      for (const loop of poly.loops) {
        expect(uv[loop.v * 2]).toBeCloseTo(loop.uv[0], 5)
        expect(uv[loop.v * 2 + 1]).toBeCloseTo(loop.uv[1], 5)
        checked += 1
      }
    }
    // Guard the guard: a fixture that silently lost its polygons would pass vacuously.
    expect(checked).toBe(36)
  })

  it('reports no conflicts on the shell mesh, so a per-vertex attribute can carry the layout', () => {
    // This is the property that makes `uv1` viable at all. Box and plane geometries duplicate
    // their corners per face; a mesh that shared them across a normal boundary would need its
    // faces split before baking, and would report conflicts here rather than mapping wrongly.
    const { positions, indices } = flatten(fx)
    expect(computeBoxAtlasUv({ positions, indices }).conflicts).toBe(0)
  })

  it('keeps every UV inside its own slot, margin included', () => {
    const { positions, indices } = flatten(fx)
    const { uv } = computeBoxAtlasUv({ positions, indices })
    const m = LIGHTMAP_UV_MARGIN
    for (let i = 0; i < uv.length; i += 2) {
      const col = Math.floor(uv[i] * 3)
      const row = Math.floor(uv[i + 1] * 2)
      expect(uv[i]).toBeGreaterThanOrEqual((col + m) / 3 - 1e-6)
      expect(uv[i]).toBeLessThanOrEqual((col + 1 - m) / 3 + 1e-6)
      expect(uv[i + 1]).toBeGreaterThanOrEqual((row + m) / 2 - 1e-6)
      expect(uv[i + 1]).toBeLessThanOrEqual((row + 1 - m) / 2 + 1e-6)
    }
  })

  it('sends the six faces of a unit cube to six different slots', () => {
    // Non-indexed, and built here rather than imported, so the slot mapping is pinned
    // independently of what any exporter happens to produce.
    const q = (a: number[], b: number[], c: number[], d: number[]) => [
      ...a,
      ...b,
      ...c,
      ...a,
      ...c,
      ...d,
    ]
    const positions = new Float32Array([
      ...q([1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]), // +X
      ...q([0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]), // −X
      ...q([0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]), // +Y
      ...q([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]), // −Y
      ...q([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]), // +Z
      ...q([0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]), // −Z
    ])
    const { uv, conflicts } = computeBoxAtlasUv({ positions, indices: null })
    expect(conflicts).toBe(0)
    const slots = new Set<string>()
    for (let i = 0; i < uv.length; i += 2) {
      slots.add(`${Math.floor(uv[i] * 3)},${Math.floor(uv[i + 1] * 2)}`)
    }
    expect(slots.size).toBe(6)
  })

  it('maps a zero-extent axis to 0 instead of NaN', () => {
    // A floor plane has no thickness, so one axis has zero extent and the naive
    // normalisation would divide by zero for every one of its vertices.
    const positions = new Float32Array([0, 0, 0, 2, 0, 0, 2, 0, 3, 0, 0, 3])
    const { uv } = computeBoxAtlasUv({ positions, indices: new Uint32Array([0, 1, 2, 0, 2, 3]) })
    expect([...uv].every(Number.isFinite)).toBe(true)
  })
})

describe('mirror-slot resolution from the bake index (v0.31.7.99)', () => {
  // One triangle at (0,0,0),(1,0,0),(0,0,1). e1 x e2 = (0,-1,0), so the dominant
  // axis is Y with a NEGATIVE sign: the computed slot is [col 1, row 1]. Derived
  // rather than assumed -- the first version of this test guessed row 0 and
  // failed, which is the same winding ambiguity the feature exists to resolve.
  const upTri = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    indices: null,
  }
  const slotOfUv = (uv: Float32Array) => [Math.floor(uv[0] * 3), Math.floor(uv[1] * 2)] as const

  it('leaves the computed slot alone when the bake filled it', () => {
    const a = computeBoxAtlasUv({ ...upTri, occupiedSlots: [[1, 1]] })
    expect(slotOfUv(a.uv)).toEqual([1, 1])
    expect(a.flipped).toBe(0)
  })

  it('MIRRORS the row when the computed slot is empty and the mirror is filled', () => {
    // The defect this fixes: the bake read Blender's `poly.normal` and put the
    // data in the other row; the runtime's winding disagrees; the lookup lands on
    // an empty slot and the surface renders solid black -- `v0.31.7.98` measured
    // the whole ceiling and the upper wall bands exactly that way.
    const b = computeBoxAtlasUv({ ...upTri, occupiedSlots: [[1, 0]] })
    expect(slotOfUv(b.uv)).toEqual([1, 0])
    expect(b.flipped).toBe(1)
  })

  it('leaves the slot alone when NEITHER row is filled, so a genuine miss stays visible', () => {
    // Relocating here would hide a real gap in the bake behind a plausible-looking
    // lookup. A miss must stay a miss.
    const c = computeBoxAtlasUv({ ...upTri, occupiedSlots: [[2, 0]] })
    expect(slotOfUv(c.uv)).toEqual([1, 1])
    expect(c.flipped).toBe(0)
  })

  it('behaves exactly as before when the index carries no slots', () => {
    // Every map baked before v0.31.7.99 has no `slots` field.
    const before = computeBoxAtlasUv(upTri)
    const withNull = computeBoxAtlasUv({ ...upTri, occupiedSlots: null })
    const withEmpty = computeBoxAtlasUv({ ...upTri, occupiedSlots: [] })
    expect([...withNull.uv]).toEqual([...before.uv])
    expect([...withEmpty.uv]).toEqual([...before.uv])
    expect(before.flipped).toBe(0)
  })
})

describe("computeBoxAtlasUv — a donor mesh's bounds (LIGHTMAP-NEIGHBOUR-INHERIT)", () => {
  /** A 1 m square facing −Z, i.e. slot column 2. */
  const quad = (x0: number, x1: number, y0: number, y1: number, z: number) => ({
    positions: new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]),
    indices: [0, 1, 2, 0, 2, 3],
  })

  it('places a sub-region of the donor at its own place on the donor', () => {
    // A 0.1 m strip at the LEFT end of a 3 m donor must land near u = 0 of the slot, not fill it.
    const donor = { min: [0, 0, 0] as const, size: [3, 2.6, 0.1] as const }
    const left = computeBoxAtlasUv({ ...quad(0, 0.1, 0, 2.6, 0), bounds: donor })
    const right = computeBoxAtlasUv({ ...quad(2.9, 3, 0, 2.6, 0), bounds: donor })
    const uOf = (uv: Float32Array) => uv[0]
    expect(uOf(left.uv)).toBeLessThan(uOf(right.uv))
    // Without the bounds each strip normalises to its OWN extent and both land identically —
    // which is the bug this option exists to avoid.
    const leftOwn = computeBoxAtlasUv(quad(0, 0.1, 0, 2.6, 0))
    const rightOwn = computeBoxAtlasUv(quad(2.9, 3, 0, 2.6, 0))
    expect(uOf(leftOwn.uv)).toBeCloseTo(uOf(rightOwn.uv), 6)
  })

  it('clamps a receiver that overhangs its donor into the donor slot', () => {
    const donor = { min: [0, 0, 0] as const, size: [3, 2.6, 0.1] as const }
    const over = computeBoxAtlasUv({ ...quad(-0.5, 3.5, -0.2, 2.8, 0), bounds: donor })
    // The slot is column 2, row 0 or 1: u in [2/3, 1] with the 0.04 margin inset.
    for (let i = 0; i < over.uv.length; i += 2) {
      expect(over.uv[i]).toBeGreaterThanOrEqual(2 / 3)
      expect(over.uv[i]).toBeLessThanOrEqual(1)
    }
  })

  it('is exactly the old result when no bounds are given', () => {
    const q = quad(0, 1, 0, 1, 0)
    const before = computeBoxAtlasUv(q)
    const same = computeBoxAtlasUv({ ...q, bounds: undefined })
    expect([...same.uv]).toEqual([...before.uv])
  })
})

describe('ceilingClampV (WALL-HEAD-CLAMP)', () => {
  /** The real bath2 south wall face: a 0.91 x 2.6 m plane in atlas row 0, ceiling at 2.4. */
  const wallUv = (rowLo: number) => {
    // v runs with height across the row's margin-inset band.
    const v = (y: number) => rowLo + (0.04 + (y / 2.6) * 0.92) / 2
    return {
      y: [0, 0, 2.6, 2.6],
      uv: [0.7, v(0), 0.97, v(0), 0.97, v(2.6), 0.7, v(2.6)],
      v,
    }
  }

  it('clamps a wall that runs past its room ceiling, short of the ceiling', () => {
    const { y, uv, v } = wallUv(0)
    const r = ceilingClampV(y, uv, 2.4)
    expect(r).not.toBeNull()
    const [lo, hi] = r as [number, number]
    expect(lo).toBe(0)
    expect(hi).toBeLessThan(v(2.4))
    // …and by only a couple of texels, not by a wall band anyone could see.
    expect(v(2.4) - hi).toBeLessThan(0.01)
  })

  it('refuses a wall whose room ceiling is its own top — nothing to clamp', () => {
    const { y, uv } = wallUv(0)
    expect(ceilingClampV(y, uv, 2.6)).toBeNull()
  })

  it('clamps the OTHER end when v runs the other way (mirror row)', () => {
    // A face whose in-slot b decreases with height: v falls as y rises, so the plenum sits at the
    // LOW end of the band and the lower bound is what must move.
    const v = (y: number) => 0.5 + (0.04 + (1 - y / 2.6) * 0.92) / 2
    const y = [0, 0, 2.6, 2.6]
    const uv = [0.7, v(0), 0.97, v(0), 0.97, v(2.6), 0.7, v(2.6)]
    const r = ceilingClampV(y, uv, 2.4)
    expect(r).not.toBeNull()
    const [lo, hi] = r as [number, number]
    expect(hi).toBe(1)
    expect(lo).toBeGreaterThan(v(2.4))
  })

  it('refuses a mesh whose vertices span BOTH atlas rows', () => {
    // A box has faces in row 0 and row 1; one scalar range cannot serve them.
    const y = [0, 0, 2.6, 2.6]
    const uv = [0.7, 0.1, 0.97, 0.1, 0.97, 0.9, 0.7, 0.9]
    expect(ceilingClampV(y, uv, 2.4)).toBeNull()
  })

  it('refuses a horizontal plane, whose v does not track height at all', () => {
    const y = [2.6, 2.6, 2.6, 2.6]
    const uv = [0.7, 0.1, 0.97, 0.1, 0.97, 0.4, 0.7, 0.4]
    expect(ceilingClampV(y, uv, 2.4)).toBeNull()
  })

  it('refuses a mesh whose v is not AFFINE in height', () => {
    const y = [0, 1.3, 2.6, 2.6]
    const uv = [0.7, 0.02, 0.97, 0.4, 0.97, 0.45, 0.7, 0.45]
    expect(ceilingClampV(y, uv, 2.4)).toBeNull()
  })

  it('refuses a sentinel-carrying mesh (uv1 = -1/-2)', () => {
    const y = [0, 0, 2.6, 2.6]
    const uv = [-2, -2, -2, -2, -2, -2, -2, -2]
    expect(ceilingClampV(y, uv, 2.4)).toBeNull()
  })
})
