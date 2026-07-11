import { Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { type BoxInstance, bakeInstanceMatrix } from './InstancedBoxes'

describe('bakeInstanceMatrix', () => {
  it('bakes the instance centre into the matrix translation', () => {
    const scratch = new Object3D()
    const inst: BoxInstance = { position: [0.3, 1.2, -0.5], size: [0.1, 0.2, 0.3] }
    const m = bakeInstanceMatrix(inst, scratch)
    const pos = new Vector3().setFromMatrixPosition(m)
    expect(pos.x).toBeCloseTo(0.3, 12)
    expect(pos.y).toBeCloseTo(1.2, 12)
    expect(pos.z).toBeCloseTo(-0.5, 12)
  })

  it('bakes the instance size into the matrix scale of the unit box', () => {
    const scratch = new Object3D()
    const inst: BoxInstance = { position: [0, 0, 0], size: [0.035, 1.9, 0.042] }
    const m = bakeInstanceMatrix(inst, scratch)
    const scale = new Vector3().setFromMatrixScale(m)
    expect(scale.x).toBeCloseTo(0.035, 12)
    expect(scale.y).toBeCloseTo(1.9, 12)
    expect(scale.z).toBeCloseTo(0.042, 12)
  })

  it('produces no rotation (axis-aligned boxes only)', () => {
    const scratch = new Object3D()
    // Pre-dirty the scratch rotation; an axis-aligned bake must not rotate.
    scratch.rotation.set(0.4, 0.5, 0.6)
    const m = bakeInstanceMatrix({ position: [1, 2, 3], size: [1, 1, 1] }, scratch)
    // For a uniform unit box with no rotation the basis columns stay axis-aligned.
    const e = m.elements
    expect(e[1]).toBeCloseTo(0, 12) // X column has no Y/Z
    expect(e[2]).toBeCloseTo(0, 12)
    expect(e[4]).toBeCloseTo(0, 12) // Y column has no X/Z
    expect(e[6]).toBeCloseTo(0, 12)
    expect(e[8]).toBeCloseTo(0, 12) // Z column has no X/Y
    expect(e[9]).toBeCloseTo(0, 12)
  })

  it('reuses the scratch Object3D across instances (matrix reflects the latest)', () => {
    const scratch = new Object3D()
    bakeInstanceMatrix({ position: [1, 1, 1], size: [2, 2, 2] }, scratch)
    const m = bakeInstanceMatrix({ position: [-1, 0, 0], size: [0.5, 0.5, 0.5] }, scratch)
    const pos = new Vector3().setFromMatrixPosition(m)
    const scale = new Vector3().setFromMatrixScale(m)
    expect(pos.x).toBeCloseTo(-1, 12)
    expect(scale.x).toBeCloseTo(0.5, 12)
  })

  it('bakes an optional per-instance rotation (for tilted slats / splayed rods)', () => {
    const scratch = new Object3D()
    // A 90° rotation about Z sends the box local +X onto world +Y.
    const m = bakeInstanceMatrix(
      { position: [0, 0, 0], size: [1, 1, 1], rotation: [0, 0, Math.PI / 2] },
      scratch,
    )
    const xCol = new Vector3(m.elements[0], m.elements[1], m.elements[2])
    expect(xCol.x).toBeCloseTo(0, 12)
    expect(xCol.y).toBeCloseTo(1, 12)
    expect(xCol.z).toBeCloseTo(0, 12)
  })

  it('rotation composes as T · R · S (size innermost, matching a mesh position/rotation wrapper)', () => {
    const scratch = new Object3D()
    // A slat-like box: wide in X, thin in Y, tilted about X. The world extent
    // along local X must stay the (unrotated) half-width since X ⟂ the X-axis
    // rotation, and the translation must be exact.
    const m = bakeInstanceMatrix(
      { position: [0.2, 1.5, -0.3], size: [1.3, 0.006, 0.06], rotation: [0.5, 0, 0] },
      scratch,
    )
    const pos = new Vector3().setFromMatrixPosition(m)
    expect(pos.x).toBeCloseTo(0.2, 12)
    expect(pos.y).toBeCloseTo(1.5, 12)
    expect(pos.z).toBeCloseTo(-0.3, 12)
    const scale = new Vector3().setFromMatrixScale(m)
    // Decomposed scale recovers the original size (rotation is orthonormal).
    expect(scale.x).toBeCloseTo(1.3, 12)
    expect(scale.y).toBeCloseTo(0.006, 12)
    expect(scale.z).toBeCloseTo(0.06, 12)
  })

  it('omitted rotation still resets a dirtied scratch to identity', () => {
    const scratch = new Object3D()
    scratch.rotation.set(0.4, 0.5, 0.6)
    const m = bakeInstanceMatrix({ position: [1, 2, 3], size: [1, 1, 1] }, scratch)
    // No rotation column bleed (same invariant as the axis-aligned case).
    expect(m.elements[1]).toBeCloseTo(0, 12)
    expect(m.elements[4]).toBeCloseTo(0, 12)
    expect(m.elements[8]).toBeCloseTo(0, 12)
  })
})
