import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/lightmapUv.blender.json'
import { computeBoxAtlasUv, LIGHTMAP_UV_MARGIN } from './lightmapUv'

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
