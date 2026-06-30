import { describe, expect, it } from 'vitest'
import { dominantAxis, projectUv, triplanarUv } from './triplanar'

describe('triplanar projection (MAT-006b)', () => {
  it('picks the dominant world axis of a normal', () => {
    expect(dominantAxis(1, 0, 0)).toBe(0)
    expect(dominantAxis(0, 1, 0)).toBe(1)
    expect(dominantAxis(0, 0, 1)).toBe(2)
    expect(dominantAxis(-0.9, 0.1, 0.2)).toBe(0) // sign-independent
    expect(dominantAxis(0.2, 0.3, -0.8)).toBe(2)
  })

  it('projects the two non-dominant world axes, scaled to tiles', () => {
    // X-dominant (a side wall): project (z, y)
    expect(projectUv(5, 2, 3, 0, 1)).toEqual([3, 2])
    // Y-dominant (floor): project (x, z)
    expect(projectUv(5, 2, 3, 1, 1)).toEqual([5, 3])
    // Z-dominant: project (x, y)
    expect(projectUv(5, 2, 3, 2, 1)).toEqual([5, 2])
    // scale halves the tile count
    expect(projectUv(4, 2, 0, 2, 2)).toEqual([2, 1])
  })

  it('builds one UV pair per vertex for a triangle list', () => {
    // A single triangle on the z=const plane (normal +z) → Z-dominant, UV=(x,y).
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const uv = triplanarUv(pos, 1)
    expect(uv).not.toBeNull()
    expect(uv!.length).toBe(6)
    expect([...uv!]).toEqual([0, 0, 1, 0, 0, 1])
  })

  it('keeps a constant world scale across two differently-oriented faces (no stretch)', () => {
    // Tri A faces +Z (x,y projection); Tri B faces +X (z,y projection). A 1 m edge
    // maps to exactly 1 tile on both, despite different orientation.
    const pos = new Float32Array([
      // +Z face
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      // +X face
      0, 0, 0, 0, 0, 1, 0, 1, 0,
    ])
    const uv = triplanarUv(pos, 1)!
    // Tri A vertex 1 (1,0,0) → (1,0); Tri B vertex 1 (0,0,1) → (1,0). Both 1 tile.
    expect(uv[2]).toBeCloseTo(1, 6)
    expect(uv[3]).toBeCloseTo(0, 6)
    expect(uv[8]).toBeCloseTo(1, 6) // tri B v1 u
    expect(uv[9]).toBeCloseTo(0, 6)
  })

  it('returns null for a non-triangle-list length', () => {
    expect(triplanarUv(new Float32Array([0, 0, 0, 1, 1, 1]), 1)).toBeNull() // 2 verts
  })

  it('guards a zero/negative scale (treats as 1)', () => {
    const pos = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0])
    expect([...triplanarUv(pos, 0)!]).toEqual([0, 0, 2, 0, 0, 2])
  })
})
