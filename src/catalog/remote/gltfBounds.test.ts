import { describe, expect, it } from 'vitest'
import { gltfJsonFootprint } from './gltfBounds'

/** A one-mesh glTF whose POSITION accessor spans the given min/max. */
const oneMesh = (min: number[], max: number[]) => ({
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ min, max }],
})

describe('gltfJsonFootprint', () => {
  it('derives w/d/h from a single POSITION accessor min/max', () => {
    // x:[-0.5,0.5]=1.0 w, y:[0,0.84]=0.84 h, z:[-0.25,0.25]=0.5 d
    const fp = gltfJsonFootprint(oneMesh([-0.5, 0, -0.25], [0.5, 0.84, 0.25]))
    expect(fp).toEqual({ w: 1, h: 0.84, d: 0.5 })
  })

  it('unions bounds across multiple meshes / primitives', () => {
    const json = {
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 } }] },
        { primitives: [{ attributes: { POSITION: 1 } }] },
      ],
      accessors: [
        { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
        { min: [-1, 0, -0.2], max: [0.2, 2, 1] }, // extends -x, +y, +z
      ],
    }
    const fp = gltfJsonFootprint(json)
    // x:[-1,0.5]=1.5, y:[0,2]=2, z:[-0.5,1]=1.5
    expect(fp).toEqual({ w: 1.5, h: 2, d: 1.5 })
  })

  it('returns undefined when no POSITION accessor min/max is present', () => {
    expect(gltfJsonFootprint({ meshes: [{ primitives: [{ attributes: {} }] }] })).toBeUndefined()
    expect(
      gltfJsonFootprint({
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{}],
      }),
    ).toBeUndefined()
    expect(gltfJsonFootprint({})).toBeUndefined()
    expect(gltfJsonFootprint(null)).toBeUndefined()
  })

  it('rejects absurd (non-metre) scales — falls back to undefined', () => {
    // Authored in centimetres: a 1.5 m chair becomes ~150 units.
    expect(gltfJsonFootprint(oneMesh([-75, 0, -75], [75, 150, 75]))).toBeUndefined()
    // Sub-millimetre / degenerate.
    expect(gltfJsonFootprint(oneMesh([0, 0, 0], [0.001, 0.001, 0.001]))).toBeUndefined()
  })

  it('clamps a near-flat axis to the floor dimension', () => {
    // A rug: tall/wide but ~0 thick.
    const fp = gltfJsonFootprint(oneMesh([-1, 0, -1], [1, 0.01, 1]))
    expect(fp).toEqual({ w: 2, h: 0.05, d: 2 })
  })

  it('is idempotent on an already-metre footprint (no rescale)', () => {
    const fp = gltfJsonFootprint(oneMesh([-1, 0, -0.4], [1, 0.45, 0.4]))
    expect(fp).toEqual({ w: 2, h: 0.45, d: 0.8 })
  })
})
